import { describe, expect, it } from "vitest";
import {
  hasMultiPageTelegramLayout,
  getTelegramRenderLayoutCss,
  isAllowedExportResourceUrl,
  isSafeExportHtml,
  replaceOfficialLogoPlaceholder,
  resolveDepartmentLogoStorageKey,
  withPngDpiMetadata,
  MAX_TELEGRAM_PNG_BYTES,
  PNG_RENDER_SCALE_FACTORS,
} from "./telegramExport";

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
      <img src="https://telegram-logo.invalid/official" alt="شعار" />
    </article>
  </body>
</html>`;

describe("telegram export page geometry", () => {
  it("uses full A4 with a single 10mm inset for PDF output", () => {
    const css = getTelegramRenderLayoutCss(true);

    expect(css).toMatch(
      /@page\s*\{\s*size:\s*A4 portrait;\s*margin:\s*0;\s*\}/
    );
    expect(css).toMatch(
      /\.telegram-export-page\s*\{[^}]*width:\s*210mm !important;[^}]*padding:\s*10mm !important;/s
    );
    expect(css).toContain("min-height: 297mm !important;");
    expect(css).toContain("min-height: 287mm !important;");
    expect(css).toContain("padding: 10mm 10mm 0 !important;");
    expect(css).toContain(".telegram-export-page .page-watermark");
    expect(css).toContain("inset: 0 auto auto 0 !important;");
    expect(css).toContain("width: 210mm !important;");
    expect(css).toContain("height: 297mm !important;");
    expect(css).not.toContain(
      ".telegram-export-page.telegram-multipage .page-watermark"
    );
    expect(css).not.toMatch(/width:\s*190mm/);
    expect(css).not.toMatch(/margin:\s*10mm/);
  });

  it("keeps single-page PNG capture on the full A4 canvas", () => {
    const css = getTelegramRenderLayoutCss(false);

    expect(css).toContain("width: 210mm !important;");
    expect(css).toContain("height: 297mm !important;");
    expect(css).toContain("padding: 10mm !important;");
    expect(css).toMatch(
      /@page\s*\{\s*size:\s*A4 portrait;\s*margin:\s*0;\s*\}/
    );
  });
});

describe("telegram export HTML validation", () => {
  it("allows safe document text, the server logo marker, and Cairo fonts", () => {
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
    expect(
      isSafeExportHtml(
        safeDocument.replace("<article", "<article onclick=alert(1)")
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

  it("rejects Base64 image URLs while continuing to allow embedded fonts", () => {
    expect(
      isSafeExportHtml(
        safeDocument.replace(
          "https://telegram-logo.invalid/official",
          "data:image/png;base64,AAAA"
        )
      )
    ).toBe(false);
    expect(isAllowedExportResourceUrl("data:image/png;base64,AAAA")).toBe(
      false
    );
    expect(isAllowedExportResourceUrl("data:font/ttf;base64,AAECAw==")).toBe(
      true
    );
  });

  it("rejects unsafe URLs with mixed whitespace and quoted attributes", () => {
    for (const attribute of [
      'src = " javascript:alert(1)"',
      "href='\n vbscript:alert(1)'",
      "src=data:text/html;base64,AAAA",
    ]) {
      expect(
        isSafeExportHtml(
          safeDocument.replace('src="data:image/png;base64,AAAA"', attribute)
        )
      ).toBe(false);
    }
  });

  it("rejects empty HTML", () => {
    expect(isSafeExportHtml("")).toBe(false);
  });

  it("rejects an export document above the serverless request budget", () => {
    const oversizedDocument = `${safeDocument}${"x".repeat(3_900_001)}`;
    expect(isSafeExportHtml(oversizedDocument)).toBe(false);
  });
});

describe("official organization logo storage path", () => {
  it("resolves legacy Supabase object URLs to binary storage keys", () => {
    expect(
      resolveDepartmentLogoStorageKey(
        "https://project.supabase.co/storage/v1/object/public/telegram-files/department/logos/00000000-0000-4000-8000-000000000101/logo%20mark.png",
        "telegram-files"
      )
    ).toBe(
      "department/logos/00000000-0000-4000-8000-000000000101/logo mark.png"
    );
  });

  it("decodes only the same-origin protected storage path", () => {
    expect(
      resolveDepartmentLogoStorageKey(
        "/api/storage/department/logos/00000000-0000-4000-8000-000000000101/logo%20mark.png"
      )
    ).toBe(
      "department/logos/00000000-0000-4000-8000-000000000101/logo mark.png"
    );
  });

  it("rejects external and path-escaping logo sources", () => {
    expect(() =>
      resolveDepartmentLogoStorageKey(
        "https://storage.example.com/department/logos/logo.png"
      )
    ).toThrow();
    expect(() =>
      resolveDepartmentLogoStorageKey(
        "/api/storage/department/logos/../../private/file.png"
      )
    ).toThrow();
  });
});

describe("official organization logo binary handoff", () => {
  it("replaces the server-only marker with the internal binary image URL", () => {
    const html =
      '<img src="telegram-logo://official" alt="شعار" />' +
      '<img src="telegram-logo://official" alt="علامة مائية" />';

    expect(replaceOfficialLogoPlaceholder(html)).toBe(
      '<img src="https://telegram-logo.invalid/official" alt="شعار" />' +
        '<img src="https://telegram-logo.invalid/official" alt="علامة مائية" />'
    );
  });

  it("rejects a missing official-logo marker", () => {
    expect(() =>
      replaceOfficialLogoPlaceholder("<img src='/logo.png' />")
    ).toThrow(/placeholder is missing/);
  });
});

describe("telegram export resource isolation", () => {
  it("allows only the blank origin and embedded TTF font resources", () => {
    expect(isAllowedExportResourceUrl("about:blank")).toBe(true);
    expect(
      isAllowedExportResourceUrl("data:image/png;base64,iVBORw0KGgo=")
    ).toBe(false);
    expect(
      isAllowedExportResourceUrl("data:image/svg+xml;charset=utf-8,%3Csvg%3E")
    ).toBe(false);
    expect(isAllowedExportResourceUrl("data:font/ttf;base64,AAECAw==")).toBe(
      true
    );
  });

  it("blocks unsafe network and data resources", () => {
    for (const url of [
      "https://example.com/image.png",
      "https://telegram-logo.invalid/official",
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

describe("telegram multi-page image export", () => {
  it("recognizes a telegram marked for multi-page output", () => {
    expect(
      hasMultiPageTelegramLayout(
        '<article class="telegram-export-page telegram-multipage"></article>'
      )
    ).toBe(true);
  });

  it("keeps a one-page telegram as a single PNG", () => {
    expect(
      hasMultiPageTelegramLayout(
        '<article class="telegram-export-page"></article>'
      )
    ).toBe(false);
  });
});

describe("official PNG resolution metadata", () => {
  it("starts at 384 DPI and leaves headroom below Vercel's hard response cap", () => {
    expect(PNG_RENDER_SCALE_FACTORS).toEqual([4, 3, 2]);
    expect(MAX_TELEGRAM_PNG_BYTES).toBe(4_000_000);
  });

  it("writes high-quality physical resolution without changing image dimensions", () => {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrLength = Buffer.alloc(4);
    ihdrLength.writeUInt32BE(13, 0);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const placeholderCrc = Buffer.alloc(4);
    const original = Buffer.concat([
      signature,
      ihdrLength,
      Buffer.from("IHDR", "ascii"),
      ihdr,
      placeholderCrc,
      Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]),
    ]);

    const result = withPngDpiMetadata(original);
    const physicalChunk = result.indexOf(Buffer.from("pHYs", "ascii"));
    expect(physicalChunk).toBeGreaterThan(0);
    expect(result.readUInt32BE(physicalChunk + 4)).toBe(
      Math.round((4 * 96) / 0.0254)
    );
    expect(result.readUInt32BE(physicalChunk + 8)).toBe(
      Math.round((4 * 96) / 0.0254)
    );
    expect(result[physicalChunk + 12]).toBe(1);
    expect(result.readUInt32BE(16)).toBe(1);
    expect(result.readUInt32BE(20)).toBe(1);
  });

  it("rejects data that is not a PNG", () => {
    expect(() => withPngDpiMetadata(Buffer.from("not a png"))).toThrow(
      "invalid PNG"
    );
  });
});
