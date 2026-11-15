import { createHash } from "node:crypto";

export const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
] as const;

export type AllowedAttachmentType = (typeof ALLOWED_ATTACHMENT_TYPES)[number];

function startsWithBytes(bytes: Buffer, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

/** Identify the binary signature rather than trusting the browser supplied MIME. */
export function detectFileType(bytes: Buffer): AllowedAttachmentType | null {
  if (!Buffer.isBuffer(bytes)) return null;
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WAVE"
  )
    return "audio/wav";
  if (startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm";
  if (
    bytes.subarray(0, 3).toString() === "ID3" ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  )
    return "audio/mpeg";
  return null;
}

export function validateUploadedFile(input: unknown): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("بيانات الملف غير صالحة");
  }

  const candidate = input as Record<string, unknown>;
  const { bytes, declaredType, fileName, maxBytes } = candidate;
  if (
    !Buffer.isBuffer(bytes) ||
    typeof declaredType !== "string" ||
    !ALLOWED_ATTACHMENT_TYPES.includes(declaredType as AllowedAttachmentType) ||
    typeof fileName !== "string" ||
    typeof maxBytes !== "number" ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0
  ) {
    throw new Error("بيانات الملف غير صالحة");
  }

  if (bytes.length === 0 || bytes.length > maxBytes) {
    throw new Error("حجم الملف غير صالح");
  }
  if (
    !/^[^\x00-\x1f\\/]+$/.test(fileName) ||
    fileName.length > 180
  ) {
    throw new Error("اسم الملف غير صالح");
  }
  const actualType = detectFileType(bytes);
  if (!actualType || actualType !== declaredType) {
    throw new Error("نوع الملف لا يطابق محتواه الحقيقي");
  }
  if (/[.]html?$/i.test(fileName) || /[.]svg$/i.test(fileName)) {
    throw new Error("هذا الامتداد غير مسموح به");
  }
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
