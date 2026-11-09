import { localizeDigits } from "@shared/numberSystem";
import {
  getTelegramSerialCode,
  type TelegramSerialSource,
} from "@shared/telegramSerial";

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

export function getTelegramEditableSerial(
  source: TelegramSerialSource
): string {
  const originalSerial = source.originalSerial?.trim() ?? "";
  if (originalSerial) {
    return isGeneratedSerialCode(originalSerial)
      ? getTelegramDisplayNumber(originalSerial)
      : originalSerial;
  }

  const organizationSerialNumber = source.organizationSerialNumber;
  if (
    typeof organizationSerialNumber === "number" &&
    Number.isInteger(organizationSerialNumber) &&
    organizationSerialNumber > 0
  ) {
    return String(organizationSerialNumber);
  }

  const fallbackSerial =
    source.organizationSerialCode?.trim() ||
    source.serialCode?.trim() ||
    (typeof source.serialNumber === "number"
      ? String(source.serialNumber)
      : undefined);
  return getTelegramDisplayNumber(fallbackSerial);
}

function isGeneratedSerialCode(value: string): boolean {
  return /^.+-\d{4}-\d{2}-\d{2}-\d+$/.test(value);
}

/** Preserves imported official serials byte-for-byte; only generated serials are localized. */
export function getTelegramDisplaySerial(
  source: TelegramSerialSource,
  numberSystem: unknown
): string {
  const originalSerial = source.originalSerial?.trim();
  if (originalSerial) return originalSerial;
  return localizeDigits(
    getTelegramDisplayNumber(getTelegramSerialCode(source)),
    numberSystem
  );
}

export function getTelegramExportFileBaseName(
  source: TelegramSerialSource
): string {
  const serial =
    source.originalSerial?.trim() ||
    source.serialCode?.trim() ||
    getTelegramSerialCode(source) ||
    "telegram";
  const safeSerial = serial.replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-").trim();
  return safeSerial || "telegram";
}
