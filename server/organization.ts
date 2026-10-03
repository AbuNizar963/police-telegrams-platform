import type {
  Organization,
  OrganizationMembership,
  OrganizationMemberRole,
  TelegramRoute,
} from "../drizzle/schema";
import { getSupabaseAdmin } from "./_core/supabase";

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

export async function createOrganization(input: {
  parentOrganizationId?: string | null;
  telegramDestinationOrganizationId?: string | null;
  code: string;
  name: string;
  type: Organization["type"];
}): Promise<Organization> {
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
  return mapOrganization(data as Record<string, unknown>);
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
  const governorateFor = (organizationId: string): string | null => {
    let current = byId.get(organizationId);
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.type === "governorate") return current.id;
      current = current.parentOrganizationId
        ? byId.get(current.parentOrganizationId)
        : undefined;
    }
    return null;
  };
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
      governorateFor(String(route.fromOrganizationId)) ===
        membership.organizationId
  ) as Array<Record<string, unknown>>;
}
