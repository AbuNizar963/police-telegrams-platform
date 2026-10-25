export type OrganizationLogoView = {
  organizationId: string;
  logoUrl: string | null;
  logoDataUrl?: string | null;
};

/** Prefer the authenticated account's organization over a telegram's route target. */
export function resolveTelegramExportOrganizationId(input: {
  accountOrganizationId?: string | null;
  currentOrganizationId?: string | null;
  ownerOrganizationId?: string | null;
}): string | null {
  return (
    input.accountOrganizationId?.trim() ||
    input.currentOrganizationId?.trim() ||
    input.ownerOrganizationId?.trim() ||
    null
  );
}

/**
 * Resolve the logo for the selected export organization. Never fall back to
 * another organization's account settings.
 */
export function resolveTelegramExportLogo(input: {
  exportOrganizationId: string | null | undefined;
  organizationLogo?: OrganizationLogoView | null;
  settingsOrganizationId?: string | null;
  settingsLogoUrl?: string | null;
}): string | null {
  const organizationId = input.exportOrganizationId?.trim();

  // Legacy telegrams may not have an organization ID. Match the working
  // application branch by using the configured logo only for these ownerless
  // records; never borrow settings from a different known organization.
  if (!organizationId) {
    return input.settingsLogoUrl?.trim() || null;
  }

  if (input.organizationLogo?.organizationId === organizationId) {
    const logoUrl = input.organizationLogo.logoUrl?.trim();
    if (logoUrl) return logoUrl;
  }

  if (input.settingsOrganizationId?.trim() === organizationId) {
    const logoUrl = input.settingsLogoUrl?.trim();
    if (logoUrl) return logoUrl;
  }

  return null;
}
