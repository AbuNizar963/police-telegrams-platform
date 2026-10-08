export interface TelegramSerialSource {
  organizationSerialCode?: string | null;
  serialCode?: string | null;
}

/**
 * Returns the organization-scoped serial printed on the telegram, falling
 * back to the legacy/global serial for records that predate organization
 * numbering.
 */
export function getTelegramSerialCode(source: TelegramSerialSource): string {
  return (
    source.organizationSerialCode?.trim() || source.serialCode?.trim() || ""
  );
}
