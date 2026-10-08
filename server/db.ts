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
  const membership = await getUserOrganizationMembership(userId);
  const organizationId = membership?.organizationId ?? null;
  const organization = organizationId
    ? await client
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .maybeSingle()
    : { data: null, error: null };
  throwIfError(organization.error, "Failed to load current organization");
  const organizationName =
    (organization.data as { name?: string } | null)?.name ?? null;
  let existingQuery = client.from("department_settings").select("*").limit(1);
  existingQuery = organizationId
    ? existingQuery.eq("organizationId", organizationId)
    : existingQuery.is("organizationId", null);
  const existing = await existingQuery.maybeSingle();
  throwIfError(existing.error, "Failed to load department settings");

  if (existing.data) {
    return mapSettingsView(existing.data as Record<string, unknown>);
  }

  const legacy = await client
    .from("department_settings")
    .select("*")
    .eq("configKey", "primary")
    .is("organizationId", null)
    .maybeSingle();
  throwIfError(legacy.error, "Failed to load legacy department settings");

  const template = (legacy.data ?? {}) as Record<string, unknown>;
  const values = {
    configKey: organizationId ? `org:${organizationId}` : "primary",
    organizationId,
    departmentName:
      organizationName ?? template.departmentName ?? "إدارة الشرطة",
    unitName: organizationName ?? template.unitName ?? "وحدة العمليات",
    unitChiefRank: organizationId ? "" : (template.unitChiefRank ?? "العقيد"),
    unitChiefName: organizationId
      ? "رئيس الجهة"
      : (template.unitChiefName ?? "رئيس الوحدة"),
    serialPrefix: template.serialPrefix ?? "POL",
    incomingSerialPrefix:
      template.incomingSerialPrefix ?? template.serialPrefix ?? "POL",
    serialStart: Number(template.serialStart ?? 1),
    incomingSerialStart: Number(
      template.incomingSerialStart ?? template.serialStart ?? 1
    ),
    nextSerial: Number(template.nextSerial ?? 1),
    nextOutgoingSerial: Number(
      template.nextOutgoingSerial ?? template.serialStart ?? 1
    ),
    nextIncomingSerial: Number(
      template.nextIncomingSerial ??
        template.incomingSerialStart ??
        template.serialStart ??
        1
    ),
    timezone: template.timezone ?? "Asia/Damascus",
    dateFormat: template.dateFormat ?? "dd/MM/yyyy HH:mm:ss",
    numberSystem: template.numberSystem ?? "latin",
    logoUrl: template.logoUrl ?? null,
    updatedByUserId: userId,
  };

  const created = await client
    .from("department_settings")
    .insert(values)
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

export async function allocateOrganizationSerialNumber(
  organizationId: string,
  direction: "outgoing" | "incoming"
): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "allocate_organization_serial",
    { p_organization_id: organizationId, p_direction: direction }
  );
  throwIfError(error, "Organization serial allocation failed");
  const serial = Number(data);
  if (!Number.isInteger(serial) || serial < 1) {
    throw new Error("Organization serial allocation returned an invalid value");
  }
  return serial;
}

export async function getOrganizationSettings(
  organizationId: string
): Promise<DepartmentSettingsView | undefined> {
  const { data, error } = await getSupabaseAdmin()
    .from("department_settings")
    .select("*")
    .eq("organizationId", organizationId)
    .maybeSingle();
  throwIfError(error, "Failed to load organization settings");
  return data ? mapSettingsView(data as Record<string, unknown>) : undefined;
}

