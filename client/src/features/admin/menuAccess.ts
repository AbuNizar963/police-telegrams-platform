const organizationUserManagementRoles = new Set([
  "system_admin",
  "organization_admin",
  "regional_admin",
  "organization_supervisor",
]);

const organizationSettingsRoles = new Set([
  "system_admin",
  "organization_admin",
]);

export function hasOrganizationSettingsMenuAccess(input: {
  organizationRole?: string | null;
  isPlatformOwner: boolean;
}): boolean {
  return (
    input.isPlatformOwner ||
    organizationSettingsRoles.has(input.organizationRole ?? "")
  );
}

export function hasUserManagementMenuAccess(input: {
  accountRole?: string | null;
  organizationRole?: string | null;
  isPlatformOwner: boolean;
}): boolean {
  return (
    input.accountRole === "admin" ||
    input.isPlatformOwner ||
    organizationUserManagementRoles.has(input.organizationRole ?? "")
  );
}

export function hasOrganizationStructureEditAccess(
  accountRole?: string | null
): boolean {
  return accountRole === "admin";
}

export function hasOrganizationSettingsEditAccess(input: {
  accountRole?: string | null;
  isPlatformOwner: boolean;
}): boolean {
  return input.accountRole === "admin" && input.isPlatformOwner;
}

export function getManagementMenuHeading(
  accountRole?: string | null,
  isPlatformOwner = false
): string {
  if (accountRole === "admin") return "إدارة النظام";
  if (isPlatformOwner) return "إعدادات المالك";
  return "إدارة الجهة";
}
