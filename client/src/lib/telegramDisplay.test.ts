import { describe, expect, it } from "vitest";
import { getTelegramDisplayNumber } from "./telegramDisplay";

describe("getTelegramDisplayNumber", () => {
  it("extracts and removes padding from a full telegram number", () => {
    expect(getTelegramDisplayNumber("POL-2026-09-30-00690")).toBe("690");
  });

  it("keeps a plain numeric serial readable", () => {
    expect(getTelegramDisplayNumber("690")).toBe("690");
  });

  it("returns a safe placeholder for an empty serial", () => {
    expect(getTelegramDisplayNumber(undefined)).toBe("—");
  });
});
