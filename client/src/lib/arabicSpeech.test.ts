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


describe("removeRepeatedSpeech", () => {
  it("collapses repeated words and phrases from speech recognition", () => {
    expect(
      removeRepeatedSpeech(
        "في في الساعة في الساعة 15 في الساعة 15 في الساعة 15 من تاريخ",
      ),
    ).toBe("في الساعة 15 من تاريخ");
  });

  it("preserves repeated words when they are not adjacent", () => {
    expect(removeRepeatedSpeech("في الساعة ثم في الساعة")).toBe(
      "في الساعة ثم في الساعة",
    );
  });

  it("handles punctuation and empty input", () => {
    expect(removeRepeatedSpeech("الساعة، الساعة، 15")).toBe("الساعة، 15");
    expect(removeRepeatedSpeech("   ")).toBe("");
  });
});
