import { describe, expect, it } from "vitest";
import { TELEGRAM_PAGE_IMAGE_DPI } from "./telegramPageImageArchive";

describe("multi-page telegram PNG export", () => {
  it("matches the native Flutter image export density", () => {
    expect(TELEGRAM_PAGE_IMAGE_DPI).toBe(300);
  });

  it("renders an A4 page at print-ready pixel dimensions", () => {
    const width = Math.ceil((210 / 25.4) * TELEGRAM_PAGE_IMAGE_DPI);
    const height = Math.ceil((297 / 25.4) * TELEGRAM_PAGE_IMAGE_DPI);

    expect(width).toBe(2481);
    expect(height).toBe(3508);
  });
});
