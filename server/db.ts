import crypto from "node:crypto";
import type {
  AuditLog,
  DepartmentSettings,
  InsertTelegram,
  InsertUser,
  Telegram,
  User,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { storageCreateSignedUrl } from "./storage";
import { getSupabaseAdmin } from "./_core/supabase";

const asDate = (value: unknown): Date =>
  value instanceof Date ? value : new Date(String(value));

function mapUser(row: Record<string, unknown>): User {
  return {
    ...(row as unknown as User),
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
  row: Record<string, unknown>,
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
  };
}

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.authUserId) throw new Error("Supabase auth user id is required");

  const values: Record<string, unknown> = {
    authUserId: user.authUserId,
    lastSignedIn: (user.lastSignedIn ?? new Date()).toISOString(),
  };

  for (const field of ["name", "email", "loginMethod", "badgeNumber"] as const) {
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
}

export async function createLocalOwnerUser(input: {
  username: string;
  passwordHash: string;
}): Promise<User> {
  const authUserId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .insert({
      authUserId,
      username: input.username,
      passwordHash: input.passwordHash,
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
  return mapUser(data as Record<string, unknown>);
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
  username: string,
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

export async function getUserByAuthUserId(authUserId: string): Promise<User | undefined> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("*")
    .eq("authUserId", authUserId)
    .maybeSingle();
  throwIfError(error, "Failed to load user");
  return data ? mapUser(data as Record<string, unknown>) : undefined;
}

export async function getOrCreateSettings(
  userId: number,
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
  values: Record<string, unknown>,
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
  const { data, error } = await getSupabaseAdmin().rpc("allocate_serial_number");
  throwIfError(error, "Serial allocation failed");
  const serial = Number(data);
  if (!Number.isInteger(serial) || serial < 1) {
    throw new Error("Serial allocation returned an invalid value");
  }
  return serial;
}

export async function listTelegrams(
  userId: number,
  canViewAll: boolean,
  search?: string,
  classification?: "secret" | "normal",
  priority?: "slow" | "normal" | "urgent",
  category?: "criminal" | "administrative" | "traffic" | "security" | "tactical",
  status?: "pending" | "in_progress" | "resolved" | "archived",
): Promise<Telegram[]> {
  let query = getSupabaseAdmin()
    .from("telegrams")
    .select("*")
    .order("createdAt", { ascending: false })
    .limit(200);

  if (!canViewAll) query = query.eq("createdByUserId", userId);
  if (classification) query = query.eq("classification", classification);
  if (priority) query = query.eq("priority", priority);
  if (category) query = query.eq("category", category);
  if (status) query = query.eq("status", status);

  if (search?.trim()) {
    const safe = search.trim().replace(/[,%()]/g, " ").slice(0, 120);
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

export async function getTelegramById(id: number): Promise<Telegram | undefined> {
  const { data, error } = await getSupabaseAdmin()
    .from("telegrams")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(error, "Failed to load telegram");
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

export async function writeAuditLog(
  input: Omit<AuditLog, "id" | "createdAt">,
): Promise<void> {
  const { error } = await getSupabaseAdmin().from("audit_logs").insert(input);
  throwIfError(error, "Failed to write audit log");
}

async function countTelegrams(
  userId: number,
  canViewAll: boolean,
  apply: (query: any) => any = query => query,
): Promise<number> {
  let query = getSupabaseAdmin()
    .from("telegrams")
    .select("id", { count: "exact", head: true });
  if (!canViewAll) query = query.eq("createdByUserId", userId);
  query = apply(query);
  const { count, error } = await query;
  throwIfError(error, "Failed to count telegrams");
  return count ?? 0;
}

export async function getDashboardStats(userId: number, canViewAll: boolean) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [total, urgent, secret, normal, pending, inProgress, resolved, today] =
    await Promise.all([
      countTelegrams(userId, canViewAll),
      countTelegrams(userId, canViewAll, q => q.eq("priority", "urgent")),
      countTelegrams(userId, canViewAll, q => q.eq("classification", "secret")),
      countTelegrams(userId, canViewAll, q => q.eq("classification", "normal")),
      countTelegrams(userId, canViewAll, q => q.eq("status", "pending")),
      countTelegrams(userId, canViewAll, q => q.eq("status", "in_progress")),
      countTelegrams(userId, canViewAll, q => q.eq("status", "resolved")),
      countTelegrams(userId, canViewAll, q =>
        q.gte("createdAt", start.toISOString()).lt("createdAt", end.toISOString()),
      ),
    ]);

  return { total, urgent, secret, normal, pending, inProgress, resolved, today };
}
