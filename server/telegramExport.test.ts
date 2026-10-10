import { describe, expect, it } from "vitest";
import { isSafeExportHtml } from "./telegramExport";

const safeDocument = `<!doctype html>
<html lang="ar" dir="rtl">
  <head><base href="https://example.test/" /></head>
  <body>
    <article class="telegram-export-page">
      <p>يُرجى إرسال البيانات عبر data: والقناة javascript: عند الحاجة.</p>
      <img src="data:image/png;base64,AAAA" alt="شعار" />
    </article>
  </body>
</html>`;

describe("telegram export HTML validation", () => {
  it("allows legitimate telegram text and embedded image data", () => {
    expect(isSafeExportHtml(safeDocument)).toBe(true);
  });

  it("rejects executable tags and event handlers", () => {
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

  it("rejects executable and non-image data URLs in attributes", () => {
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
  });
});
