export type OrganizationLetterhead = {
  departmentName: string;
  unitName: string;
};

/**
 * Corrects only identity values that exactly mirror the parent organization.
 * The returned view is not persisted; custom department and unit names remain
 * untouched.
 */
export function resolveOrganizationLetterhead(
  settings: OrganizationLetterhead,
  organizationName: string | null | undefined,
  parentOrganizationName: string | null | undefined
): OrganizationLetterhead {
  const currentName = organizationName?.trim();
  const parentName = parentOrganizationName?.trim();

  if (!currentName || !parentName || currentName === parentName) {
    return settings;
  }

  return {
    departmentName:
      settings.departmentName.trim() === parentName
        ? currentName
        : settings.departmentName,
    unitName:
      settings.unitName.trim() === parentName ? currentName : settings.unitName,
  };
}
