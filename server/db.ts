import { randomUUID } from "node:crypto";
import type {
  AuditLog,
  DepartmentSettings,
  InsertTelegram,
  InsertUser,
  Telegram,
  User,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  storageCreateSignedUrl,
  storageKeyFromStoredUrl,
  storageStableUrl,
} from "./storage";
import { getSupabaseAdmin } from "./_core/supabase";
import {
  addOrganizationMembership,
  getPrimaryOrganization,
  getUserOrganizationMembership,
} from "./organization";

const asDate = (value: unknown): Date =>
  value instanceof Date ? value : new Date(String(value));

function mapUser(row: Record<string, unknown>): User {
  const { password_hash, ...rest } = row;
  return {
    ...(rest as unknown as User),
    passwordHash: typeof password_hash === "string" ? password_hash : null,
    createdAt: asDate(row.createdAt),
    updatedAt: asDate(row.updatedAt),
    lastSignedIn: asDate(row.lastSignedIn),
  };
}

function mapSettings(row: Record<string, unknown>): DepartmentSettings {
  return {
    ...(row as unknown as DepartmentSettings),
    createdAt: asDate(row.createdAt),
    updatedAt: asDate(row.updatedAt),
  };
}

export type DepartmentSettingsView = DepartmentSettings & {
  logoKey: string | null;
};

async function mapSettingsView(
  row: Record<string, unknown>
): Promise<DepartmentSettingsView> {
  const settings = mapSettings(row);
  const logoKey =
    typeof settings.logoUrl === "string" && settings.logoUrl.trim()
      ? settings.logoUrl.trim()
      : null;

  if (!logoKey) {
    return {
      ...settings,
      logoUrl: null,
      logoKey: null,
    };
  }

  const resolvedKey = storageKeyFromStoredUrl(
    logoKey,
    ENV.supabaseStorageBucket
  );
  if (resolvedKey?.startsWith("department/logos/")) {
    return {
      ...settings,
      logoUrl: storageStableUrl(resolvedKey),
      logoKey: resolvedKey,
    };
  }

  const logoUrl = /^https?:\/\//i.test(logoKey)
    ? logoKey
    : await storageCreateSignedUrl(logoKey, 60 * 60);

  return {
    ...settings,
    logoUrl,
    logoKey,
  };
}

function mapTelegram(row: Record<string, unknown>): Telegram {
  return {
    ...(row as unknown as Telegram),
    createdAt: asDate(row.createdAt),
    updatedAt: asDate(row.updatedAt),
    archivedAt: row.archivedAt ? asDate(row.archivedAt) : null,
    closedAt: row.closedAt ? asDate(row.closedAt) : null,
  };
}

function throwIfError(
  error: { message: string } | null,
  context: string
): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.authUserId) throw new Error("Supabase auth user id is required");

  const values: Record<string, unknown> = {
    authUserId: user.authUserId,
    lastSignedIn: (user.lastSignedIn ?? new Date()).toISOString(),
  };

  if (user.organizationId !== undefined) {
    values.organizationId = user.organizationId;
  }

  for (const field of [
    "name",
    "email",
    "loginMethod",
    "badgeNumber",
  ] as const) {
    if (user[field] !== undefined) values[field] = user[field] ?? null;
  }

  if (user.role !== undefined) {
    values.role = user.role;
  } else if (
    typeof user.email === "string" &&
    ENV.adminEmails.includes(user.email.toLowerCase())
  ) {
    values.role = "admin";
  }

  const { error } = await getSupabaseAdmin()
    .from("users")
    .upsert(values, { onConflict: "authUserId" });
  throwIfError(error, "Failed to upsert user");

  const persisted = await getSupabaseAdmin()
    .from("users")
    .select("id, organizationId, role")
    .eq("authUserId", user.authUserId)
    .single();
  throwIfError(persisted.error, "Failed to load upserted user");

  const persistedUser = persisted.data as {
    id: number;
    organizationId: string;
    role: "user" | "admin";
  };

  await addOrganizationMembership({
    organizationId: persistedUser.organizationId,
    userId: persistedUser.id,
    role: persistedUser.role === "admin" ? "organization_admin" : "dispatcher",
  });
}