export async function updateRouteIncomingSerial(input: {
  routeId: number;
  serialNumber: number;
  serialCode: string;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("telegram_routes")
    .update({
      incomingSerialNumber: input.serialNumber,
      incomingSerialCode: input.serialCode,
    })
    .eq("id", input.routeId);
  throwIfError(error, "Failed to save incoming organization serial");
}

export async function updateRouteOutgoingSerial(input: {
  routeId: number;
  serialNumber: number;
  serialCode: string;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("telegram_routes")
    .update({
      routeSerialNumber: input.serialNumber,
      routeSerialCode: input.serialCode,
    })
    .eq("id", input.routeId);
  throwIfError(error, "Failed to save outgoing organization serial");
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
    | "tactical"
    | "intelligence"
    | "emergency"
    | "public_order"
    | "personnel"
    | "logistics"
    | "training"
    | "community"
    | "other",
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
  from?: string,
  to?: string,
  page = 1,
  pageSize = 50,
  organizationScopeIds: string[] | null = null
): Promise<Telegram[]> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(1000, Math.max(1, Math.floor(pageSize)));
  let query = getSupabaseAdmin()
    .from("telegrams")
    .select("*")
    .order("serialNumber", { ascending: false })
    .range((safePage - 1) * safePageSize, safePage * safePageSize - 1);

  if (organizationScopeIds?.length) {
    const ids = organizationScopeIds.join(",");
    query = query.or(
      `organizationId.in.(${ids}),currentOrganizationId.in.(${ids})`
    );
  } else if (!canViewAll) {
    if (!organizationId) {
      throw new Error("Organization scope is required to list telegrams");
    }
    const scopeIds = organizationScopeIds?.length
      ? organizationScopeIds
      : [organizationId];
    const ids = scopeIds.join(",");
    query = query.or(
      `organizationId.in.(${ids}),currentOrganizationId.in.(${ids})`
    );
  }
  if (classification) query = query.eq("classification", classification);
  if (priority) query = query.eq("priority", priority);
  if (category) query = query.eq("category", category);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("createdAt", from);
  if (to) query = query.lt("createdAt", to);

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
      | "tactical"
      | "intelligence"
      | "emergency"
      | "public_order"
      | "personnel"
      | "logistics"
      | "training"
      | "community"
      | "other";
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

export type PushSubscriptionRecord = {
  id: number;
  userId: number;
  organizationId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

export async function upsertPushSubscription(input: {
  userId: number;
  organizationId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("push_subscriptions")
    .upsert(
      {
        userId: input.userId,
        organizationId: input.organizationId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        lastUsedAt: now,
        updatedAt: now,
      },
      { onConflict: "endpoint" }
    );
  throwIfError(error, "Failed to save push subscription");
}

export async function deletePushSubscription(
  userId: number,
  endpoint: string
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("push_subscriptions")
    .delete()
    .eq("userId", userId)
    .eq("endpoint", endpoint);
  throwIfError(error, "Failed to remove push subscription");
}

export async function listPushSubscriptions(
  organizationId: string
): Promise<PushSubscriptionRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("push_subscriptions")
    .select("id, userId, organizationId, endpoint, p256dh, auth, userAgent")
    .eq("organizationId", organizationId)
    .order("lastUsedAt", { ascending: false });
  throwIfError(error, "Failed to list push subscriptions");
  return (data ?? []) as PushSubscriptionRecord[];
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

export type TelegramPurgeResult = {
  telegram: Telegram;
  attachmentStorageKeys: string[];
};

/**
 * Permanently removes a telegram and every record that references it
 * (workflow versions, attachment metadata, workflow actions and routing
 * history). The referencing foreign keys are declared ON DELETE RESTRICT, so
 * dependents are always removed before the telegram row itself: a partial
 * failure can never leave an orphaned dependent record behind.
 *
 * Private storage objects are not owned by this layer; their keys are returned
 * so the caller can clean them through the storage provider.
 */
export async function purgeTelegramPermanently(
  id: number
): Promise<TelegramPurgeResult | undefined> {
  const supabase = getSupabaseAdmin();

  const { data: attachmentRows, error: attachmentError } = await supabase
    .from("telegram_attachments")
    .select("storageKey")
    .eq("telegramId", id);
  throwIfError(attachmentError, "Failed to load telegram attachments");

  // Order matters: every referencing table is cleared before its parent row.
  const dependentTables = [
    "telegram_actions",
    "telegram_versions",
    "telegram_attachments",
    "telegram_routes",
  ] as const;

  for (const table of dependentTables) {
    const { error } = await supabase.from(table).delete().eq("telegramId", id);
    throwIfError(error, `Failed to purge ${table}`);
  }

  const { data, error } = await supabase
    .from("telegrams")
    .delete()
    .eq("id", id)
    .select("*")
    .maybeSingle();
  throwIfError(error, "Failed to delete telegram");
  if (!data) return undefined;

  return {
    telegram: mapTelegram(data as Record<string, unknown>),
    attachmentStorageKeys: (attachmentRows ?? [])
      .map(row => String((row as { storageKey?: unknown }).storageKey ?? ""))
      .filter(key => key.length > 0),
  };
}

export async function writeAuditLog(
  input: Omit<AuditLog, "id" | "createdAt">
): Promise<void> {
  const { error } = await getSupabaseAdmin().from("audit_logs").insert(input);
  throwIfError(error, "Failed to write audit log");
}
export type NotificationRecord = {
  id: number;
  userId: number;
  organizationId: string;
  type: string;
  title: string;
  body: string;
  telegramId: number | null;
  routeId: number | null;
  readAt: Date | null;
  createdAt: Date;
};
const mapNotification = (row: Record<string, unknown>): NotificationRecord => ({
  id: Number(row.id),
  userId: Number(row.userId),
  organizationId: String(row.organizationId),
  type: String(row.type),
  title: String(row.title),
  body: String(row.body),
  telegramId: row.telegramId == null ? null : Number(row.telegramId),
  routeId: row.routeId == null ? null : Number(row.routeId),
  readAt: row.readAt ? asDate(row.readAt) : null,
  createdAt: asDate(row.createdAt),
});
export async function notifyOrganizationUsers(input: {
  organizationId: string;
  type: string;
  title: string;
  body: string;
  telegramId?: number | null;
  routeId?: number | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: members, error: memberError } = await supabase
    .from("organization_memberships")
    .select("userId")
    .eq("organizationId", input.organizationId)
    .eq("isActive", true);
  throwIfError(memberError, "Failed to load notification recipients");
  const userIds = Array.from(
    new Set(
      (members ?? []).map(row => Number(row.userId)).filter(Number.isFinite)
    )
  );
  if (userIds.length === 0) return;
  const { error } = await supabase.from("notifications").insert(
    userIds.map(userId => ({
      userId,
      organizationId: input.organizationId,
      type: input.type,
      title: input.title,
      body: input.body,
      telegramId: input.telegramId ?? null,
      routeId: input.routeId ?? null,
    }))
  );
  throwIfError(error, "Failed to create organization notifications");
}
export async function notifyUser(input: {
  userId: number;
  organizationId: string;
  type: string;
  title: string;
  body: string;
  telegramId?: number | null;
  routeId?: number | null;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("notifications")
    .insert({
      userId: input.userId,
      organizationId: input.organizationId,
      type: input.type,
      title: input.title,
      body: input.body,
      telegramId: input.telegramId ?? null,
      routeId: input.routeId ?? null,
    });
  throwIfError(error, "Failed to create user notification");
}
export async function listUserNotifications(
  userId: number,
  limit = 30
): Promise<{ items: NotificationRecord[]; unreadCount: number }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(limit);
  throwIfError(error, "Failed to list notifications");
  const { count, error: countError } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("userId", userId)
    .is("readAt", null);
  throwIfError(countError, "Failed to count unread notifications");
  const items = (data ?? []).map(row =>
    mapNotification(row as Record<string, unknown>)
  );
  return { items, unreadCount: count ?? 0 };
}
export async function markNotificationRead(
  userId: number,
  id: number
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("notifications")
    .update({ readAt: new Date().toISOString() })
    .eq("id", id)
    .eq("userId", userId)
    .is("readAt", null);
  throwIfError(error, "Failed to mark notification as read");
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

  const [
    total,
    urgent,
    secret,
    normal,
    pending,
    inProgress,
    resolved,
    today,
    incoming,
    outgoing,
  ] = await Promise.all([
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
      q.gte("createdAt", start.toISOString()).lt("createdAt", end.toISOString())
    ),
    organizationId
      ? countTelegrams(userId, canViewAll, organizationId, q =>
          q
            .eq("currentOrganizationId", organizationId)
            .neq("organizationId", organizationId)
        )
      : Promise.resolve(0),
    organizationId
      ? countTelegrams(userId, canViewAll, organizationId, q =>
          q.eq("organizationId", organizationId)
        )
      : Promise.resolve(0),
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
    incoming,
    outgoing,
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
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", id);
  throwIfError(error, "Failed to update user password");
}
