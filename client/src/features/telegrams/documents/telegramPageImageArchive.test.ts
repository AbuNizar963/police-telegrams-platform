import { describe, expect, it } from "vitest";
import { TELEGRAM_PAGE_IMAGE_DPI } from "./telegramPageImageArchive";

describe("multi-page telegram PNG export", () => {
  it("matches the primary high-resolution PNG download pass", () => {
    expect(TELEGRAM_PAGE_IMAGE_DPI).toBe(384);
  });

  it("renders an A4 page at print-ready pixel dimensions", () => {
    const width = Math.ceil((210 / 25.4) * TELEGRAM_PAGE_IMAGE_DPI);
    const height = Math.ceil((297 / 25.4) * TELEGRAM_PAGE_IMAGE_DPI);

    expect(width).toBe(3175);
    expect(height).toBe(4490);
  });
});
