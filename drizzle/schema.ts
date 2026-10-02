import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  badgeNumber: varchar("badgeNumber", { length: 80 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const departmentSettings = mysqlTable("department_settings", {
  id: int("id").autoincrement().primaryKey(),
  configKey: varchar("configKey", { length: 32 })
    .default("primary")
    .notNull()
    .unique(),
  departmentName: varchar("departmentName", { length: 255 })
    .default("إدارة الشرطة")
    .notNull(),
  unitName: varchar("unitName", { length: 255 })
    .default("وحدة العمليات")
    .notNull(),
  unitChiefRank: varchar("unitChiefRank", { length: 120 })
    .default("العقيد")
    .notNull(),
  unitChiefName: varchar("unitChiefName", { length: 255 })
    .default("رئيس الوحدة")
    .notNull(),
  serialPrefix: varchar("serialPrefix", { length: 24 })
    .default("POL")
    .notNull(),
  serialStart: int("serialStart").default(1).notNull(),
  nextSerial: int("nextSerial").default(1).notNull(),
  timezone: varchar("timezone", { length: 64 })
    .default("Asia/Riyadh")
    .notNull(),
  dateFormat: varchar("dateFormat", { length: 32 })
    .default("dd/MM/yyyy HH:mm:ss")
    .notNull(),
  numberSystem: mysqlEnum("numberSystem", ["latin", "arabic", "hindi"])
    .default("latin")
    .notNull(),
  logoUrl: text("logoUrl"),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const telegrams = mysqlTable(
  "telegrams",
  {
    id: int("id").autoincrement().primaryKey(),
    serialNumber: int("serialNumber").notNull().unique(),
    serialCode: varchar("serialCode", { length: 48 }).notNull().unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 64 }).unique(),
    createdByUserId: int("createdByUserId").notNull(),
    creatorName: varchar("creatorName", { length: 255 }).notNull(),
    creatorEmail: varchar("creatorEmail", { length: 320 }),
    creatorBadgeId: varchar("creatorBadgeId", { length: 80 }),
    creatorIp: varchar("creatorIp", { length: 80 }),
    creatorFingerprint: varchar("creatorFingerprint", { length: 128 }),
    subject: varchar("subject", { length: 255 }).notNull(),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    body: text("body").notNull(),
    classification: mysqlEnum("classification", ["secret", "normal"])
      .default("normal")
      .notNull(),
    priority: mysqlEnum("priority", ["slow", "normal", "urgent"])
      .default("normal")
      .notNull(),
    category: mysqlEnum("category", [
      "criminal",
      "administrative",
      "traffic",
      "security",
      "tactical",
    ])
      .default("administrative")
      .notNull(),
    status: mysqlEnum("status", [
      "pending",
      "in_progress",
      "resolved",
      "archived",
    ])
      .default("pending")
      .notNull(),
    attachmentManifest: text("attachmentManifest"),
    gpsLatitude: varchar("gpsLatitude", { length: 40 }),
    gpsLongitude: varchar("gpsLongitude", { length: 40 }),
    archivedAt: timestamp("archivedAt"),
  },
  table => ({
    creatorIdx: index("telegrams_creator_idx").on(table.createdByUserId),
    createdAtIdx: index("telegrams_created_at_idx").on(table.createdAt),
    classificationIdx: index("telegrams_classification_idx").on(
      table.classification
    ),
  })
);

export const telegramAttachments = mysqlTable(
  "telegram_attachments",
  {
    id: int("id").autoincrement().primaryKey(),
    telegramId: int("telegramId").notNull(),
    fileKey: varchar("fileKey", { length: 500 }).notNull().unique(),
    fileName: varchar("fileName", { length: 180 }).notNull(),
    contentType: varchar("contentType", { length: 120 }).notNull(),
    size: int("size").notNull(),
    checksumSha256: varchar("checksumSha256", { length: 64 }),
    uploadedByUserId: int("uploadedByUserId").notNull(),
    scanStatus: mysqlEnum("scanStatus", ["pending", "clean", "blocked"])
      .default("pending")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    telegramIdx: index("telegram_attachments_telegram_idx").on(
      table.telegramId
    ),
    uploaderIdx: index("telegram_attachments_uploader_idx").on(
      table.uploadedByUserId
    ),
  })
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorUserId: int("actorUserId").notNull(),
    actorName: varchar("actorName", { length: 255 }).notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: varchar("entityId", { length: 80 }),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    actorIdx: index("audit_actor_idx").on(table.actorUserId),
    createdAtIdx: index("audit_created_at_idx").on(table.createdAt),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Telegram = typeof telegrams.$inferSelect;
export type InsertTelegram = typeof telegrams.$inferInsert;
export type DepartmentSettings = typeof departmentSettings.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type TelegramAttachment = typeof telegramAttachments.$inferSelect;
export type InsertTelegramAttachment = typeof telegramAttachments.$inferInsert;
