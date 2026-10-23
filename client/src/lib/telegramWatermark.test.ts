import { describe, expect, it } from "vitest";
import {
  buildTelegramWatermarkHtml,
  OFFICIAL_MINISTRY_NAME,
  TELEGRAM_WATERMARK_GAP_MM,
  TELEGRAM_WATERMARK_REPEAT_COUNT,
} from "./telegramWatermark";

describe("official telegram watermark", () => {
  it("repeats the Ministry of Interior name as a discreet page pattern", () => {
    const html = buildTelegramWatermarkHtml();

    expect(html).toContain('class="page-watermark"');
    expect(html).toContain('class="watermark-text-pattern"');
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/<span>وزارة الداخلية<\/span>/g)).toHaveLength(
      TELEGRAM_WATERMARK_REPEAT_COUNT
    );
    expect(html).not.toContain("وزارة التربية");
    expect(OFFICIAL_MINISTRY_NAME).toBe("وزارة الداخلية");
    expect(TELEGRAM_WATERMARK_REPEAT_COUNT).toBe(176);
    expect(TELEGRAM_WATERMARK_GAP_MM).toBe(10);
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
});
