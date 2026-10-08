import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARABIC_SPEECH_CONTEXT_HINTS,
  createArabicSpeechRecognition,
} from "./localInput";

class FakeSpeechRecognition extends EventTarget {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  phrases: Array<{ phrase: string; boost: number }> = [];
  onstart: ((event: Event) => void) | null = null;
  onend: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onresult: ((event: Event) => void) | null = null;

  start() {}
  stop() {}
  abort() {}
}

class FakeSpeechRecognitionPhrase {
  constructor(
    readonly phrase: string,
    readonly boost: number
  ) {}
}

afterEach(() => vi.unstubAllGlobals());

describe("Arabic browser speech recognition", () => {
  it("includes school and telegram vocabulary in contextual hints", () => {
    expect(ARABIC_SPEECH_CONTEXT_HINTS).toContainEqual(["المدرسة", 5]);
    expect(ARABIC_SPEECH_CONTEXT_HINTS).toContainEqual(["البرقية", 4]);
  });

  it("applies phrase hints when the browser exposes the experimental API", () => {
    vi.stubGlobal("window", {
      SpeechRecognition: FakeSpeechRecognition,
      SpeechRecognitionPhrase: FakeSpeechRecognitionPhrase,
    });

    const recognition = createArabicSpeechRecognition();
    expect(recognition.lang).toBe("ar-SA");
    expect(recognition.continuous).toBe(true);
    expect(
      recognition.phrases?.map(({ phrase, boost }) => [phrase, boost])
    ).toContainEqual(["المدرسة", 5]);
  });

  it("works normally when contextual phrases are unavailable", () => {
    vi.stubGlobal("window", {
      SpeechRecognition: FakeSpeechRecognition,
      SpeechRecognitionPhrase: undefined,
    });

    expect(() => createArabicSpeechRecognition()).not.toThrow();
  });
});
