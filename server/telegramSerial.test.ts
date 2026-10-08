import { describe, expect, it } from "vitest";
import { getTelegramSerialCode } from "@shared/telegramSerial";

describe("getTelegramSerialCode", () => {
  it("prefers the organization serial printed on the telegram over the global counter", () => {
    expect(
      getTelegramSerialCode({
        organizationSerialCode: "POL-2026-10-08-00713",
        serialCode: "POL-2026-10-08-00714",
      })
    ).toBe("POL-2026-10-08-00713");
  });

  it("falls back to the legacy global serial when no organization serial exists", () => {
    expect(
      getTelegramSerialCode({
        organizationSerialCode: null,
        serialCode: "POL-2026-10-08-00714",
      })
    ).toBe("POL-2026-10-08-00714");
  });

  it("ignores blank organization serials and returns an empty value when no serial is available", () => {
    expect(
      getTelegramSerialCode({
        organizationSerialCode: "   ",
        serialCode: "POL-2026-10-08-00714",
      })
    ).toBe("POL-2026-10-08-00714");
    expect(getTelegramSerialCode({})).toBe("");
  });
});