export async function createLocalOwnerUser(input: {
  username: string;
  passwordHash: string;
}): Promise<User> {
  const authUserId = randomUUID();
  const now = new Date().toISOString();
  const organization = await getPrimaryOrganization();

  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .insert({
      authUserId,
      organizationId: organization.id,
      username: input.username,
      password_hash: input.passwordHash,
      name: input.username,
      email: null,
      loginMethod: "password",
      role: "admin",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    })
    .select("*")
    .single();

  throwIfError(error, "Failed to create owner account");

  const owner = mapUser(data as Record<string, unknown>);

  try {
    await addOrganizationMembership({
      organizationId: organization.id,
      userId: owner.id,
      role: "organization_admin",
    });
  } catch (error) {
    await getSupabaseAdmin().from("users").delete().eq("id", owner.id);
    throw error;
  }

  return owner;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(error, "Failed to load user");
  return data ? mapUser(data as Record<string, unknown>) : undefined;
}

export async function getUserByUsername(
  username: string
): Promise<(User & { passwordHash: string | null }) | undefined> {
  const normalized = username.trim().toLowerCase();
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("*")
    .ilike("username", normalized)
    .maybeSingle();
  throwIfError(error, "Failed to load user by username");
  return data
    ? (mapUser(data as Record<string, unknown>) as User & {
        passwordHash: string | null;
      })
    : undefined;
}

export async function updateUserLastSignedIn(id: number): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("users")
    .update({
      lastSignedIn: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq("id", id);
  throwIfError(error, "Failed to update user sign-in time");
}

export async function getUserByAuthUserId(
  authUserId: string
): Promise<User | undefined> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("*")
    .eq("authUserId", authUserId)
    .maybeSingle();
  throwIfError(error, "Failed to load user");
  return data ? mapUser(data as Record<string, unknown>) : undefined;
}

export async function getUserOrganizationId(userId: number): Promise<string> {
  const membership = await getUserOrganizationMembership(userId);
  if (!membership) {
    throw new Error("User is not assigned to an active organization");
  }
  return membership.organizationId;
}

export async function getOrCreateSettings(
  userId: number
): Promise<DepartmentSettingsView> {
  const client = getSupabaseAdmin();
  const existing = await client
    .from("department_settings")
    .select("*")
    .eq("configKey", "primary")
    .maybeSingle();
  throwIfError(existing.error, "Failed to load department settings");

  if (existing.data) {
    return mapSettingsView(existing.data as Record<string, unknown>);
  }

  const created = await client
    .from("department_settings")
    .insert({ configKey: "primary", updatedByUserId: userId })
    .select("*")
    .single();
  throwIfError(created.error, "Failed to create department settings");
  return mapSettingsView(created.data as Record<string, unknown>);
}

export async function getMaxSerialNumber(): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("telegrams")
    .select("serialNumber")
    .order("serialNumber", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(error, "Failed to load maximum serial");
  return Number(data?.serialNumber ?? 0);
}

export async function updateDepartmentSettings(
  id: number,
  values: Record<string, unknown>
): Promise<DepartmentSettings> {
  const { data, error } = await getSupabaseAdmin()
    .from("department_settings")
    .update({ ...values, updatedAt: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error, "Failed to update department settings");
  return mapSettings(data as Record<string, unknown>);
}

export async function allocateSerialNumber(): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "allocate_serial_number"
  );
  throwIfError(error, "Serial allocation failed");
  const serial = Number(data);
  if (!Number.isInteger(serial) || serial < 1) {
    throw new Error("Serial allocation returned an invalid value");
  }
  return serial;
}

