export function getTelegramDisplayNumber(
  serialCode: string | null | undefined
): string {
  const value = String(serialCode ?? "").trim();
  if (!value) return "—";

  const serialDigits = value.split("-").at(-1) ?? value;
  const parsedSerial = Number.parseInt(serialDigits, 10);
  return Number.isFinite(parsedSerial) ? String(parsedSerial) : value;
}
