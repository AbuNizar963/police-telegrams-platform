import { describe, expect, it } from "vitest";
import { renderTelegramBodyHtml } from "./telegramBodyHtml";

describe("official telegram body HTML", () => {
  it("exports Arabic day/month/year dates as year/month/day", () => {
    expect(
      renderTelegramBodyHtml("وردت بتاريخ ٢٥/٤/٢٠٢٦ وتمت المراجعة", "arabic")
    ).toBe(
      'وردت بتاريخ <bdi class="telegram-date-token" dir="ltr">٢٠٢٦/٤/٢٥</bdi> وتمت المراجعة'
    );
  });

  it("localizes Latin digits and escapes content before adding date markup", () => {
    expect(
      renderTelegramBodyHtml("<script>تاريخ 25/4/2026</script>", "arabic")
    ).toBe(
      '&lt;script&gt;تاريخ <bdi class="telegram-date-token" dir="ltr">٢٠٢٦/٤/٢٥</bdi>&lt;/script&gt;'
    );
  });

  it("does not treat longer numeric identifiers as dates", () => {
    expect(renderTelegramBodyHtml("رقم 123/4/2026", "latin")).toBe(
      "رقم 123/4/2026"
    );
  });
});
