import { describe, expect, it } from "vitest";
import { localizeDigits, normalizeNumberSystem } from "@shared/numberSystem";

describe("number system conversion", () => {
  it("normalizes Latin, Arabic-Indic, Persian, and Devanagari digits to Arabic", () => {
    expect(localizeDigits("رقم 2026 / ١٢٣ / ۱۲۳ / १२३", "arabic")).toBe(
      "رقم ٢٠٢٦ / ١٢٣ / ١٢٣ / ١٢٣"
    );
  });

  it("normalizes Arabic and legacy digit scripts to Latin", () => {
    expect(localizeDigits("رقم ٢٠٢٦ / ۱۲۳ / १२३", "latin")).toBe(
      "رقم 2026 / 123 / 123"
    );
  });

  it("falls back to Latin for the removed Hindi option and unknown values", () => {
    expect(normalizeNumberSystem("hindi")).toBe("latin");
    expect(localizeDigits("القيمة १२३", "hindi")).toBe("القيمة 123");
    expect(localizeDigits("القيمة १२३", "other")).toBe("القيمة 123");
  });
});
