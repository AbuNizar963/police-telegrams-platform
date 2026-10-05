import type {
  Organization,
  OrganizationMembership,
  OrganizationMemberRole,
  TelegramRoute,
} from "../drizzle/schema";
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "./_core/auth";
import { getSupabaseAdmin } from "./_core/supabase";
import { writeAuditLog } from "./db";

function throwIfError(
  error: { message: string } | null,
  context: string
): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function mapOrganization(row: Record<string, unknown>): Organization {
  return {
    ...(row as unknown as Organization),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  };
}

function mapRoute(row: Record<string, unknown>): TelegramRoute {
  return {
    ...(row as unknown as TelegramRoute),
    createdAt: new Date(String(row.createdAt)),
    receivedAt: row.receivedAt ? new Date(String(row.receivedAt)) : null,
    completedAt: row.completedAt ? new Date(String(row.completedAt)) : null,
    approvedAt: row.approvedAt ? new Date(String(row.approvedAt)) : null,
  };
}

function mapMembership(row: Record<string, unknown>): OrganizationMembership {
  return {
    ...(row as unknown as OrganizationMembership),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  };
}

export async function getPrimaryOrganization(): Promise<Organization> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("*")
    .eq("code", "LEGACY-PRIMARY")
    .eq("isActive", true)
    .maybeSingle();

  throwIfError(error, "Failed to load primary organization");

  if (!data) {
    throw new Error("No active primary organization is configured");
  }

  return mapOrganization(data as Record<string, unknown>);
}

export async function getUserOrganizationMembership(
  userId: number
): Promise<OrganizationMembership | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_memberships")
    .select("*")
    .eq("userId", userId)
    .eq("isActive", true)
    .order("createdAt", { ascending: true })
    .limit(1)
    .maybeSingle();

  throwIfError(error, "Failed to load organization membership");
  return data ? mapMembership(data as Record<string, unknown>) : null;
}

export async function getOrganizationById(
  organizationId: string
): Promise<Organization | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .eq("isActive", true)
    .maybeSingle();

  throwIfError(error, "Failed to load organization");
  return data ? mapOrganization(data as Record<string, unknown>) : null;
}

export async function listOrganizationsForUser(
  userId: number
): Promise<Organization[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_memberships")
    .select("organizations(*)")
    .eq("userId", userId)
    .eq("isActive", true)
    .order("createdAt", { ascending: true });

  throwIfError(error, "Failed to list organizations");

  return (data ?? [])
    .map(row => {
      const organization = row.organizations;
      return organization && typeof organization === "object"
        ? mapOrganization(organization as unknown as Record<string, unknown>)
        : null;
    })
    .filter((organization): organization is Organization =>
      Boolean(organization)
    );
}

const ACCOUNT_ORGANIZATION_TYPES = new Set<Organization["type"]>([
  "governorate",
  "region",
  "command",
  "police_department",
  "station",
  "unit",
]);

const ARABIC_TRANSLITERATION: Record<string, string> = {
  ا: "a",
  أ: "a",
  إ: "i",
  آ: "aa",
  ء: "a",
  ب: "b",
  ت: "t",
  ث: "th",
  ج: "j",
  ح: "h",
  خ: "kh",
  د: "d",
  ذ: "dh",
  ر: "r",
  ز: "z",
  س: "s",
  ش: "sh",
  ص: "s",
  ض: "d",
  ط: "t",
  ظ: "z",
  ع: "a",
  غ: "gh",
  ف: "f",
  ق: "q",
  ك: "k",
  ل: "l",
  م: "m",
  ن: "n",
  ه: "h",
  و: "w",
  ي: "y",
  ى: "a",
  ة: "h",
  ئ: "y",
  ؤ: "w",
};

function transliterateOrganizationName(name: string): string {
  const transliterated = name
    .split("")
    .map(character => ARABIC_TRANSLITERATION[character] ?? character)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return transliterated.slice(0, 110) || "police_unit";
}

function organizationAccountPrefix(type: Organization["type"]): string {
  const prefixes: Partial<Record<Organization["type"], string>> = {
    governorate: "gov",
    region: "rg",
    command: "hq",
    police_department: "pd",
    station: "st",
    unit: "unit",
  };
  return prefixes[type] ?? "unit";
}

