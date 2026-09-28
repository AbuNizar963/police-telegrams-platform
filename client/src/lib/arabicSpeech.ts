/**
 * Corrects a conservative set of frequent Arabic speech-to-text substitutions.
 *
 * Speech engines sometimes emit ه where a word should end in ة. Replacements
 * are limited to known complete words so valid words such as وجه، مياه، and
 * انتباه are never changed by a blanket final-letter substitution.
 */
const wordCorrections: Readonly<Record<string, string>> = {
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
      "g",
    ),
    replacement: `$1${correct}`,
  }),
);

export function correctArabicSpeechText(value: string): string {
  return correctionPatterns.reduce(
    (text, correction) =>
      text.replace(correction.pattern, correction.replacement),
    value,
  );
}
