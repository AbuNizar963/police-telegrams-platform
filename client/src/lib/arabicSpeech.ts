/**
 * Applies narrowly scoped corrections to common Arabic speech-recognition errors.
 * Deliberately avoids converting arbitrary final ه to ة because both are valid.
 */
const speechCorrections: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bالمدرسه\b/gu, "المدرسة"],
  [/\bمدرسه\b/gu, "مدرسة"],
];

export function correctArabicSpeechText(value: string): string {
  return speechCorrections.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}
