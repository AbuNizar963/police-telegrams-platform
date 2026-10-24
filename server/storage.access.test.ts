import { describe, expect, it } from "vitest";
import { canAccessStorageKey, storageKeyFromStoredUrl } from "./storage";

describe("storage access control", () => {
  const officer = { id: 42, role: "user" as const };
  const otherOfficer = { id: 43, role: "user" as const };
  const admin = { id: 7, role: "admin" as const };

  it("allows an officer to access only their own attachment path", () => {
    expect(
      canAccessStorageKey("telegrams/42/report.pdf_abc123.pdf", officer)
    ).toBe(true);
    expect(
      canAccessStorageKey("telegrams/43/report.pdf_abc123.pdf", officer)
    ).toBe(false);
  });

  it("allows administrators to access valid telegram attachment paths", () => {
    expect(
      canAccessStorageKey("telegrams/43/report.pdf_abc123.pdf", admin)
    ).toBe(true);
  });

  it("rejects malformed, traversal, and non-telegram storage paths", () => {
    expect(canAccessStorageKey("department/logos/logo.png", officer)).toBe(
      false
    );
    expect(canAccessStorageKey("telegrams/42/../other.pdf", officer)).toBe(
      false
    );
    expect(
      canAccessStorageKey("telegrams/not-a-user/report.pdf", officer)
    ).toBe(false);
    expect(canAccessStorageKey("telegrams/42/report.pdf/extra", officer)).toBe(
      false
    );
    expect(canAccessStorageKey("telegrams/42/", officer)).toBe(false);
    expect(canAccessStorageKey("telegrams/42/.", officer)).toBe(false);
    expect(canAccessStorageKey("telegrams/42/..", officer)).toBe(false);
    expect(
      canAccessStorageKey("telegrams/42/folder\\\\file.pdf", officer)
    ).toBe(false);
  });

  it("extracts legacy absolute application storage URLs", () => {
    expect(
      storageKeyFromStoredUrl(
        "https://police-telegrams-platform.vercel.app/api/storage/telegrams/1/logo.png",
        "attachments"
      )
    ).toBe("telegrams/1/logo.png");
  });

  it("normalizes signed and public Supabase logo URLs to the same storage key", () => {
    const signedUrl =
      "https://example.supabase.co/storage/v1/object/sign/attachments/department/logos/org/logo.png?token=temporary";
    const publicUrl =
      "https://example.supabase.co/storage/v1/object/public/attachments/department/logos/org/logo.png";

    expect(storageKeyFromStoredUrl(signedUrl, "attachments")).toBe(
      "department/logos/org/logo.png"
    );
    expect(storageKeyFromStoredUrl(publicUrl, "attachments")).toBe(
      "department/logos/org/logo.png"
    );
  });

  it("does not normalize a Supabase URL from a different bucket", () => {
    expect(
      storageKeyFromStoredUrl(
        "https://example.supabase.co/storage/v1/object/public/other-bucket/department/logos/org/logo.png",
        "attachments"
      )
    ).toBeNull();
  });
});
