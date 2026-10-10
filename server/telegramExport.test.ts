import { describe, expect, it } from "vitest";
import { isAllowedExportResourceUrl, isSafeExportHtml } from "./telegramExport";

describe("telegram export HTML validation", () => {
  it("accepts embedded Cairo TTF fonts while preserving the HTML size limit", () => {
    const html = `<!doctype html>
      <html lang="ar" dir="rtl">
        <head>
          <style>
            @font-face {
              font-family: Cairo;
              src: url("data:font/ttf;base64,AAECAw==") format("truetype");
            }
          </style>
        </head>
        <body><main class="telegram-export-page">نص البرقية العربية</main></body>
      </html>`;

    expect(isSafeExportHtml(html)).toBe(true);
  });

  it("continues rejecting executable markup and unsupported data URLs", () => {
    expect(isSafeExportHtml('<html><script>alert(1)</script></html>')).toBe(false);
    expect(isSafeExportHtml('<html><img src="data:text/html,unsafe"></html>')).toBe(false);
    expect(isSafeExportHtml('<style>@font-face{src:url("data:font/ttf,raw")}</style>')).toBe(false);
    expect(isSafeExportHtml("")).toBe(false);
  });
});

describe("telegram export resource isolation", () => {
  it("allows the blank document origin, supported inline images, and embedded TTF fonts", () => {
    expect(isAllowedExportResourceUrl("about:blank")).toBe(true);
    expect(
      isAllowedExportResourceUrl("data:image/png;base64,iVBORw0KGgo=")
    ).toBe(true);
    expect(
      isAllowedExportResourceUrl("data:image/svg+xml;charset=utf-8,%3Csvg%3E")
    ).toBe(true);
    expect(isAllowedExportResourceUrl("data:font/ttf;base64,AAECAw==")).toBe(true);
  });

  it("blocks remote, local-network, file, and unsupported data resources", () => {
    expect(isAllowedExportResourceUrl("https://example.com/image.png")).toBe(
      false
    );
    expect(isAllowedExportResourceUrl("http://127.0.0.1:3000/admin")).toBe(
      false
    );
    expect(
      isAllowedExportResourceUrl("http://169.254.169.254/latest/meta-data/")
    ).toBe(false);
    expect(isAllowedExportResourceUrl("file:///etc/passwd")).toBe(false);
    expect(
      isAllowedExportResourceUrl("data:text/html,<script>alert(1)</script>")
    ).toBe(false);
    expect(isAllowedExportResourceUrl("data:font/ttf,raw-font-data")).toBe(
      false
    );
    expect(isAllowedExportResourceUrl("blob:https://example.com/id")).toBe(
      false
    );
  });
});
