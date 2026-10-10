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
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE")
    return "audio/wav";
  if (bytes.subarray(0, 4).toString() === "\x1a\x45\xdf\xa3") return "audio/webm";
  if (bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))
    return "audio/mpeg";
  return null;
}

export function validateUploadedFile(input: {
  bytes: Buffer;
  declaredType: AllowedAttachmentType;
  fileName: string;
  maxBytes: number;
}): void {
  if (input.bytes.length === 0 || input.bytes.length > input.maxBytes) {
    throw new Error("حجم الملف غير صالح");
  }
  if (!/^[^\x00-\x1f\\/]+$/.test(input.fileName) || input.fileName.length > 180) {
    throw new Error("اسم الملف غير صالح");
  }
  const actualType = detectFileType(input.bytes);
  if (!actualType || actualType !== input.declaredType) {
    throw new Error("نوع الملف لا يطابق محتواه الحقيقي");
  }
  if (/[.]html?$/i.test(input.fileName) || /[.]svg$/i.test(input.fileName)) {
    throw new Error("هذا الامتداد غير مسموح به");
  }
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
