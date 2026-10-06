import { ENV } from "./_core/env";

export const COHERE_ARABIC_TRANSCRIBE_MODEL =
  "cohere-transcribe-arabic-07-2026";
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export class AiInputConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiInputConfigurationError";
  }
}

export class AiInputUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiInputUpstreamError";
  }
}

function decodeBase64(value: string, maxBytes: number): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new AiInputUpstreamError("صيغة الملف المرسل غير صالحة");
  }

  const bytes = Buffer.from(value, "base64");
  if (!bytes.byteLength || bytes.byteLength > maxBytes) {
    throw new AiInputUpstreamError("حجم الملف خارج الحد المسموح");
  }

  return bytes;
}

function validateWav(audio: Buffer): void {
  if (
    audio.byteLength < 44 ||
    audio.subarray(0, 4).toString("ascii") !== "RIFF" ||
    audio.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    throw new AiInputUpstreamError("التسجيل الصوتي ليس ملف WAV صالحًا");
  }
}

function validateImageSignature(image: Buffer, contentType: string): void {
  const isJpeg =
    image.byteLength >= 3 &&
    image[0] === 0xff &&
    image[1] === 0xd8 &&
    image[2] === 0xff;
  const isPng =
    image.byteLength >= 8 &&
    image
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp =
    image.byteLength >= 12 &&
    image.subarray(0, 4).toString("ascii") === "RIFF" &&
    image.subarray(8, 12).toString("ascii") === "WEBP";
  const valid =
    (contentType === "image/jpeg" && isJpeg) ||
    (contentType === "image/png" && isPng) ||
    (contentType === "image/webp" && isWebp);

  if (!valid) {
    throw new AiInputUpstreamError("صيغة الصورة لا تطابق نوع الملف المرسل");
  }
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postForm(
  url: string,
  form: FormData,
  headers: Record<string, string>
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    throw new AiInputUpstreamError("تعذر الاتصال بخدمة الإدخال الذكي");
  }

  const body = await readResponseJson(response);
  if (!response.ok) {
    throw new AiInputUpstreamError("تعذر إتمام المعالجة الذكية حاليًا");
  }

  return body;
}

export function getAiInputCapabilities() {
  return {
    speech: Boolean(ENV.cohereApiKey),
    ocr: Boolean(ENV.paddleOcrVlUrl && ENV.aiInputServiceToken),
  };
}

export async function transcribeArabicAudio(input: {
  audioBase64: string;
}): Promise<string> {
  if (!ENV.cohereApiKey) {
    throw new AiInputConfigurationError("خدمة التفريغ العربي غير مهيأة");
  }

  const audio = decodeBase64(input.audioBase64, MAX_AUDIO_BYTES);
  validateWav(audio);
  const form = new FormData();
  form.append("model", COHERE_ARABIC_TRANSCRIBE_MODEL);
  form.append("language", "ar");
  form.append(
    "file",
    new File([new Uint8Array(audio)], "telegram-arabic-input.wav", {
      type: "audio/wav",
    })
  );

  const body = await postForm(
    "https://api.cohere.com/v2/audio/transcriptions",
    form,
    {
      Authorization: `Bearer ${ENV.cohereApiKey}`,
    }
  );
  const text = jsonObject(body)?.text;

  if (typeof text !== "string") {
    throw new AiInputUpstreamError("أعادت خدمة التفريغ استجابة غير صالحة");
  }

  return text.trim();
}

export function textFromPaddleOcrResponse(body: unknown): string {
  const object = jsonObject(body);
  const text = object?.text;
  if (typeof text !== "string") {
    throw new AiInputUpstreamError("أعادت خدمة قراءة الصورة استجابة غير صالحة");
  }

  return text.trim();
}

export async function extractTextWithPaddleOcr(input: {
  imageBase64: string;
  contentType: string;
}): Promise<string> {
  if (!ENV.paddleOcrVlUrl) {
    throw new AiInputConfigurationError("خدمة قراءة الصور غير مهيأة");
  }
  if (!ENV.aiInputServiceToken) {
    throw new AiInputConfigurationError("سر خدمة قراءة الصور غير مهيأ");
  }
  if (!supportedImageTypes.has(input.contentType)) {
    throw new AiInputUpstreamError("صيغة الصورة غير مدعومة");
  }

  const image = decodeBase64(input.imageBase64, MAX_IMAGE_BYTES);
  validateImageSignature(image, input.contentType);
  const extension =
    input.contentType === "image/png"
      ? "png"
      : input.contentType === "image/webp"
        ? "webp"
        : "jpg";
  const form = new FormData();
  form.append(
    "file",
    new File([new Uint8Array(image)], `telegram-image.${extension}`, {
      type: input.contentType,
    })
  );

  const baseUrl = ENV.paddleOcrVlUrl.replace(/\/$/, "");
  const body = await postForm(`${baseUrl}/ocr`, form, {
    ...(ENV.aiInputServiceToken
      ? { "X-AI-Input-Token": ENV.aiInputServiceToken }
      : {}),
  });

  return textFromPaddleOcrResponse(body);
}