export async function listTelegrams(
  _userId: number,
  canViewAll: boolean,
  organizationId: string | null,
  search?: string,
  classification?: "secret" | "normal",
  priority?: "slow" | "normal" | "urgent",
  category?:
    | "criminal"
    | "administrative"
    | "traffic"
    | "security"
    | "tactical",
  status?:
    | "draft"
    | "submitted"
    | "in_review"
    | "approved"
    | "returned"
    | "rejected"
    | "forwarded"
    | "pending"
    | "in_progress"
    | "resolved"
    | "completed"
    | "archived",
  page = 1,
  pageSize = 50
): Promise<Telegram[]> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  let query = getSupabaseAdmin()
    .from("telegrams")
    .select("*")
    .order("createdAt", { ascending: false })
    .range((safePage - 1) * safePageSize, safePage * safePageSize - 1);

  if (!canViewAll) {
    if (!organizationId) {
      throw new Error("Organization scope is required to list telegrams");
    }
    query = query.or(
      `organizationId.eq.${organizationId},currentOrganizationId.eq.${organizationId}`
    );
  }
  if (classification) query = query.eq("classification", classification);
  if (priority) query = query.eq("priority", priority);
  if (category) query = query.eq("category", category);
  if (status) query = query.eq("status", status);

  if (search?.trim()) {
    const safe = search
      .trim()
      .replace(/[,%()]/g, " ")
      .slice(0, 120);
    const filters = [
      `subject.ilike.%${safe}%`,
      `recipient.ilike.%${safe}%`,
      `body.ilike.%${safe}%`,
      `creatorName.ilike.%${safe}%`,
    ];
    if (/^\d+$/.test(safe)) filters.push(`serialNumber.eq.${Number(safe)}`);
    query = query.or(filters.join(","));
  }

  const { data, error } = await query;
  throwIfError(error, "Failed to list telegrams");
  return (data ?? []).map(row => mapTelegram(row as Record<string, unknown>));
}

export async function getTelegramReport(
  input: {
    search?: string;
    classification?: "secret" | "normal";
    priority?: "slow" | "normal" | "urgent";
    category?:
      | "criminal"
      | "administrative"
      | "traffic"
      | "security"
      | "tactical";
    status?: string;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  },
  canViewAll: boolean,
  organizationId: string | null
): Promise<{ rows: Telegram[]; total: number }> {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize)));
  let query = getSupabaseAdmin()
    .from("telegrams")
    .select("*", { count: "exact" })
    .order("createdAt", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (!canViewAll) {
    if (!organizationId) {
      throw new Error("Organization scope is required to generate a report");
    }
    query = query.or(
      `organizationId.eq.${organizationId},currentOrganizationId.eq.${organizationId}`
    );
  }

  if (input.classification)
    query = query.eq("classification", input.classification);
  if (input.priority) query = query.eq("priority", input.priority);
  if (input.category) query = query.eq("category", input.category);
  if (input.status) query = query.eq("status", input.status);
  if (input.from) query = query.gte("createdAt", input.from);
  if (input.to) query = query.lt("createdAt", input.to);
  if (input.search?.trim()) {
    const safe = input.search
      .trim()
      .replace(/[,%()]/g, " ")
      .slice(0, 120);
    const filters = [
      `subject.ilike.%${safe}%`,
      `recipient.ilike.%${safe}%`,
      `body.ilike.%${safe}%`,
      `creatorName.ilike.%${safe}%`,
    ];
    if (/^\d+$/.test(safe)) filters.push(`serialNumber.eq.${Number(safe)}`);
    query = query.or(filters.join(","));
  }

  const { data, count, error } = await query;
  throwIfError(error, "Failed to generate telegram report");
  return {
    rows: (data ?? []).map(row => mapTelegram(row as Record<string, unknown>)),
    total: count ?? 0,
  };
}

