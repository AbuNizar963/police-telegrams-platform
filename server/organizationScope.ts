import { TRPCError } from "@trpc/server";
import { getSupabaseAdmin } from "./_core/supabase";
import {
  getUserOrganizationMembership,
  listAllOrganizations,
} from "./organization";
import { isPlatformOwner } from "./ownerAccess";

type ScopedMembership = {
  organizationId: string;
  role: string;
  isActive: boolean;
};

export const scopedManagementRoles = [
  "system_admin",
  "organization_admin",
  "regional_admin",
  "organization_supervisor",
] as const;

export function canManageAllOrganizations(user: {
  id: number;
  role?: string | null;
  isPlatformOwner?: boolean | null;
}): boolean {
  return user.role === "admin" || isPlatformOwner(user);
}

export async function getScopedMembership(
  userId: number
): Promise<ScopedMembership | null> {
  const membership = await getUserOrganizationMembership(userId);
  if (!membership) return null;
  return {
    organizationId: membership.organizationId,
    role: membership.role,
    isActive: membership.isActive,
  };
}

export async function getManagedOrganizationIds(
  user: {
    id: number;
    role?: string | null;
    isPlatformOwner?: boolean | null;
  },
  options: { activeOnly?: boolean } = {}
): Promise<string[]> {
  const allOrganizations = await listAllOrganizations();
  const organizations = options.activeOnly
    ? allOrganizations.filter(organization => organization.isActive)
    : allOrganizations;
  if (canManageAllOrganizations(user))
    return organizations.map(item => item.id);

  const membership = await getScopedMembership(user.id);
  if (
    !membership ||
    !scopedManagementRoles.includes(membership.role as never)
  ) {
    return [];
  }
  if (membership.role === "organization_supervisor") {
    return [membership.organizationId];
  }

  const managed = new Set([membership.organizationId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const organization of organizations) {
      if (
        organization.parentOrganizationId &&
        managed.has(organization.parentOrganizationId) &&
        !managed.has(organization.id)
      ) {
        managed.add(organization.id);
        changed = true;
      }
    }
  }
  return Array.from(managed);
}

export async function assertCanManageOrganization(
  user: { id: number; role?: string | null; isPlatformOwner?: boolean | null },
  organizationId: string
): Promise<void> {
  if (canManageAllOrganizations(user)) return;
  const managedIds = await getManagedOrganizationIds(user);
  if (!managedIds.includes(organizationId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "لا تملك صلاحية إدارة الحسابات التابعة لهذه الجهة",
    });
  }
}

export async function assertScopedUserManagementAccess(user: {
  id: number;
  role?: string | null;
  isPlatformOwner?: boolean | null;
}): Promise<void> {
  if (canManageAllOrganizations(user)) return;
  const membership = await getScopedMembership(user.id);
  if (
    !membership ||
    !scopedManagementRoles.includes(membership.role as never)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "تحتاج إلى دور مدير منطقة أو مشرف جهة لإدارة الحسابات",
    });
  }
}

export async function assertOrganizationExistsInScope(
  user: { id: number; role?: string | null; isPlatformOwner?: boolean | null },
  organizationId: string
): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("id, isActive")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data || data.isActive !== true) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "الجهة غير موجودة أو غير مفعّلة",
    });
  }
  await assertCanManageOrganization(user, organizationId);
}
