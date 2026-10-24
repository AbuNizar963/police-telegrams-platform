export function getTelegramDisplayNumber(
  serialCode: string | null | undefined,
  originalSerial?: string | null
): string {
  const officialSerial = String(originalSerial ?? "").trim();
  if (officialSerial) return officialSerial;

  const value = String(serialCode ?? "").trim();
  if (!value) return "—";

  // Keep the existing compact display behavior for system-generated serials.
  // Imported serials are passed separately above and never normalized.
  const serialDigits = value.split("-").at(-1) ?? value;
  const parsedSerial = Number.parseInt(serialDigits, 10);
  return Number.isFinite(parsedSerial) ? String(parsedSerial) : value;
}