export async function getTelegramById(
  id: number
): Promise<Telegram | undefined> {
  const { data, error } = await getSupabaseAdmin()
    .from("telegrams")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(error, "Failed to load telegram");
  return data ? mapTelegram(data as Record<string, unknown>) : undefined;
}

export async function getTelegramByIdempotencyKey(
  idempotencyKey: string
): Promise<Telegram | undefined> {
  const { data, error } = await getSupabaseAdmin()
    .from("telegrams")
    .select("*")
    .eq("idempotencyKey", idempotencyKey)
    .maybeSingle();
  throwIfError(error, "Failed to load idempotent telegram");
  return data ? mapTelegram(data as Record<string, unknown>) : undefined;
}

export async function createTelegram(input: InsertTelegram): Promise<Telegram> {
  const values = {
    ...input,
    createdAt: input.createdAt?.toISOString(),
    updatedAt: input.updatedAt?.toISOString(),
    archivedAt: input.archivedAt?.toISOString() ?? null,
  };
  const { data, error } = await getSupabaseAdmin()
    .from("telegrams")
    .insert(values)
    .select("*")
    .single();
  throwIfError(error, "Failed to create telegram");
  return mapTelegram(data as Record<string, unknown>);
}

export async function recordTelegramVersion(input: {
  telegramId: number;
  changedByUserId: number;
  changeReason: string;
  snapshot: Record<string, unknown>;
}): Promise<void> {
  const { data: latest, error: latestError } = await getSupabaseAdmin()
    .from("telegram_versions")
    .select("versionNumber")
    .eq("telegramId", input.telegramId)
    .order("versionNumber", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(latestError, "Failed to load telegram version");

  const { error } = await getSupabaseAdmin()
    .from("telegram_versions")
    .insert({
      telegramId: input.telegramId,
      versionNumber: Number(latest?.versionNumber ?? 0) + 1,
      changedByUserId: input.changedByUserId,
      changeReason: input.changeReason.trim(),
      snapshot: JSON.stringify(input.snapshot),
    });
  throwIfError(error, "Failed to record telegram version");
}

export async function recordTelegramAction(input: {
  telegramId: number;
  actorUserId: number;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("telegram_actions")
    .insert({
      telegramId: input.telegramId,
      actorUserId: input.actorUserId,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      reason: input.reason?.trim() || null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
  throwIfError(error, "Failed to record telegram action");
}

export async function createTelegramAttachment(input: {
  telegramId: number;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedByUserId: number;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("telegram_attachments")
    .insert({
      telegramId: input.telegramId,
      storageKey: input.storageKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      uploadedByUserId: input.uploadedByUserId,
      scanStatus: "unavailable",
    });
  throwIfError(error, "Failed to record attachment metadata");
}

export async function getTelegramAttachmentById(id: number) {
  const { data, error } = await getSupabaseAdmin()
    .from("telegram_attachments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(error, "Failed to load attachment metadata");
  return data as {
    id: number;
    telegramId: number;
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    uploadedByUserId: number;
    scanStatus: string;
    createdAt: string;
  } | null;
}

export async function listTelegramAttachments(telegramId: number) {
  const { data, error } = await getSupabaseAdmin()
    .from("telegram_attachments")
    .select(
      "id, telegramId, originalName, mimeType, sizeBytes, sha256, scanStatus, uploadedByUserId, createdAt"
    )
    .eq("telegramId", telegramId)
    .order("createdAt", { ascending: false });
  throwIfError(error, "Failed to list attachment metadata");
  return data ?? [];
}

export async function transitionTelegram(input: {
  telegramId: number;
  actorUserId: number;
  toStatus: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<Telegram> {
  const { data, error } = await getSupabaseAdmin().rpc("transition_telegram", {
    p_telegram_id: input.telegramId,
    p_actor_user_id: input.actorUserId,
    p_to_status: input.toStatus,
    p_reason: input.reason ?? null,
    p_metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
  throwIfError(error, "Telegram transition failed");
  return mapTelegram(data as Record<string, unknown>);
}

export async function updateTelegram(
  id: number,
  values: Partial<
    Pick<
      InsertTelegram,
      | "subject"
      | "recipient"
      | "body"
      | "classification"
      | "priority"
      | "category"
      | "status"
      | "attachmentManifest"
      | "gpsLatitude"
      | "gpsLongitude"
      | "workflowReason"
      | "archivedAt"
      | "closedAt"
    >
  >
): Promise<Telegram> {
  const { data, error } = await getSupabaseAdmin()
    .from("telegrams")
    .update({ ...values, updatedAt: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error, "Failed to update telegram");
  return mapTelegram(data as Record<string, unknown>);
}

export async function deleteTelegram(id: number): Promise<Telegram> {
  const archivedAt = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("telegrams")
    .update({
      status: "archived",
      archivedAt,
      closedAt: archivedAt,
      workflowReason: "أرشفة إدارية مع الحفاظ على السجل التاريخي",
      updatedAt: archivedAt,
    })
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error, "Failed to delete telegram");
  return mapTelegram(data as Record<string, unknown>);
}

export async function writeAuditLog(
  input: Omit<AuditLog, "id" | "createdAt">
): Promise<void> {
  const { error } = await getSupabaseAdmin().from("audit_logs").insert(input);
  throwIfError(error, "Failed to write audit log");
}

async function countTelegrams(
  _userId: number,
  canViewAll: boolean,
  organizationId: string | null,
  apply: (query: any) => any = query => query
): Promise<number> {
  let query = getSupabaseAdmin()
    .from("telegrams")
    .select("id", { count: "exact", head: true });
  if (!canViewAll) {
    if (!organizationId) {
      throw new Error("Organization scope is required to count telegrams");
    }
    query = query.or(
      `organizationId.eq.${organizationId},currentOrganizationId.eq.${organizationId}`
    );
  }
  query = apply(query);
  const { count, error } = await query;
  throwIfError(error, "Failed to count telegrams");
  return count ?? 0;
}

export async function getDashboardStats(
  userId: number,
  canViewAll: boolean,
  organizationId: string | null
) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [total, urgent, secret, normal, pending, inProgress, resolved, today] =
    await Promise.all([
      countTelegrams(userId, canViewAll, organizationId),
      countTelegrams(userId, canViewAll, organizationId, q =>
        q.eq("priority", "urgent")
      ),
      countTelegrams(userId, canViewAll, organizationId, q =>
        q.eq("classification", "secret")
      ),
      countTelegrams(userId, canViewAll, organizationId, q =>
        q.eq("classification", "normal")
      ),
      countTelegrams(userId, canViewAll, organizationId, q =>
        q.eq("status", "pending")
      ),
      countTelegrams(userId, canViewAll, organizationId, q =>
        q.eq("status", "in_progress")
      ),
      countTelegrams(userId, canViewAll, organizationId, q =>
        q.eq("status", "resolved")
      ),
      countTelegrams(userId, canViewAll, organizationId, q =>
        q
          .gte("createdAt", start.toISOString())
          .lt("createdAt", end.toISOString())
      ),
    ]);

  return {
    total,
    urgent,
    secret,
    normal,
    pending,
    inProgress,
    resolved,
    today,
  };
}

export type UserProfileUpdate = {
  name: string;
  badgeNumber: string | null;
  phone: string | null;
  rank: string | null;
  unit: string | null;
  bio: string | null;
  avatarKey?: string | null;
};

export async function updateUserProfile(
  id: number,
  values: UserProfileUpdate
): Promise<User> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .update({ ...values, updatedAt: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error, "Failed to update user profile");
  return mapUser(data as Record<string, unknown>);
}

export async function updateUserPassword(
  id: number,
  passwordHash: string
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("users")
    .update({
      password_hash: passwordHash,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", id);
  throwIfError(error, "Failed to update user password");
}
