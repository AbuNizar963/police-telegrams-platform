/**
 * Parses dates exported by Excel while preserving the source date and time.
 *
 * Ambiguous numeric dates use day/month/year, which is the convention used by
 * the Arabic-language registers. If one component exceeds 12, the ordering is
 * inferred from the valid calendar range (for example, 10/18/2026 is MM/DD).
 */
export function parseImportedDate(
  value?: string,
  time?: string
): Date | undefined {
  const normalized = (value ?? "")
    .trim()
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[.]/g, "/");

  if (!normalized) return undefined;

  // Excel serial dates are days since 1899-12-30. Accept only a plausible
  // four- or five-digit serial so ordinary numbers are not mistaken for dates.
  let year: number;
  let month: number;
  let day: number;
  if (/^\d{4,5}(?:\.\d+)?$/.test(normalized)) {
    const serial = Number(normalized);
    if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) {
      return undefined;
    }
    const excelDate = new Date(
      Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000
    );
    year = excelDate.getUTCFullYear();
    month = excelDate.getUTCMonth() + 1;
    day = excelDate.getUTCDate();
  } else {
    const match = normalized.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/);
    if (!match) return undefined;

    const first = Number(match[1]);
    const second = Number(match[2]);
    const third = Number(match[3]);
    if (match[1].length === 4 || first > 31) {
      year = first;
      month = second;
      day = third;
    } else {
      year = third;
      if (first > 12 && second <= 12) {
        day = first;
        month = second;
      } else if (second > 12 && first <= 12) {
        month = first;
        day = second;
      } else {
        // For ambiguous dates, prefer DD/MM/YYYY for Arabic registers.
        day = first;
        month = second;
      }
      if (year < 100) year += year < 50 ? 2000 : 1900;
    }
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  const normalizedTime = (time ?? "")
    .trim()
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  const timeMatch = normalizedTime.match(
    /^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(ص|م|AM|PM)?$/i
  );
  if (normalizedTime && !timeMatch) return undefined;
  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2] ?? 0);
    const seconds = Number(timeMatch[3] ?? 0);
    const meridiem = (timeMatch[4] ?? "").toUpperCase();
    if (minutes > 59 || seconds > 59 || hours > 24) return undefined;
    if (meridiem) {
      if (hours < 1 || hours > 12) return undefined;
      if (meridiem === "م" || meridiem === "PM") {
        hours = (hours % 12) + 12;
      }
      else hours %= 12;
    } else if (hours === 24 && (minutes !== 0 || seconds !== 0)) {
      return undefined;
    }
    date.setUTCHours(hours === 24 ? 0 : hours, minutes, seconds, 0);
    if (hours === 24) date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}
