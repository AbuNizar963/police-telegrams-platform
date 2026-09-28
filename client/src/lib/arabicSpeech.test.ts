import { describe, expect, it } from "vitest";
import { correctArabicSpeechText } from "./arabicSpeech";

describe("correctArabicSpeechText", () => {
  it("corrects frequent speech-to-text substitutions", () => {
    expect(correctArabicSpeechText("ذهبت إلى المدرسه")).toBe("ذهبت إلى المدرسة");
    expect(correctArabicSpeechText("مدرسه قريبة")).toBe("مدرسة قريبة");
    expect(correctArabicSpeechText("الجامعه والسياره")).toBe("الجامعة والسيارة");
    expect(correctArabicSpeechText("وصلت الرساله إلى الجهه المعنيه")).toBe(
      "وصلت الرسالة إلى الجهة المعنية",
    );
    expect(correctArabicSpeechText("تمت متابعه الحاله في المنطقه")).toBe(
      "تمت متابعة الحالة في المنطقة",
    );
  });

  it("preserves valid words ending in ه", () => {
    expect(correctArabicSpeechText("هذا وجه ومياه وانتباه")).toBe(
      "هذا وجه ومياه وانتباه",
    );
  });

  it("preserves punctuation and unrelated text", () => {
    expect(correctArabicSpeechText("المدرسه، ثم وجه!")).toBe(
      "المدرسة، ثم وجه!",
    );
    expect(correctArabicSpeechText("")).toBe("");
    expect(correctArabicSpeechText("المدرسه-الجامعه")).toBe(
      "المدرسة-الجامعة",
    );
  });

  it("does not replace a matching substring inside a longer word", () => {
    expect(correctArabicSpeechText("مدرسهية")).toBe("مدرسهية");
  });
});
