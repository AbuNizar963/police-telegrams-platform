import { describe, expect, it } from "vitest";
import { parseImportedDate } from "./importedDate";

describe("parseImportedDate", () => {
  it("parses ISO dates and preserves the imported time", () => {
    expect(parseImportedDate("2026-10-18", "09:35")?.toISOString()).toBe(
      "2026-10-18T09:35:00.000Z"
    );
  });

  it("parses day-first dates used by Arabic registers", () => {
    expect(parseImportedDate("18/10/2026", "14:05")?.toISOString()).toBe(
      "2026-10-18T14:05:00.000Z"
    );
  });

  it("parses unambiguous month-first Excel dates", () => {
    expect(parseImportedDate("10/18/2026", "9:05 AM")?.toISOString()).toBe(
      "2026-10-18T09:05:00.000Z"
    );
  });

  it("parses Arabic-Indic digits and Arabic PM notation", () => {
    expect(parseImportedDate("١٨/١٠/٢٠٢٦", "٠٩:٠٥ م")?.toISOString()).toBe(
      "2026-10-18T21:05:00.000Z"
    );
  });

  it("normalizes an hour-only source time to the start of that hour", () => {
    expect(parseImportedDate("2026-10-18", "17")?.toISOString()).toBe(
      "2026-10-18T17:00:00.000Z"
    );
  });

  it("supports Excel serial dates", () => {
    expect(parseImportedDate("46313", "08:00")?.toISOString()).toBe(
      "2026-10-18T08:00:00.000Z"
    );
  });

  it("rejects invalid dates instead of silently using the current date", () => {
    expect(parseImportedDate("31/02/2026", "12:00")).toBeUndefined();
    expect(parseImportedDate("not a date", "12:00")).toBeUndefined();
  });
});
