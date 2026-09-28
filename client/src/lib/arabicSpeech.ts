/**
 * Applies narrowly scoped corrections to common Arabic speech-recognition errors.
 * Deliberately avoids converting arbitrary final ه to ة because both are valid.
 *
 * Explicit Arabic/ASCII word boundaries keep this compatible with the project's
 * TypeScript target without requiring Unicode regular-expression flags.
 */
const speechCorrections: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|[^ء-يA-Za-z0-9])المدرسه($|[^ء-يA-Za-z0-9])/g, "$1المدرسة$2"],
  [/(^|[^ء-يA-Za-z0-9])مدرسه($|[^ء-يA-Za-z0-9])/g, "$1مدرسة$2"],
];

export function correctArabicSpeechText(value: string): string {
  return speechCorrections.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}
