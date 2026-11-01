import { describe, expect, it } from "vitest";
import {
  PRINT_CONTENT_HEIGHT_MM,
  PRINT_CONTENT_WIDTH_MM,
  PRINT_MARGIN_MM,
  PRINT_PAGE_AREA_HEIGHT_MM,
  PRINT_PAGE_HEIGHT_MM,
  PRINT_PAGE_WIDTH_MM,
  getTelegramPaperLayoutCss,
} from "./telegramPrintLayout";

describe("official telegram A4 print layout", () => {
  it("keeps a full A4 preview sheet with 190×277mm content inside 10mm insets", () => {
    const css = getTelegramPaperLayoutCss();

    expect([PRINT_PAGE_WIDTH_MM, PRINT_PAGE_HEIGHT_MM]).toEqual([210, 297]);
    expect([PRINT_CONTENT_WIDTH_MM, PRINT_CONTENT_HEIGHT_MM]).toEqual([
      190, 277,
    ]);
    expect(css).toMatch(
      /\.telegram-export-page\s*\{[^}]*width:\s*210mm;[^}]*min-height:\s*297mm;[^}]*padding:\s*10mm;/s
    );
    expect(css).toMatch(
      /\.telegram-export-page\s*\{[^}]*box-sizing:\s*border-box;/s
    );
    expect(css).not.toContain("width: 190mm");
    expect(css).not.toContain("min-height: 277mm");
  });

  it("uses one internal 10mm top/side inset and reserves only the 10mm page-number area below", () => {
    const css = getTelegramPaperLayoutCss();

    expect(PRINT_MARGIN_MM).toBe(10);
    expect(PRINT_PAGE_AREA_HEIGHT_MM).toBe(287);
    expect(css).toContain("margin: 0 0 10mm 0;");
    expect(css).toMatch(
      /\.telegram-export-page\s*\{[^}]*width:\s*210mm;[^}]*min-height:\s*287mm;[^}]*padding:\s*10mm 10mm 0;/s
    );
    expect(css).toContain(
      'content: "صفحة رقم " counter(page) " من " counter(pages);'
    );
    expect(css).not.toContain("margin: 10mm");
    expect(css).not.toContain("padding: 10mm 10mm 10mm");
  });

  it("applies the same full-width A4 geometry in the standalone native print stylesheet", () => {
    const css = getTelegramPaperLayoutCss(
      "#telegram-print-root .telegram-export-page",
      { screenLayout: false, important: true }
    );

    expect(css).toContain("#telegram-print-root .telegram-export-page {");
    expect(css).toContain("width: 210mm !important;");
    expect(css).toContain("min-height: 287mm !important;");
    expect(css).toContain("padding: 10mm 10mm 0 !important;");
    expect(css).toContain("margin: 0 auto !important;");
    expect(css).toContain("margin: 0 0 10mm 0;");
  });
});
