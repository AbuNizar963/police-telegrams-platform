/**
 * Applies narrowly scoped corrections to common Arabic speech-recognition errors.
 * Deliberately avoids converting arbitrary final ه to ة because both are valid.
 */
const speechCorrections: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?<![\p{L}\p{N}])المدرسه(?![\p{L}\p{N}])/gu, "المدرسة"],
  [/(?<![\p{L}\p{N}])مدرسه(?![\p{L}\p{N}])/gu, "مدرسة"],
];

export function correctArabicSpeechText(value: string): string {
  return speechCorrections.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}
