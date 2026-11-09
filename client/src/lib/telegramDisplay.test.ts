import { describe, expect, it } from "vitest";
import {
  getTelegramDisplayNumber,
  getTelegramDisplaySerial,
  getTelegramEditableSerial,
  getTelegramExportFileBaseName,
} from "./telegramDisplay";

describe("getTelegramDisplayNumber", () => {
  it("extracts and removes padding from a full telegram number", () => {
    expect(getTelegramDisplayNumber("POL-2026-09-30-00690")).toBe("690");
  });

  it("keeps a plain numeric serial readable", () => {
    expect(getTelegramDisplayNumber("690")).toBe("690");
  });

  it("uses the organization number instead of the full code in the edit field", () => {
    expect(
      getTelegramEditableSerial({
        organizationSerialNumber: 825,
        organizationSerialCode: "1-2026-11-09-00825",
        serialCode: "1-2026-11-09-00806",
      })
    ).toBe("825");
  });

  it("shortens legacy generated serials while preserving imported labels", () => {
    expect(
      getTelegramEditableSerial({
        originalSerial: "1-2026-11-09-00825",
        serialCode: "1-2026-11-09-00806",
      })
    ).toBe("825");
    expect(getTelegramEditableSerial({ originalSerial: "ب و ٠٠٦-A" })).toBe(
      "ب و ٠٠٦-A"
    );
  });

  it("preserves imported serials exactly", () => {
    expect(getTelegramDisplayNumber("SYS-2026-09-30-00009", "ب و ٠٠٦")).toBe(
      "ب و ٠٠٦"
    );
    expect(getTelegramDisplayNumber("SYS-2026-09-30-00009", "2025-009")).toBe(
      "2025-009"
    );
  });

  it("preserves imported serials without localization", () => {
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

  it("uses the official serial in export filenames safely", () => {
    expect(
      getTelegramExportFileBaseName({
        originalSerial: "ب و ٠٠٦/أ",
        serialCode: "SYS-2026-09-30-00009",
      })
    ).toBe("ب و ٠٠٦-أ");
    expect(
      getTelegramExportFileBaseName({ serialCode: "SYS-2026-09-30-00009" })
    ).toBe("SYS-2026-09-30-00009");
  });

  it("returns a safe placeholder for an empty serial", () => {
    expect(getTelegramDisplayNumber(undefined)).toBe("—");
  });
});
