/**
 * Corrects a conservative set of frequent Arabic speech-to-text substitutions.
 *
 * Speech engines sometimes emit ه where a word should end in ة. Replacements
 * are limited to known complete words so valid words such as وجه، مياه، and
 * انتباه are never changed by a blanket final-letter substitution.
 */
const wordCorrections: Readonly<Record<string, string>> = {
  الساعه: "الساعة",
  ساعه: "ساعة",
  المدرسه: "المدرسة",
  مدرسه: "مدرسة",
  الجامعه: "الجامعة",
  جامعه: "جامعة",
  الحياه: "الحياة",
  حياه: "حياة",
  السياره: "السيارة",
  سياره: "سيارة",
  المدينه: "المدينة",
  مدينه: "مدينة",
  القضيه: "القضية",
  قضيه: "قضية",
  الخدمه: "الخدمة",
  خدمه: "خدمة",
  الجهه: "الجهة",
  المعنيه: "المعنية",
  المسؤوله: "المسؤولة",
  الرسميه: "الرسمية",
  الامنيه: "الامنية",
  الجنائيه: "الجنائية",
  الاداريه: "الادارية",
  المروريه: "المرورية",
  اليوميه: "اليومية",
  الشهريه: "الشهرية",
  جهه: "جهة",
  الغرفه: "الغرفة",
  غرفه: "غرفة",
  الاداره: "الادارة",
  اداره: "ادارة",
  الرساله: "الرسالة",
  رساله: "رسالة",
  المهمه: "المهمة",
  مهمه: "مهمة",
  المنطقه: "المنطقة",
  منطقه: "منطقة",
  الحادثه: "الحادثة",
  حادثه: "حادثة",
  الواقعه: "الواقعة",
  واقعه: "واقعة",
  الحاله: "الحالة",
  حاله: "حالة",
  القوه: "القوة",
  قوه: "قوة",
  الشرطه: "الشرطة",
  شرطه: "شرطة",
  الصحه: "الصحة",
  صحه: "صحة",
  الحمايه: "الحماية",
  حمايه: "حماية",
  المتابعه: "المتابعة",
  متابعه: "متابعة",
  المحكمه: "المحكمة",
  محكمه: "محكمة",
  النيابه: "النيابة",
  نيابه: "نيابة",
  الوزاره: "الوزارة",
  وزاره: "وزارة",
  الدائره: "الدائرة",
  دائره: "دائرة",
  المؤسسه: "المؤسسة",
  مؤسسه: "مؤسسة",
  المديريه: "المديرية",
  مديريه: "مديرية",
  البلاغه: "البلاغة",
};

const correctionPatterns = Object.entries(wordCorrections).map(
  ([incorrect, correct]) => ({
    pattern: new RegExp(
      `(^|[^ء-يA-Za-z0-9])${incorrect}(?=$|[^ء-يA-Za-z0-9])`,
      "g"
    ),
    replacement: `$1${correct}`,
  })
);

export function correctArabicSpeechText(value: string): string {
  return correctionPatterns.reduce(
    (text, correction) =>
      text.replace(correction.pattern, correction.replacement),
    value
  );
}

function comparableWord(word: string): string {
  return word.replace(/^[،؛,.!?؟:]+|[،؛,.!?؟:]+$/g, "");
}

/**
 * Removes adjacent exact repeats and progressive repetitions of a timestamp
 * phrase. Speech engines may repeatedly revise a date while appending digits
 * (for example: "الساعة 15 من تاريخ 13" then "... 13/4" then "... 13/4/2026").
 * In that case retain the most complete version instead of concatenating all
 * intermediate hypotheses.
 */
export function removeRepeatedSpeech(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  let index = 0;

  while (index < words.length) {
    let removed = false;
    const maxPhraseLength = Math.min(8, index, words.length - index);

    for (let length = maxPhraseLength; length >= 1; length -= 1) {
      const previousStart = index - length;
      if (previousStart < 0 || index + length > words.length) continue;

      const previous = words.slice(previousStart, index).map(comparableWord);
      const current = words.slice(index, index + length).map(comparableWord);
      if (previous.every((word, offset) => word && word === current[offset])) {
        words.splice(index, length);
        removed = true;
        break;
      }
    }

    if (!removed) index += 1;
  }

  return collapseProgressiveDatePhrases(words).join(" ");
}

function collapseProgressiveDatePhrases(words: string[]): string[] {
  const result: string[] = [];
  let index = 0;

  while (index < words.length) {
    const remaining = words.slice(index);
    const match = remaining
      .join(" ")
      .match(
        /^(الساعة\s+\d{1,2}(?::\d{2})?\s+من\s+تاريخ\s+)(\d{1,2}(?:[/.\-]\d{1,2}){0,2})(?=\s|$)/
      );

    if (!match) {
      result.push(words[index]);
      index += 1;
      continue;
    }

    const phrase = match[1];
    const date = match[2];
    const phraseWords = phrase.trim().split(/\s+/);
    const dateParts = date.split(/[/.\-]/);
    const consumed = phraseWords.length + 1;
    let nextIndex = index + consumed;
    let bestDate = date;
    let bestParts = dateParts.length;

    while (nextIndex < words.length) {
      const nextPhrase = words
        .slice(nextIndex, nextIndex + phraseWords.length)
        .map(comparableWord);
      if (nextPhrase.join(" ") !== phraseWords.join(" ")) break;

      const candidateDate = words[nextIndex + phraseWords.length];
      if (
        !candidateDate ||
        !/^\d{1,2}(?:[/.\-]\d{1,2}){0,2}$/.test(comparableWord(candidateDate))
      ) {
        break;
      }

      const candidateParts = comparableWord(candidateDate).split(/[/.\-]/);
      const isProgression =
        candidateParts.length >= bestParts &&
        candidateParts
          .slice(0, bestParts)
          .every(
            (part, partIndex) => part === bestDate.split(/[/.\-]/)[partIndex]
          );

      if (!isProgression) break;
      bestDate = comparableWord(candidateDate);
      bestParts = candidateParts.length;
      nextIndex += consumed;
    }

    result.push(...phraseWords, bestDate);
    index = nextIndex;
  }

  return result;
}
