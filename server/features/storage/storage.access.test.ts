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

  it.each(["sign", "public", "authenticated"])(
    "normalizes legacy Supabase %s logo URLs to the application storage key",
    accessType => {
      expect(
        storageKeyFromStoredUrl(
          `https://example.supabase.co/storage/v1/object/${accessType}/telegram-files/department/logos/550e8400-e29b-41d4-a716-446655440000/official%20badge.png?token=temporary`,
          "telegram-files"
        )
      ).toBe(
        "department/logos/550e8400-e29b-41d4-a716-446655440000/official badge.png"
      );
    }
  );

  it("rejects legacy Supabase URLs from another bucket or with traversal", () => {
    expect(
      storageKeyFromStoredUrl(
        "https://example.supabase.co/storage/v1/object/public/other-bucket/department/logos/logo.png",
        "telegram-files"
      )
    ).toBeNull();
    expect(
      storageKeyFromStoredUrl(
        "https://example.supabase.co/storage/v1/object/public/telegram-files/department/logos/../private.png",
        "telegram-files"
      )
    ).toBeNull();
  });
});