async function createOrganizationAccount(input: {
  organization: Organization;
  createdByUserId?: number;
}): Promise<{ username: string; password: string; userId: number }> {
  const client = getSupabaseAdmin();
  const prefix = organizationAccountPrefix(input.organization.type);
  const codeSlug = transliterateOrganizationName(
    input.organization.code
  ).replace(new RegExp(`^${prefix}_`, "i"), "");
  const base = `${prefix}_${codeSlug}`;
  let username = base;
  for (let suffix = 2; ; suffix += 1) {
    const existing = await client
      .from("users")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    throwIfError(existing.error, "Failed to check organization account");
    if (!existing.data) break;
    username = `${base.slice(0, 120 - String(suffix).length - 1)}_${suffix}`;
  }
  const temporaryPassword = randomBytes(12).toString("base64url");
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("users")
    .insert({
      authUserId: randomUUID(),
      organizationId: input.organization.id,
      username,
      password_hash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      name: input.organization.name,
      unit: input.organization.name,
      email: null,
      loginMethod: "password",
      role: "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error("تعذر إنشاء الحساب الافتراضي للجهة");
  }
  try {
    await addOrganizationMembership({
      organizationId: input.organization.id,
      userId: data.id,
      role: "organization_admin",
    });
  } catch (error) {
    await client.from("users").delete().eq("id", data.id);
    throw error;
  }
  if (input.createdByUserId) {
    await writeAuditLog({
      actorUserId: input.createdByUserId,
      actorName: "مالك النظام",
      action: "organization.account.create",
      entityType: "organization",
      entityId: input.organization.id,
      metadata: JSON.stringify({
        username,
        organizationName: input.organization.name,
      }),
    });
  }
  return { username, password: temporaryPassword, userId: data.id };
}

export type OrganizationAccountSummary = {
  organizationId: string;
  userId: number;
  username: string;
  loginMethod: string | null;
  mustChangePassword: boolean;
};

export async function listOrganizationAccountSummaries(
  organizationId?: string
): Promise<OrganizationAccountSummary[]> {
  let query = getSupabaseAdmin()
    .from("users")
    .select("id, organizationId, username, loginMethod, mustChangePassword")
    .order("id", { ascending: true });
  if (organizationId) query = query.eq("organizationId", organizationId);
  const { data, error } = await query;
  throwIfError(error, "Failed to list organization accounts");
  return (data ?? []).map(row => ({
    organizationId: String(row.organizationId),
    userId: Number(row.id),
    username: String(row.username ?? ""),
    loginMethod: row.loginMethod ? String(row.loginMethod) : null,
    mustChangePassword: row.mustChangePassword === true,
  }));
}

export async function ensureOrganizationAccounts(input: {
  actorUserId: number;
}): Promise<{
  created: Array<{
    organizationId: string;
    organizationName: string;
    username: string;
    password: string;
  }>;
}> {
  const organizations = await listAllOrganizations();
  const summaries = await listOrganizationAccountSummaries();
  const existing = new Set(summaries.map(account => account.organizationId));
  const created: Array<{
    organizationId: string;
    organizationName: string;
    username: string;
    password: string;
  }> = [];
  for (const organization of organizations) {
    if (
      !ACCOUNT_ORGANIZATION_TYPES.has(organization.type) ||
      existing.has(organization.id)
    ) {
      continue;
    }
    const account = await createOrganizationAccount({
      organization,
      createdByUserId: input.actorUserId,
    });
    created.push({
      organizationId: organization.id,
      organizationName: organization.name,
      username: account.username,
      password: account.password,
    });
  }
  return { created };
}

export async function provisionOrganizationAccount(input: {
  organizationId: string;
  actorUserId: number;
}): Promise<{ organizationName: string; username: string; password: string }> {
  const organization = await getOrganizationById(input.organizationId);
  if (!organization) throw new Error("الجهة غير موجودة");
  const existing = await listOrganizationAccountSummaries(organization.id);
  if (existing.length > 0) throw new Error("يوجد حساب لهذه الجهة بالفعل");
  if (!ACCOUNT_ORGANIZATION_TYPES.has(organization.type)) {
    throw new Error("هذا المستوى التنظيمي لا يملك حساب جهة مباشرًا");
  }
  const account = await createOrganizationAccount({
    organization,
    createdByUserId: input.actorUserId,
  });
  return {
    organizationName: organization.name,
    username: account.username,
    password: account.password,
  };
}

export async function createOrganization(input: {
  parentOrganizationId?: string | null;
  telegramDestinationOrganizationId?: string | null;
  code: string;
  name: string;
  type: Organization["type"];
  createdByUserId?: number;
}): Promise<{
  organization: Organization;
  account: { username: string; password: string; userId: number } | null;
}> {
  await validateOrganizationParent(
    input.parentOrganizationId ?? null,
    input.type
  );
  await validateTelegramDestination(
    input.telegramDestinationOrganizationId ?? null,
    input.type
  );
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .insert({
      parentOrganizationId: input.parentOrganizationId ?? null,
      telegramDestinationOrganizationId:
        input.telegramDestinationOrganizationId ?? null,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      type: input.type,
    })
    .select("*")
    .single();

  throwIfError(error, "Failed to create organization");
  const organization = mapOrganization(data as Record<string, unknown>);
  let account = null;
  if (ACCOUNT_ORGANIZATION_TYPES.has(organization.type)) {
    try {
      account = await createOrganizationAccount({
        organization,
        createdByUserId: input.createdByUserId,
      });
    } catch (accountError) {
      await getSupabaseAdmin()
        .from("organizations")
        .delete()
        .eq("id", organization.id);
      throw accountError;
    }
  }
  return { organization, account };
}

async function validateOrganizationParent(
  parentOrganizationId: string | null,
  type: Organization["type"]
): Promise<void> {
  const parent = parentOrganizationId
    ? await getOrganizationById(parentOrganizationId)
    : null;
  const allowedParents: Record<Organization["type"], Organization["type"][]> = {
    central: [],
    governorate: ["central"],
    region: ["governorate"],
    police_department: ["region"],
    station: ["police_department", "region"],
    command: ["central", "governorate"],
    department: ["command", "governorate", "region"],
    unit: ["department", "station", "region"],
  };
  if (type === "central" && !parentOrganizationId) return;
  if (
    !parentOrganizationId ||
    !parent ||
    !allowedParents[type].includes(parent.type)
  ) {
    throw new Error("الجهة الأب لا تتوافق مع المستوى التنظيمي المحدد");
  }
}

async function validateTelegramDestination(
  destinationOrganizationId: string | null,
  type: Organization["type"],
  sourceOrganizationId?: string
): Promise<void> {
  if (!destinationOrganizationId) {
    if (type === "police_department" || type === "station") {
      throw new Error("يجب تحديد الجهة التابع لها القسم أو المخفر");
    }
    return;
  }

  if (sourceOrganizationId === destinationOrganizationId) {
    throw new Error("لا يمكن أن تكون الجهة المستلمة هي الجهة نفسها");
  }

  const destination = await getOrganizationById(destinationOrganizationId);
  if (!destination) {
    throw new Error("الجهة المستلمة غير موجودة أو غير مفعّلة");
  }
}

export async function listAllOrganizations(): Promise<Organization[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("*")
    .order("type", { ascending: true })
    .order("name", { ascending: true });
  throwIfError(error, "Failed to list organizations");
  return (data ?? []).map(row =>
    mapOrganization(row as Record<string, unknown>)
  );
}

export async function updateOrganization(input: {
  id: string;
  parentOrganizationId?: string | null;
  telegramDestinationOrganizationId?: string | null;
  code: string;
  name: string;
  type: Organization["type"];
  isActive: boolean;
}): Promise<Organization> {
  await validateOrganizationParent(
    input.parentOrganizationId ?? null,
    input.type
  );
  await validateTelegramDestination(
    input.telegramDestinationOrganizationId ?? null,
    input.type,
    input.id
  );
  if (input.id === (await getPrimaryOrganization()).id && !input.isActive) {
    throw new Error("لا يمكن تعطيل المركز الرئيسي");
  }
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .update({
      parentOrganizationId: input.parentOrganizationId ?? null,
      telegramDestinationOrganizationId:
        input.telegramDestinationOrganizationId ?? null,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      type: input.type,
      isActive: input.isActive,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("*")
    .single();
  throwIfError(error, "Failed to update organization");
  return mapOrganization(data as Record<string, unknown>);
}

export async function updateOrganizationAccount(input: {
  organizationId: string;
  username: string;
  password?: string;
}): Promise<{ username: string; passwordChanged: boolean }> {
  const username = input.username.trim().toLowerCase();
  const client = getSupabaseAdmin();
  const duplicate = await client
    .from("users")
    .select("id")
    .ilike("username", username)
    .neq("organizationId", input.organizationId)
    .maybeSingle();
  throwIfError(duplicate.error, "Failed to check organization username");
  if (duplicate.data) throw new Error("اسم المستخدم مستخدم بالفعل");

  const existing = await client
    .from("users")
    .select("id")
    .eq("organizationId", input.organizationId)
    .eq("loginMethod", "password")
    .maybeSingle();
  throwIfError(existing.error, "Failed to load organization account");
  if (!existing.data)
    throw new Error("لا يوجد حساب لهذه الجهة؛ استخدم مزامنة الحسابات أولاً");

  const values: Record<string, unknown> = {
    username,
    updatedAt: new Date().toISOString(),
  };
  if (input.password?.trim()) {
    values.password_hash = await hashPassword(input.password);
    values.mustChangePassword = true;
    values.authUserId = randomUUID();
  }
  const { error } = await client
    .from("users")
    .update(values)
    .eq("id", existing.data.id);
  throwIfError(error, "Failed to update organization account");
  return { username, passwordChanged: Boolean(input.password?.trim()) };
}

export async function getConfiguredTelegramDestination(
  userId: number
): Promise<Organization | null> {
  const membership = await getUserOrganizationMembership(userId);
  if (!membership) {
    throw new Error("User is not assigned to an active organization");
  }

  if (membership.role === "reader" || membership.role === "auditor") {
    const existingOrganization = await getOrganizationById(
      membership.organizationId
    );
    if (existingOrganization?.telegramDestinationOrganizationId) {
      throw new Error("لا تملك صلاحية إرسال البرقيات من هذه الجهة");
    }
  }

  const organization = await getOrganizationById(membership.organizationId);
  if (!organization?.telegramDestinationOrganizationId) return null;

  const destination = await getOrganizationById(
    organization.telegramDestinationOrganizationId
  );
  if (!destination) {
    throw new Error("الجهة المستلمة المحددة غير متاحة حاليًا");
  }
  return destination;
}

const SYRIAN_GOVERNORATES = [
  ["DAMASCUS", "دمشق"],
  ["RURAL_DAMASCUS", "ريف دمشق"],
  ["ALEPPO", "حلب"],
  ["HOMS", "حمص"],
  ["HAMA", "حماة"],
  ["LATAKIA", "اللاذقية"],
  ["TARTUS", "طرطوس"],
  ["IDLIB", "إدلب"],
  ["DARAA", "درعا"],
  ["SUWEIDA", "السويداء"],
  ["QUNEITRA", "القنيطرة"],
  ["DEIR_EZZOR", "دير الزور"],
  ["RAQQA", "الرقة"],
  ["HASAKA", "الحسكة"],
] as const;

export async function seedSyrianGovernorates(): Promise<Organization[]> {
  const central = await getPrimaryOrganization();
  const created: Organization[] = [];
  for (const [code, name] of SYRIAN_GOVERNORATES) {
    const { data, error } = await getSupabaseAdmin()
      .from("organizations")
      .upsert(
        {
          parentOrganizationId: central.id,
          code: `GOV-${code}`,
          name: `قيادة شرطة محافظة ${name}`,
          type: "governorate",
          isActive: true,
        },
        { onConflict: "code" }
      )
      .select("*")
      .single();
    throwIfError(error, `Failed to seed governorate ${name}`);
    created.push(mapOrganization(data as Record<string, unknown>));
  }
  return created;
}

export async function addOrganizationMembership(input: {
  organizationId: string;
  userId: number;
  role: OrganizationMemberRole;
}): Promise<OrganizationMembership> {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_memberships")
    .upsert(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        isActive: true,
      },
      { onConflict: "organizationId,userId" }
    )
    .select("*")
    .single();

  throwIfError(error, "Failed to assign organization membership");
  return mapMembership(data as Record<string, unknown>);
}

export async function listRoutingTargets(
  userId: number
): Promise<Array<Organization & { isConfiguredDestination: boolean }>> {
  const membership = await getUserOrganizationMembership(userId);
  if (!membership) {
    throw new Error("User is not assigned to an active organization");
  }

  const current = await getOrganizationById(membership.organizationId);
  if (!current) {
    throw new Error("Current organization is unavailable");
  }

  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("*")
    .eq("isActive", true)
    .order("name", { ascending: true });
  throwIfError(error, "Failed to load routing targets");

  const organizations = (data ?? []).map(row =>
    mapOrganization(row as Record<string, unknown>)
  );
  return organizations
    .filter(
      organization =>
        organization.id !== current.id &&
        (organization.parentOrganizationId === current.id ||
          current.parentOrganizationId === organization.id ||
          (current.parentOrganizationId !== null &&
            organization.parentOrganizationId ===
              current.parentOrganizationId) ||
          organization.id === current.telegramDestinationOrganizationId)
    )
    .sort((left, right) =>
      `${left.type}-${left.name}`.localeCompare(
        `${right.type}-${right.name}`,
        "ar"
      )
    )
    .map(organization => ({
      ...organization,
      isConfiguredDestination:
        organization.id === current.telegramDestinationOrganizationId,
    }));
}

export async function routeTelegram(input: {
  telegramId: number;
  toOrganizationId: string;
  forwardedByUserId: number;
  note?: string | null;
  allowDraft?: boolean;
}): Promise<TelegramRoute> {
  const membership = await getUserOrganizationMembership(
    input.forwardedByUserId
  );
  if (!membership) {
    throw new Error("User is not assigned to an active organization");
  }

  const { data, error } = await getSupabaseAdmin().rpc("route_telegram", {
    p_telegram_id: input.telegramId,
    p_from_organization_id: membership.organizationId,
    p_to_organization_id: input.toOrganizationId,
    p_forwarded_by_user_id: input.forwardedByUserId,
    p_note: input.note ?? null,
    p_allow_draft: input.allowDraft ?? false,
  });

  throwIfError(error, "Failed to route telegram");
  return mapRoute(data as Record<string, unknown>);
}

export async function approveTelegramRoute(input: {
  routeId: number;
  approverUserId: number;
  approved: boolean;
  reason?: string | null;
}): Promise<TelegramRoute> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "approve_telegram_route",
    {
      p_route_id: input.routeId,
      p_approver_user_id: input.approverUserId,
      p_approved: input.approved,
      p_reason: input.reason ?? null,
    }
  );
  throwIfError(error, "Failed to decide telegram route approval");
  return mapRoute(data as Record<string, unknown>);
}

