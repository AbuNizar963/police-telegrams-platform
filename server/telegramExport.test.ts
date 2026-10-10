import { describe, expect, it } from "vitest";
import { isAllowedExportResourceUrl, isSafeExportHtml } from "./telegramExport";

const safeDocument = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <base href="https://example.test/" />
    <style>
      @font-face {
        font-family: Cairo;
        src: url("data:font/ttf;base64,AAECAw==") format("truetype");
      }
    </style>
  </head>
  <body>
    <article class="telegram-export-page">
      <p>يُرجى إرسال البيانات عبر data: والقناة javascript: عند الحاجة.</p>
      <img src="data:image/png;base64,AAAA" alt="شعار" />
    </article>
  </body>
</html>`;

describe("telegram export HTML validation", () => {
  it("allows legitimate text, embedded images, and Cairo fonts", () => {
    expect(isSafeExportHtml(safeDocument)).toBe(true);
  });

  it("rejects executable markup and event handlers", () => {
    expect(
      isSafeExportHtml(
        safeDocument.replace("</body>", "<script>alert(1)</script></body>")
      )
    ).toBe(false);
    expect(
      isSafeExportHtml(
        safeDocument.replace("<article", '<article onclick="alert(1)"')
      )
    ).toBe(false);
  });

  it("rejects executable and unsupported data URLs in attributes", () => {
    expect(
      isSafeExportHtml(
        safeDocument.replace(
          "data:image/png;base64,AAAA",
          "javascript:alert(1)"
        )
      )
    ).toBe(false);
    expect(
      isSafeExportHtml(
        safeDocument.replace(
          "data:image/png;base64,AAAA",
          "data:text/html;base64,AAAA"
        )
      )
    ).toBe(false);
    expect(
      isSafeExportHtml(
        safeDocument.replace(
          'src="data:image/png;base64,AAAA"',
          "src=data:text/html;base64,AAAA"
        )
      )
    ).toBe(false);
  });

  it("rejects empty HTML", () => {
    expect(isSafeExportHtml("")).toBe(false);
  });
});

describe("telegram export resource isolation", () => {
  it("allows the blank origin, inline images, and embedded TTF fonts", () => {
    expect(isAllowedExportResourceUrl("about:blank")).toBe(true);
    expect(
      isAllowedExportResourceUrl("data:image/png;base64,iVBORw0KGgo=")
    ).toBe(true);
    expect(
      isAllowedExportResourceUrl("data:image/svg+xml;charset=utf-8,%3Csvg%3E")
    ).toBe(true);
    expect(isAllowedExportResourceUrl("data:font/ttf;base64,AAECAw==")).toBe(
      true
    );
  });

  it("blocks unsafe network and data resources", () => {
    for (const url of [
      "https://example.com/image.png",
      "http://127.0.0.1:3000/admin",
      "http://169.254.169.254/latest/meta-data/",
      "file:///etc/passwd",
      "data:text/html,<script>alert(1)</script>",
      "data:font/ttf,raw-font-data",
      "blob:https://example.com/id",
    ]) {
      expect(isAllowedExportResourceUrl(url)).toBe(false);
    }
  });
});
