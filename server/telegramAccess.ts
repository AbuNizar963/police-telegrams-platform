import { TRPCError } from "@trpc/server";
import { getUserOrganizationMembership } from "./organization";
import { isPlatformOwner } from "./ownerAccess";

export type TelegramOrganizationScope = {
  organizationId: string;
  currentOrganizationId: string | null;
};

type ScopeUser = {
  id: number;
  role: string;
  username?: string | null;
};

export function canViewAllTelegrams(user: ScopeUser): boolean {
  return user.role === "admin" && !isPlatformOwner(user);
}

export async function getActiveUserOrganizationId(
  user: ScopeUser
): Promise<string> {
  const membership = await getUserOrganizationMembership(user.id);
  if (!membership?.isActive) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "جهة العمل غير مفعّلة أو لا تملك عضوية نشطة فيها",
    });
  }
  return membership.organizationId;
}

export async function canAccessTelegramScope(
  user: ScopeUser,
  telegram: TelegramOrganizationScope
): Promise<boolean> {
  if (canViewAllTelegrams(user)) return true;

  const membership = await getUserOrganizationMembership(user.id);
  if (!membership?.isActive) return false;

  return (
    telegram.organizationId === membership.organizationId ||
    telegram.currentOrganizationId === membership.organizationId
  );
}