export async function receiveTelegramRoute(input: {
  routeId: number;
  receiverUserId: number;
}): Promise<TelegramRoute> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "receive_telegram_route",
    {
      p_route_id: input.routeId,
      p_receiver_user_id: input.receiverUserId,
    }
  );
  throwIfError(error, "Failed to receive telegram route");
  return mapRoute(data as Record<string, unknown>);
}

export async function listIncomingTelegramRoutes(input: {
  telegramId: number;
  userId: number;
  canViewAll?: boolean;
}): Promise<TelegramRoute[]> {
  const membership = input.canViewAll
    ? null
    : await getUserOrganizationMembership(input.userId);

  if (!input.canViewAll && !membership) {
    return [];
  }

  let query = getSupabaseAdmin()
    .from("telegram_routes")
    .select("*")
    .eq("telegramId", input.telegramId)
    .in("status", ["sent", "received"])
    .in("approvalStatus", ["not_required", "approved"])
    .order("createdAt", { ascending: false });

  if (!input.canViewAll && membership) {
    query = query.eq("toOrganizationId", membership.organizationId);
  }

  const { data, error } = await query;
  throwIfError(error, "Failed to list incoming telegram routes");
  return (data ?? []).map(row => mapRoute(row as Record<string, unknown>));
}

export async function listPendingRouteApprovals(
  userId: number,
  canViewAll = false
): Promise<Array<Record<string, unknown>>> {
  const membership = await getUserOrganizationMembership(userId);
  if (!membership) return [];
  const organizations = await listAllOrganizations();
  const byId = new Map(
    organizations.map(organization => [organization.id, organization])
  );
  const { data, error } = await getSupabaseAdmin()
    .from("telegram_routes")
    .select(
      "*, telegrams(serialCode, subject, priority), fromOrganization:fromOrganizationId(name), toOrganization:toOrganizationId(name)"
    )
    .eq("approvalStatus", "pending")
    .order("createdAt", { ascending: true });
  throwIfError(error, "Failed to list pending route approvals");
  return (data ?? []).filter(
    route =>
      canViewAll ||
      byId.get(String(route.fromOrganizationId))?.parentOrganizationId ===
        membership.organizationId
  ) as Array<Record<string, unknown>>;
}
