import { describe, expect, it } from "vitest";
import { renderTelegramBodyHtml } from "./telegramBodyHtml";

describe("official telegram body HTML", () => {
  it("isolates slash-separated Arabic dates without changing their written order", () => {
    expect(
      renderTelegramBodyHtml("وردت بتاريخ ٢٥/٤/٢٠٢٦ وتمت المراجعة", "arabic")
    ).toBe(
      'وردت بتاريخ <bdi class="telegram-date-token" dir="ltr">٢٥/٤/٢٠٢٦</bdi> وتمت المراجعة'
    );
  });

  it("localizes Latin digits and escapes content before adding date markup", () => {
    expect(
      renderTelegramBodyHtml("<script>تاريخ 25/4/2026</script>", "arabic")
    ).toBe(
      '&lt;script&gt;تاريخ <bdi class="telegram-date-token" dir="ltr">٢٥/٤/٢٠٢٦</bdi>&lt;/script&gt;'
    );
  });

  it("does not treat longer numeric identifiers as dates", () => {
    expect(renderTelegramBodyHtml("رقم 123/4/2026", "latin")).toBe(
      "رقم 123/4/2026"
    );
  });
});
