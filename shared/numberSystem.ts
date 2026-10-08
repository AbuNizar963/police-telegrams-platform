export type NumberSystem = "latin" | "arabic";

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const DIGIT_PATTERN = /[0-9\u0660-\u0669\u06f0-\u06f9\u0966-\u096f]/g;

/** Legacy or unknown settings fall back to Latin digits. */
export function normalizeNumberSystem(value: unknown): NumberSystem {
  return value === "arabic" ? "arabic" : "latin";
}

function digitValue(character: string): number | undefined {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return undefined;

  for (const zeroCodePoint of [0x30, 0x660, 0x6f0, 0x966]) {
    const value = codePoint - zeroCodePoint;
    if (value >= 0 && value <= 9) return value;
  }

  return undefined;
}

/** Converts Latin, Arabic-Indic, Persian, and Devanagari digits in text. */
export function localizeDigits(
  value: string | number,
  system: unknown
): string {
  const normalizedSystem = normalizeNumberSystem(system);
  return String(value).replace(DIGIT_PATTERN, character => {
    const value = digitValue(character);
    if (value === undefined) return character;
    return normalizedSystem === "arabic"
      ? ARABIC_INDIC_DIGITS[value]
      : String(value);
  });
}
