import { describe, expect, it } from "vitest";
import {
  PRINT_CONTENT_HEIGHT_MM,
  PRINT_CONTENT_WIDTH_MM,
  PRINT_MARGIN_MM,
  PRINT_PAGE_AREA_HEIGHT_MM,
  PRINT_PAGE_HEIGHT_MM,
  PRINT_PAGE_HEIGHT_PX,
  PRINT_PAGE_WIDTH_MM,
  PRINT_PAGE_WIDTH_PX,
  getTelegramPreviewPageCount,
  getTelegramPaperLayoutCss,
} from "./telegramPrintLayout";

describe("official telegram A4 print layout", () => {
  it("counts physical A4 sheets for preview watermark placement", () => {
    expect(getTelegramPreviewPageCount(0)).toBe(1);
    expect(getTelegramPreviewPageCount(PRINT_PAGE_HEIGHT_PX)).toBe(1);
    expect(getTelegramPreviewPageCount(PRINT_PAGE_HEIGHT_PX + 1)).toBe(2);
    expect(getTelegramPreviewPageCount(PRINT_PAGE_HEIGHT_PX * 2)).toBe(2);
    expect(getTelegramPreviewPageCount(Number.NaN)).toBe(1);
  });

  it("restores the saved 794x1123px preview with only 10mm internal padding", () => {
    const css = getTelegramPaperLayoutCss();

    expect([PRINT_PAGE_WIDTH_PX, PRINT_PAGE_HEIGHT_PX]).toEqual([794, 1123]);
    expect([PRINT_PAGE_WIDTH_MM, PRINT_PAGE_HEIGHT_MM]).toEqual([210, 297]);
    expect([PRINT_CONTENT_WIDTH_MM, PRINT_CONTENT_HEIGHT_MM]).toEqual([
      190, 277,
    ]);
    expect(PRINT_MARGIN_MM).toBe(10);
    expect(css).toMatch(
      /\.telegram-export-page\s*\{[^}]*width:\s*794px;[^}]*min-height:\s*1123px;[^}]*padding:\s*10mm;/s
    );
    expect(css).toContain("@page {");
    expect(css).toContain("size: A4 portrait;");
    expect(css).toContain("margin: 0;");
    expect(css).not.toContain("width: 190mm");
    expect(css).not.toContain("min-height: 277mm");
  });

  it("keeps the full A4 print sheet and reserves a single 10mm counter area on long pages", () => {
    const css = getTelegramPaperLayoutCss();

    expect(PRINT_PAGE_AREA_HEIGHT_MM).toBe(287);
    expect(css).toContain("margin: 0 0 10mm 0;");
    expect(css).toMatch(
      /\.telegram-export-page\s*\{[^}]*width:\s*210mm;[^}]*min-height:\s*297mm;[^}]*padding:\s*10mm;/s
    );
    expect(css).toMatch(
      /\.telegram-export-page\.telegram-multipage\s*\{[^}]*min-height:\s*287mm;[^}]*padding:\s*10mm 10mm 0;/s
    );
    expect(css).toContain(
      'content: "صفحة رقم " counter(page) " من " counter(pages);'
    );
    expect(css).toContain(".telegram-export-page .page-watermark {");
    expect(css).toContain("position: fixed;");
    expect(css).toContain("inset: 0 auto auto 0;");
    expect(css).toContain("width: 210mm;");
    expect(css).toContain("height: 297mm;");
    expect(css).not.toContain(
      ".telegram-export-page.telegram-multipage .page-watermark"
    );
  });

  it("uses the same backup A4 geometry in the standalone print stylesheet", () => {
    const css = getTelegramPaperLayoutCss(
      "#telegram-print-root .telegram-export-page",
      { screenLayout: false, important: true }
    );

    expect(css).toContain("#telegram-print-root .telegram-export-page {");
    expect(css).toContain("width: 210mm !important;");
    expect(css).toContain("min-height: 297mm !important;");
    expect(css).toContain("padding: 10mm !important;");
    expect(css).toContain("margin: 0 auto !important;");
    expect(css).toContain(
      "#telegram-print-root .telegram-export-page.telegram-multipage {"
    );
    expect(css).toContain("min-height: 287mm !important;");
    expect(css).toContain("padding: 10mm 10mm 0 !important;");
  });
});
