import { describe, expect, it } from "vitest";
import {
  getTelegramDisplayNumber,
  getTelegramDisplaySerial,
} from "./telegramDisplay";

describe("getTelegramDisplayNumber", () => {
  it("extracts and removes padding from a full telegram number", () => {
    expect(getTelegramDisplayNumber("POL-2026-09-30-00690")).toBe("690");
  });

  it("keeps a plain numeric serial readable", () => {
    expect(getTelegramDisplayNumber("690")).toBe("690");
  });

  it(
    "preserves the exact imported serial, including prefixes and leading zeroes",
    () => {
    expect(getTelegramDisplayNumber("SYS-2026-09-30-00009", "ب و ٠٠٦")).toBe(
      "ب و ٠٠٦"
    );
    expect(getTelegramDisplayNumber("SYS-2026-09-30-00009", "2025-009")).toBe(
      "2025-009"
    );
  });

  it("returns the imported serial exactly without digit localization", () => {
    expect(
      getTelegramDisplaySerial(
        {
          originalSerial: "ب و ٠٠٦",
          organizationSerialCode: "UNIT-00072",
          serialCode: "GLOBAL-00419",
        },
        "latin"
      )
    ).toBe("ب و ٠٠٦");
    expect(
      getTelegramDisplaySerial(
        {
          originalSerial: "2025-009",
          serialCode: "SYS-2026-09-30-00009",
        },
        "arabic"
      )
    ).toBe("2025-009");
  });

  it("returns a safe placeholder for an empty serial", () => {
    expect(getTelegramDisplayNumber(undefined)).toBe("—");
  });
});
