import { describe, expect, it } from "vitest";
import { getTelegramSerialCode } from "./telegramSerial";

describe("getTelegramSerialCode", () => {
  it("prefers the exact original serial imported from Excel", () => {
    expect(
      getTelegramSerialCode({
        originalSerial: "  ب و ٠٠٦-A ",
        organizationSerialCode: "ORG-2026-00012",
        serialCode: "SYS-00012",
      })
    ).toBe("ب و ٠٠٦-A");
  });

  it("falls back to organization numbering for ordinary telegrams", () => {
    expect(
      getTelegramSerialCode({
        organizationSerialCode: "ORG-2026-00012",
        serialCode: "SYS-00012",
      })
    ).toBe("ORG-2026-00012");
  });

  it("falls back to legacy global numbering", () => {
    expect(getTelegramSerialCode({ serialCode: "SYS-00012" })).toBe(
      "SYS-00012"
    );
  });
});
