/**
 * Corrects a conservative set of frequent Arabic speech/OCR substitutions.
 *
 * Replacements are whole-word only. This fixes predictable ة/ه mistakes such
 * as «المدرسه» without corrupting valid words such as «وجه»، «مياه»، or
 * «انتباه» that genuinely end in هـ.
 */
const explicitWordCorrections: Readonly<Record<string, string>> = {
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
  الامنيه: "الأمنية",
  الجنائيه: "الجنائية",
  الاداريه: "الإدارية",
  المروريه: "المرورية",
  اليوميه: "اليومية",
  الشهريه: "الشهرية",
  جهه: "جهة",
  الغرفه: "الغرفة",
  غرفه: "غرفة",
  الاداره: "الإدارة",
  اداره: "إدارة",
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

// A conservative vocabulary for common Arabic feminine nouns and adjectives.
// Only listed words are changed; a blanket final ه -> ة rule would corrupt
// valid words such as «وجه»، «تنبيه»، and «توجيه».
const commonTaaMarbutaWords = `
مدرسة المدرسة جامعة الجامعة حياة الحياة سيارة السيارة مدينة المدينة قضية القضية
خدمة الخدمة جهة الجهة غرفة الغرفة إدارة الإدارة الادارة الادارة رسالة الرسالة
مهمة المهمة منطقة المنطقة حادثة الحادثة واقعة الواقعة حالة الحالة قوة القوة
شرطة الشرطة صحة الصحة حماية الحماية متابعة المتابعة محكمة المحكمة نيابة النيابة
وزارة الوزارة دائرة الدائرة مؤسسة المؤسسة مديرية المديرية ساعة الساعة يومية اليومية
شهرية الشهرية أسبوعية الأسبوعية سنوية السنوية عملية العملية آلية الآلية دورية الدورية
مركبة المركبة دراجة الدراجة نقطة النقطة مدة المدة فترة الفترة محافظة المحافظة
قرية القرية حملة الحملة خطة الخطة استجابة الاستجابة مراقبة المراقبة ملاحظة الملاحظة
منشأة المنشأة إفادة الإفادة وثيقة الوثيقة إجازة الإجازة زيارة الزيارة مداهمة المداهمة
إصابة الإصابة معالجة المعالجة مواجهة المواجهة رسمية الرسمية أمنية الأمنية جنائية الجنائية
إدارية الإدارية مرورية المرورية قضائية القضائية اجتماعية الاجتماعية اقتصادية الاقتصادية
سياسية السياسية صحية الصحية مدنية المدنية عسكرية العسكرية حكومية الحكومية وطنية الوطنية
دولية الدولية محلية المحلية داخلية الداخلية خارجية الخارجية ميدانية الميدانية نهائية النهائية
أولية الأولية طارئة الطارئة مباشرة المباشرة مؤقتة المؤقتة دائمة الدائمة مسلحة المسلحة
إضافية الإضافية ضرورية الضرورية مطلوبة المطلوبة مستعجلة المستعجلة قانونية القانونية
إلكترونية الإلكترونية فنية الفنية مركزية المركزية قريبة القريبة بعيدة البعيدة مشتركة المشتركة
مخصصة المخصصة مجهزة المجهزة معنية المعنية مسؤولة المسؤولة موجودة الموجودة متواجدة المتواجدة
مخالفة المخالفة مفقودة المفقودة موقوفة الموقوفة محتجزة المحتجزة مسروقة المسروقة
مقيدة المقيدة معلومة المعلومة مجهولة المجهولة عاجلة العاجلة استثنائية الاستثنائية
تلقائية التلقائية ضرورية الضرورية أمنية الأمنية سكنية السكنية خدمية الخدمية تنظيمية التنظيمية
`
  .trim()
  .split(/\s+/);

const generatedTaaMarbutaCorrections: Readonly<Record<string, string>> =
  Object.fromEntries(
    commonTaaMarbutaWords
      .filter(word => word.endsWith("ة"))
      .map(word => [`${word.slice(0, -1)}ه`, word])
  );

const wordCorrections: Readonly<Record<string, string>> = {
  ...generatedTaaMarbutaCorrections,
  ...explicitWordCorrections,
};

const arabicDiacritics =
  "[\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06ED]*";

function wordPattern(value: string): RegExp {
  const letters = Array.from(value)
    .map(letter => `${letter}${arabicDiacritics}`)
    .join("");
  // Allow common attached Arabic conjunctions and prepositions («و»، «ف»، «ب»،
  // «ك»، «ل») while keeping whole-word matching to protect unrelated words.
  return new RegExp(
    `(^|(?<=[^ء-يA-Za-z0-9])|(?<=[وفبكل]))${letters}(?=$|[^ء-يA-Za-z0-9])`,
    "g"
  );
}

const correctionPatterns = Object.entries(wordCorrections).map(
  ([incorrect, correct]) => ({
    pattern: wordPattern(incorrect),
    replacement: `$1${correct}`,
  })
);

export function correctArabicText(value: string): string {
  return correctionPatterns.reduce(
    (text, correction) =>
      text.replace(correction.pattern, correction.replacement),
    value.normalize("NFC")
  );
}

/** @deprecated Use correctArabicText: this function now also covers OCR output. */
export const correctArabicSpeechText = correctArabicText;

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

  let collapsed = words;
  // Browser ASR may send a chain of revisions in overlapping segments. Repeat
  // the merge until a pass makes no change, rather than retaining the final
  // overlapping revision.
  for (let pass = 0; pass < words.length; pass += 1) {
    const next = collapseProgressiveDatePhrases(collapsed);
    if (next.join(" ") === collapsed.join(" ")) return next.join(" ");
    collapsed = next;
  }

  return collapsed.join(" ");
}

function collapseProgressiveDatePhrases(words: string[]): string[] {
  const result: string[] = [];
  let index = 0;

  while (index < words.length) {
    const remaining = words.slice(index);
    const match = remaining
      .join(" ")
      .match(
        /^(الساعة\s+\d{1,2}(?::\d{2})?\s+من\s+تاريخ\s+)(\d{1,2}(?:[/.\-]\d{1,2})?(?:[/.\-]\d{2,4})?)(?=\s|$)/
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
        !/^\d{1,2}(?:[/.\-]\d{1,2})?(?:[/.\-]\d{2,4})?$/.test(
          comparableWord(candidateDate)
        )
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
