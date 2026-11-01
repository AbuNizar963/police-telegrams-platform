import { describe, expect, it } from "vitest";
import {
  buildTelegramWatermarkCss,
  buildTelegramWatermarkHtml,
  OFFICIAL_MINISTRY_NAME,
  TELEGRAM_WATERMARK_COLUMNS,
  TELEGRAM_WATERMARK_DEFAULT_OPACITY,
  TELEGRAM_WATERMARK_FONT_FAMILY,
  TELEGRAM_WATERMARK_FONT_SIZE_PT,
  TELEGRAM_WATERMARK_GAP_MM,
  TELEGRAM_WATERMARK_INSET_MM,
  TELEGRAM_WATERMARK_ROWS,
  TELEGRAM_WATERMARK_REPEAT_COUNT,
} from "./telegramWatermark";

describe("official telegram watermark", () => {
  it("repeats the Ministry of Interior name as a discreet page pattern", () => {
    const html = buildTelegramWatermarkHtml();

    expect(html).toContain('class="page-watermark"');
    expect(html).toContain('class="watermark-text-pattern"');
    expect(html).not.toContain("watermark-logo-fallback");
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/<span>وزارة الداخلية<\/span>/g)).toHaveLength(
      TELEGRAM_WATERMARK_REPEAT_COUNT
    );
    expect(
      html.match(/class="watermark-text-row(?: watermark-text-row-offset)?"/g)
    ).toHaveLength(TELEGRAM_WATERMARK_ROWS);
    expect(html.match(/watermark-text-row-offset/g)).toHaveLength(
      Math.floor(TELEGRAM_WATERMARK_ROWS / 2)
    );
    expect(html).not.toContain("وزارة التربية");
    expect(OFFICIAL_MINISTRY_NAME).toBe("وزارة الداخلية");
    expect(TELEGRAM_WATERMARK_COLUMNS).toBe(10);
    expect(TELEGRAM_WATERMARK_ROWS).toBe(33);
    expect(TELEGRAM_WATERMARK_REPEAT_COUNT).toBe(330);
    expect(TELEGRAM_WATERMARK_GAP_MM).toBe(5);
    expect(TELEGRAM_WATERMARK_INSET_MM).toBe(3);
    expect(TELEGRAM_WATERMARK_FONT_FAMILY).toBe("Aref Ruqaa");
    expect(TELEGRAM_WATERMARK_FONT_SIZE_PT).toBe(11);
    expect(TELEGRAM_WATERMARK_DEFAULT_OPACITY).toBe(0.12);
  });

  it("does not invent a logo when the organization has no configured logo", () => {
    const html = buildTelegramWatermarkHtml();

    expect(html).not.toContain("watermark-logo");
    expect(html).not.toContain("official-seal");
  });

  it("keeps the organization's logo as a separate watermark layer", () => {
    const html = buildTelegramWatermarkHtml(
      "https://assets.example.test/logo.png?mode=mark&size=large"
    );

    expect(html).toContain('class="watermark-logo"');
    expect(html).toContain("mode=mark&amp;size=large");
    expect(html).toContain('class="watermark-text-pattern"');
    expect(html).toContain("وزارة الداخلية");
    expect(html.indexOf('class="watermark-text-pattern"')).toBeLessThan(
      html.indexOf('class="watermark-logo"')
    );
  });

  it("can hide only the repeated ministry text while retaining the logo", () => {
    const html = buildTelegramWatermarkHtml(
      "https://assets.example.test/logo.png",
      {
        showMinistryText: false,
      }
    );

    expect(html).toContain('class="page-watermark"');
    expect(html).toContain('class="watermark-logo"');
    expect(html).not.toContain('class="watermark-logo-fallback"');
    expect(html).not.toContain('class="watermark-text-pattern"');
    expect(html).not.toContain(OFFICIAL_MINISTRY_NAME);
  });

  it("covers the full sheet and retains watermark ink in printed exports", () => {
    const css = buildTelegramWatermarkCss(0.12);

    expect(css).toContain(".telegram-export-page .page-watermark");
    expect(css).toContain("inset: 3mm;");
    expect(css).toContain(".telegram-export-page .watermark-logo");
    expect(css).toContain("width: 93.75%;");
    expect(css).toContain("gap: 5mm;");
    expect(css).toContain("translateX(-10.3mm)");
    expect(css).toContain('font-family: "Aref Ruqaa", serif;');
    expect(css).toContain("font-size: 11pt;");
    expect(css).toContain("print-color-adjust: exact;");
    expect(css).toContain("opacity: 0.12;");
  });

  it("bounds watermark opacity so malformed settings cannot hide the logo", () => {
    expect(buildTelegramWatermarkCss(2)).toContain("opacity: 1;");
    expect(buildTelegramWatermarkCss(-1)).toContain("opacity: 0;");
    expect(buildTelegramWatermarkCss(Number.NaN)).toContain("opacity: 0.12;");
  });
});
