export function getTelegramDisplayNumber(
  serialCode: string | null | undefined,
  originalSerial?: string | null
): string {
  const officialSerial = String(originalSerial ?? "").trim();
  if (officialSerial) return officialSerial;

  const value = String(serialCode ?? "").trim();
  if (!value) return "—";

  // Shorten only the platform's generated PREFIX-YYYY-MM-DD-NNNNN format.
  // Imported serials such as "ب و 006", "2025-009", and values with leading
  // zeroes must remain exactly as supplied by the source workbook.
  const generatedSerial = value.match(/^.+-\d{4}-\d{2}-\d{2}-(\d+)$/);
  if (!generatedSerial) return value;

  const parsedSerial = Number.parseInt(generatedSerial[1], 10);
  return Number.isFinite(parsedSerial) ? String(parsedSerial) : generatedSerial[1];
}
