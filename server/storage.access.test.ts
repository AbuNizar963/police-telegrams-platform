import { describe, expect, it } from "vitest";
import { canAccessStorageKey } from "./storage";

describe("storage access control", () => {
  const officer = { id: 42, role: "user" as const };
  const otherOfficer = { id: 43, role: "user" as const };
  const admin = { id: 7, role: "admin" as const };

  it("allows an officer to access only their own attachment path", () => {
    expect(
      canAccessStorageKey("telegrams/42/report.pdf_abc123.pdf", officer),
    ).toBe(true);
    expect(
      canAccessStorageKey("telegrams/43/report.pdf_abc123.pdf", officer),
    ).toBe(false);
  });

  it("allows administrators to access valid telegram attachment paths", () => {
    expect(
      canAccessStorageKey("telegrams/43/report.pdf_abc123.pdf", admin),
    ).toBe(true);
  });

  it("rejects malformed, traversal, and non-telegram storage paths", () => {
    expect(canAccessStorageKey("department/logos/logo.png", officer)).toBe(false);
    expect(canAccessStorageKey("telegrams/42/../other.pdf", officer)).toBe(false);
    expect(canAccessStorageKey("telegrams/not-a-user/report.pdf", officer)).toBe(false);
    expect(canAccessStorageKey("telegrams/42/report.pdf/extra", officer)).toBe(false);
  });
});
