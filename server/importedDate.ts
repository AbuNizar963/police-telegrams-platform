/**
 * Parses dates exported by Excel while preserving the source date and time.
 *
 * Ambiguous numeric dates use day/month/year, which is the convention used by
 * the Arabic-language registers. If one component exceeds 12, the ordering is
 * inferred from the valid calendar range (for example, 10/18/2026 is MM/DD).
 */
function localDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
  timezone: string
): Date | undefined {
  const desiredLocalTimestamp = Date.UTC(
    year,
    month - 1,
    day,
    hours,
    minutes,
    seconds
  );
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let utcTimestamp = desiredLocalTimestamp;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(utcTimestamp))
        .map(part => [part.type, part.value])
    );
    const representedLocalTimestamp = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const adjustment = desiredLocalTimestamp - representedLocalTimestamp;
    if (adjustment === 0) break;
    utcTimestamp += adjustment;
  }

  const result = new Date(utcTimestamp);
  const resolved = Object.fromEntries(
    formatter
      .formatToParts(result)
      .map(part => [part.type, part.value])
  );
  if (
    Number(resolved.year) !== year ||
    Number(resolved.month) !== month ||
    Number(resolved.day) !== day ||
    Number(resolved.hour) !== hours ||
    Number(resolved.minute) !== minutes ||
    Number(resolved.second) !== seconds
  ) {
    return undefined;
  }
  return result;
}

export function parseImportedDate(
  value?: string,
  time?: string,
  timezone = "UTC"
): Date | undefined {
  const normalized = (value ?? "")
    .trim()
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

  if (!normalized) return undefined;

  let year: number;
  let month: number;
  let day: number;
  let serialTime = "";
  if (/^\d{4,5}(?:\.\d+)?$/.test(normalized)) {
    const serial = Number(normalized);
    if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) {
      return undefined;
    }
    const wholeDays = Math.floor(serial);
    const excelDate = new Date(
      Date.UTC(1899, 11, 30) + wholeDays * 86_400_000
    );
    year = excelDate.getUTCFullYear();
    month = excelDate.getUTCMonth() + 1;
    day = excelDate.getUTCDate();
    if (serial % 1 !== 0) {
      const totalSeconds = Math.round((serial - wholeDays) * 86_400) % 86_400;
      serialTime = [
        Math.floor(totalSeconds / 3600),
        Math.floor((totalSeconds % 3600) / 60),
        totalSeconds % 60,
      ]
        .map(part => String(part).padStart(2, "0"))
        .join(":");
    }
  } else {
    const match = normalized.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/);
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

  const normalizedTime = (time?.trim() || serialTime)
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  const timeMatch = normalizedTime.match(
    /^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(ص|م|AM|PM)?$/i
  );
  if (normalizedTime && !timeMatch) return undefined;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (timeMatch) {
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2] ?? 0);
    seconds = Number(timeMatch[3] ?? 0);
    const meridiem = (timeMatch[4] ?? "").toUpperCase();
    if (minutes > 59 || seconds > 59 || hours > 24) return undefined;
    if (meridiem) {
      if (hours < 1 || hours > 12) return undefined;
      if (meridiem === "م" || meridiem === "PM") {
        hours = (hours % 12) + 12;
      } else {
        hours %= 12;
      }
    } else if (hours === 24 && (minutes !== 0 || seconds !== 0)) {
      return undefined;
    }
  }

  let targetYear = year;
  let targetMonth = month;
  let targetDay = day;
  if (hours === 24) {
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    targetYear = nextDay.getUTCFullYear();
    targetMonth = nextDay.getUTCMonth() + 1;
    targetDay = nextDay.getUTCDate();
    hours = 0;
  }

  try {
    return localDateTimeToUtc(
      targetYear,
      targetMonth,
      targetDay,
      hours,
      minutes,
      seconds,
      timezone
    );
  } catch {
    return undefined;
  }
}
