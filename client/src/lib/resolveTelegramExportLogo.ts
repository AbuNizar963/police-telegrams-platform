export type OrganizationLogoView = {
  organizationId: string;
  logoUrl: string | null;
};

/**
 * Resolve the logo for the organization that owns the telegram's current
 * letterhead. Never fall back to another organization's account settings.
 */
export function resolveTelegramExportLogo(input: {
  telegramOrganizationId: string | null | undefined;
  organizationLogo?: OrganizationLogoView | null;
  settingsOrganizationId?: string | null;
  settingsLogoUrl?: string | null;
}): string | null {
  const organizationId = input.telegramOrganizationId?.trim();

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
