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
  if (!organizationId) return null;

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
