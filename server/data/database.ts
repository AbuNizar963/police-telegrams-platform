import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLogs,
  departmentSettings,
  InsertTelegram,
  InsertTelegramAttachment,
  telegramAttachments,
  telegrams,
  InsertUser,
  users,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return rows[0];
}

export async function getOrCreateSettings(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db.select().from(departmentSettings).limit(1);
  if (existing[0]) return existing[0];
  await db
    .insert(departmentSettings)
    .values({ configKey: "primary", updatedByUserId: userId });
  const created = await db.select().from(departmentSettings).limit(1);
  return created[0];
}

export async function allocateSerialNumber() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .insert(departmentSettings)
    .values({ configKey: "primary", serialStart: 1, nextSerial: 1 })
    .onDuplicateKeyUpdate({ set: { configKey: "primary" } });
  await db.execute(
    sql`UPDATE department_settings SET nextSerial = LAST_INSERT_ID(nextSerial) + 1 WHERE configKey = 'primary'`
  );
  const [rows] = await db.execute(sql`SELECT LAST_INSERT_ID() AS serial`);
  const serial = Number(
    (rows as unknown as Array<{ serial: number }>)[0]?.serial
  );
  if (!Number.isInteger(serial)) throw new Error("Serial allocation failed");
  return serial;
}

export async function listTelegrams(
  userId: number,
  canViewAll: boolean,
  search?: string,
  classification?: "secret" | "normal",
  priority?: "slow" | "normal" | "urgent",
  category?:
    | "criminal"
    | "administrative"
    | "traffic"
    | "security"
    | "tactical",
  status?: "pending" | "in_progress" | "resolved" | "archived"
) {
  const db = await getDb();
  if (!db) return [];
  const filters = [];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    filters.push(
      or(
        like(telegrams.subject, term),
        like(telegrams.recipient, term),
        like(telegrams.body, term),
        like(telegrams.creatorName, term),
        like(sql`CAST(${telegrams.serialNumber} AS CHAR)`, term)
      )
    );
  }
  if (classification)
    filters.push(eq(telegrams.classification, classification));
  if (priority) filters.push(eq(telegrams.priority, priority));
  if (category) filters.push(eq(telegrams.category, category));
  if (status) filters.push(eq(telegrams.status, status));
  if (!canViewAll) filters.push(eq(telegrams.createdByUserId, userId));
  return db
    .select()
    .from(telegrams)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(telegrams.createdAt))
    .limit(200);
}

export async function getTelegramById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(telegrams)
    .where(eq(telegrams.id, id))
    .limit(1);
  return rows[0];
}

export async function getTelegramByIdempotencyKey(idempotencyKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(telegrams)
    .where(eq(telegrams.idempotencyKey, idempotencyKey))
    .limit(1);
  return rows[0];
}

export async function createTelegram(input: InsertTelegram) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(telegrams).values(input);
  return getTelegramById(Number(result[0].insertId));
}

export async function createTelegramWithAttachments(
  input: InsertTelegram,
  attachments: Omit<InsertTelegramAttachment, "telegramId">[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async tx => {
    const result = await tx.insert(telegrams).values(input);
    const telegramId = Number(result[0].insertId);
    if (attachments.length > 0) {
      await tx.insert(telegramAttachments).values(
        attachments.map(attachment => ({
          ...attachment,
          telegramId,
        }))
      );
    }
    const rows = await tx
      .select()
      .from(telegrams)
      .where(eq(telegrams.id, telegramId))
      .limit(1);
    return rows[0];
  });
}

export async function listTelegramAttachments(telegramId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(telegramAttachments)
    .where(eq(telegramAttachments.telegramId, telegramId))
    .orderBy(desc(telegramAttachments.createdAt));
}

export async function getTelegramAttachmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select({
      attachment: telegramAttachments,
      telegramOwnerId: telegrams.createdByUserId,
    })
    .from(telegramAttachments)
    .innerJoin(telegrams, eq(telegramAttachments.telegramId, telegrams.id))
    .where(eq(telegramAttachments.id, id))
    .limit(1);
  return rows[0];
}

export async function updateTelegramStatus(
  id: number,
  status: "pending" | "in_progress" | "resolved" | "archived",
  archivedAt?: Date | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .update(telegrams)
    .set({ status, archivedAt: archivedAt ?? null })
    .where(eq(telegrams.id, id));
  return getTelegramById(id);
}

export async function writeAuditLog(input: typeof auditLogs.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values(input);
}

export async function getDashboardStats(userId: number, canViewAll: boolean) {
  const db = await getDb();
  if (!db)
    return {
      total: 0,
      urgent: 0,
      secret: 0,
      normal: 0,
      pending: 0,
      inProgress: 0,
      resolved: 0,
      today: 0,
    };
  const visibility = canViewAll
    ? undefined
    : eq(telegrams.createdByUserId, userId);
  const rows = await db
    .select({
      classification: telegrams.classification,
      count: sql<number>`count(*)`,
    })
    .from(telegrams)
    .where(visibility)
    .groupBy(telegrams.classification);
  const priorityRows = await db
    .select({ priority: telegrams.priority, count: sql<number>`count(*)` })
    .from(telegrams)
    .where(visibility)
    .groupBy(telegrams.priority);
  const statusRows = await db
    .select({ status: telegrams.status, count: sql<number>`count(*)` })
    .from(telegrams)
    .where(visibility)
    .groupBy(telegrams.status);
  const todayFilter = sql`DATE(${telegrams.createdAt}) = CURDATE()`;
  const todayRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(telegrams)
    .where(visibility ? and(visibility, todayFilter) : todayFilter);
  const counts = {
    urgent: 0,
    secret: 0,
    normal: 0,
    slow: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
  };
  const totalBySecrecy = rows.reduce(
    (total, row) => total + Number(row.count),
    0
  );
  for (const row of rows) counts[row.classification] = Number(row.count);
  for (const row of priorityRows) {
    if (row.priority === "urgent") counts.urgent = Number(row.count);
    if (row.priority === "slow") counts.slow = Number(row.count);
  }
  for (const row of statusRows) {
    if (row.status === "pending") counts.pending = Number(row.count);
    if (row.status === "in_progress") counts.inProgress = Number(row.count);
    if (row.status === "resolved") counts.resolved = Number(row.count);
  }
  return {
    ...counts,
    total: totalBySecrecy,
    today: Number(todayRows[0]?.count ?? 0),
  };
}
