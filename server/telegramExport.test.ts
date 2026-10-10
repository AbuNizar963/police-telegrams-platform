import { describe, expect, it } from "vitest";

import {
  isAllowedExportResourceUrl,
  isSafeExportHtml,
} from "./telegramExport";

describe("telegram export HTML validation", () => {
  it("accepts embedded Cairo TTF fonts within the HTML size limit", () => {
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

  it("rejects executable markup and unsupported data URLs", () => {
    const scriptHtml = "<html><script>alert(1)</script></html>";
    const unsupportedImageHtml =
      '<html><img src="data:text/html,unsafe"></html>';
    const rawFontHtml = '<style>@font-face{src:url("data:font/ttf,raw")}</style>';

    expect(isSafeExportHtml(scriptHtml)).toBe(false);
    expect(isSafeExportHtml(unsupportedImageHtml)).toBe(false);
    expect(isSafeExportHtml(rawFontHtml)).toBe(false);
    expect(isSafeExportHtml("")).toBe(false);
  });
});

describe("telegram export resource isolation", () => {
  it("allows the blank origin, inline images, and embedded TTF fonts", () => {
    const pngDataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const svgDataUrl = "data:image/svg+xml;charset=utf-8,%3Csvg%3E";
    const fontDataUrl = "data:font/ttf;base64,AAECAw==";

    expect(isAllowedExportResourceUrl("about:blank")).toBe(true);
    expect(isAllowedExportResourceUrl(pngDataUrl)).toBe(true);
    expect(isAllowedExportResourceUrl(svgDataUrl)).toBe(true);
    expect(isAllowedExportResourceUrl(fontDataUrl)).toBe(true);
  });

  it("blocks unsafe network and data resources", () => {
    const externalUrl = "https://example.com/image.png";
    const localhostUrl = "http://127.0.0.1:3000/admin";
    const metadataUrl = "http://169.254.169.254/latest/meta-data/";
    const fileUrl = "file:///etc/passwd";
    const htmlDataUrl = "data:text/html,<script>alert(1)</script>";
    const rawFontUrl = "data:font/ttf,raw-font-data";
    const blobUrl = "blob:https://example.com/id";

    expect(isAllowedExportResourceUrl(externalUrl)).toBe(false);
    expect(isAllowedExportResourceUrl(localhostUrl)).toBe(false);
    expect(isAllowedExportResourceUrl(metadataUrl)).toBe(false);
    expect(isAllowedExportResourceUrl(fileUrl)).toBe(false);
    expect(isAllowedExportResourceUrl(htmlDataUrl)).toBe(false);
    expect(isAllowedExportResourceUrl(rawFontUrl)).toBe(false);
    expect(isAllowedExportResourceUrl(blobUrl)).toBe(false);
  });
});
