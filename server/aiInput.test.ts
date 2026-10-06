import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import {
  AiInputConfigurationError,
  COHERE_ARABIC_TRANSCRIBE_MODEL,
  extractTextWithPaddleOcr,
  getAiInputCapabilities,
  textFromPaddleOcrResponse,
  transcribeArabicAudio,
} from "./aiInput";

const originalEnv = {
  cohereApiKey: ENV.cohereApiKey,
  paddleOcrVlUrl: ENV.paddleOcrVlUrl,
  aiInputServiceToken: ENV.aiInputServiceToken,
};

function wavFixture(): string {
  const wav = Buffer.alloc(44);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16_000, 24);
  wav.writeUInt32LE(32_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  return wav.toString("base64");
}

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]).toString("base64");

afterEach(() => {
  ENV.cohereApiKey = originalEnv.cohereApiKey;
  ENV.paddleOcrVlUrl = originalEnv.paddleOcrVlUrl;
  ENV.aiInputServiceToken = originalEnv.aiInputServiceToken;
  vi.unstubAllGlobals();
});

describe("AI input providers", () => {
  it("does not advertise the private OCR service without its shared secret", () => {
    ENV.paddleOcrVlUrl = "https://ocr.internal.example";
    ENV.aiInputServiceToken = "";

    expect(getAiInputCapabilities().ocr).toBe(false);
  });

  it("does not call a transcription provider until a server-only key is configured", async () => {
    ENV.cohereApiKey = "";

    await expect(
      transcribeArabicAudio({
        audioBase64: wavFixture(),
      })
    ).rejects.toBeInstanceOf(AiInputConfigurationError);
  });

  it("uses Cohere's Arabic model with a WAV multipart upload", async () => {
    ENV.cohereApiKey = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "المدرسه قريبة" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeArabicAudio({
        audioBase64: wavFixture(),
      })
    ).resolves.toBe("المدرسه قريبة");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.cohere.com/v2/audio/transcriptions");
    expect(options.headers).toEqual({ Authorization: "Bearer test-key" });
    const form = options.body as FormData;
    expect(form.get("model")).toBe("cohere-transcribe-03-2026");
    expect(form.get("model")).toBe(COHERE_ARABIC_TRANSCRIBE_MODEL);
    expect(form.get("language")).toBe("ar");
    expect(form.get("file")).toBeInstanceOf(File);
  });

  it("proxies supported images only to the configured PaddleOCR-VL service", async () => {
    ENV.paddleOcrVlUrl = "https://ocr.internal.example/";
    ENV.aiInputServiceToken = "internal-token";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "نص من الكاميرا" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractTextWithPaddleOcr({
        imageBase64: pngSignature,
        contentType: "image/png",
      })
    ).resolves.toBe("نص من الكاميرا");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ocr.internal.example/ocr",
      expect.objectContaining({
        headers: { "X-AI-Input-Token": "internal-token" },
      })
    );
  });

  it("rejects media that claims a MIME type without the matching signature", async () => {
    ENV.cohereApiKey = "test-key";
    ENV.paddleOcrVlUrl = "https://ocr.internal.example";
    ENV.aiInputServiceToken = "internal-token";

    await expect(
      transcribeArabicAudio({
        audioBase64: Buffer.from("not-a-wav").toString("base64"),
      })
    ).rejects.toThrow("WAV صالح");
    await expect(
      extractTextWithPaddleOcr({
        imageBase64: Buffer.from("not-a-png").toString("base64"),
        contentType: "image/png",
      })
    ).rejects.toThrow("لا تطابق");
  });

  it("requires the companion OCR service to return a text contract", () => {
    expect(() => textFromPaddleOcrResponse({ result: "missing" })).toThrow(
      "استجابة غير صالحة"
    );
  });
});
