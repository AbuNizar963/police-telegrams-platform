import { describe, expect, it } from "vitest";
import { detectFileType, validateUploadedFile } from "./fileSecurity";

describe("uploaded file security", () => {
  it("detects binary signatures instead of trusting MIME metadata", () => {
    expect(detectFileType(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(detectFileType(Buffer.from("not a pdf"))).toBeNull();
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
