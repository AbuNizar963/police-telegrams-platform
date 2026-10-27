import { describe, expect, it } from "vitest";
import { detectFileType, validateUploadedFile } from "./fileSecurity";

describe("uploaded file security", () => {
  it("detects binary signatures instead of trusting MIME metadata", () => {
    expect(detectFileType(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(detectFileType(Buffer.from("not a pdf"))).toBeNull();
  });

  it.each([
    {
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      declaredType: "image/jpeg",
      fileName: "photo.jpg",
    },
    {
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      declaredType: "image/png",
      fileName: "photo.png",
    },
    {
      bytes: Buffer.from("RIFF0000WEBP"),
      declaredType: "image/webp",
      fileName: "photo.webp",
    },
    {
      bytes: Buffer.from("%PDF-1.7\n"),
      declaredType: "application/pdf",
      fileName: "report.pdf",
    },
    {
      bytes: Buffer.from("ID3\x04\x00\x00"),
      declaredType: "audio/mpeg",
      fileName: "recording.mp3",
    },
    {
      bytes: Buffer.from("RIFF0000WAVE"),
      declaredType: "audio/wav",
      fileName: "recording.wav",
    },
    {
      bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      declaredType: "audio/webm",
      fileName: "recording.webm",
    },
  ] as const)("accepts matching $declaredType signatures", file => {
    expect(detectFileType(file.bytes)).toBe(file.declaredType);
    expect(() =>
      validateUploadedFile({ ...file, maxBytes: 10_000 })
    ).not.toThrow();
  });

  it("rejects empty and over-limit byte sequences", () => {
    const pdf = Buffer.from("%PDF-1.7\n");

    expect(() =>
      validateUploadedFile({
        bytes: Buffer.alloc(0),
        declaredType: "application/pdf",
        fileName: "report.pdf",
        maxBytes: pdf.byteLength,
      })
    ).toThrow("حجم الملف غير صالح");
    expect(() =>
      validateUploadedFile({
        bytes: pdf,
        declaredType: "application/pdf",
        fileName: "report.pdf",
        maxBytes: pdf.byteLength - 1,
      })
    ).toThrow("حجم الملف غير صالح");
  });

  it("rejects a declared PDF whose content is actually JavaScript/text", () => {
    expect(() =>
      validateUploadedFile({
        bytes: Buffer.from("<script>alert(1)</script>"),
        declaredType: "application/pdf",
        fileName: "report.pdf",
        maxBytes: 10_000,
      })
    ).toThrow("نوع الملف لا يطابق محتواه الحقيقي");
  });

  it("rejects path traversal and executable web extensions", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() =>
      validateUploadedFile({
        bytes: png,
        declaredType: "image/png",
        fileName: "../logo.png",
        maxBytes: 10_000,
      })
    ).toThrow("اسم الملف غير صالح");
    expect(() =>
      validateUploadedFile({
        bytes: png,
        declaredType: "image/png",
        fileName: "logo.html",
        maxBytes: 10_000,
      })
    ).toThrow("هذا الامتداد غير مسموح به");
  });
});
