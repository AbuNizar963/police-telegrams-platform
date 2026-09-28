import { describe, expect, it } from "vitest";
import { correctArabicSpeechText } from "./arabicSpeech";

describe("correctArabicSpeechText", () => {
  it("corrects the common school transcription error", () => {
    expect(correctArabicSpeechText("ذهبت إلى المدرسه")).toBe("ذهبت إلى المدرسة");
    expect(correctArabicSpeechText("مدرسه قريبة")).toBe("مدرسة قريبة");
  });

  it("preserves valid words ending in ه", () => {
    expect(correctArabicSpeechText("هذا وجه ومياه")).toBe("هذا وجه ومياه");
  });

  it("preserves punctuation and unrelated text", () => {
    expect(correctArabicSpeechText("المدرسه، ثم وجه!")).toBe("المدرسة، ثم وجه!");
    expect(correctArabicSpeechText("")).toBe("");
  });
});
