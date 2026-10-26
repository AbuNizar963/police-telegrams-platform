import { describe, expect, it } from "vitest";
import { detectOfficialDocumentLogoMimeType } from "./officialDocumentLogo";

describe("official document logo MIME detection", () => {
  it("detects storage images from their bytes when the proxy reports octet-stream", () => {
    expect(
      detectOfficialDocumentLogoMimeType(
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        "application/octet-stream",
        "/api/storage/logo"
      )
    ).toBe("image/jpeg");
    expect(
      detectOfficialDocumentLogoMimeType(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
        "application/octet-stream",
        "/api/storage/logo"
      )
    ).toBe("image/webp");
  });

  it("rejects unsupported or unidentified resources", () => {
    expect(
      detectOfficialDocumentLogoMimeType(
        new Uint8Array([1, 2, 3]),
        "application/octet-stream",
        "/api/storage/logo"
      )
    ).toBeNull();
  });
});
