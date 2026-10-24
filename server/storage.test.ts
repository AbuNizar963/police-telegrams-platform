import { describe, expect, it } from "vitest";
import { storageKeyFromStoredUrl } from "./storage";

const bucket = "telegram-files";
const logoKey =
  "department/logos/123e4567-e89b-42d3-a456-426614174000/logo.png";

describe("storageKeyFromStoredUrl", () => {
  it("resolves an internal department logo key", () => {
    expect(storageKeyFromStoredUrl(logoKey, bucket)).toBe(logoKey);
  });

  it("resolves stable same-origin storage URLs", () => {
    expect(
      storageKeyFromStoredUrl(
        "/api/storage/department/logos/123e4567-e89b-42d3-a456-426614174000/logo.png",
        bucket
      )
    ).toBe(logoKey);
  });

  it.each(["sign", "public", "authenticated"])(
    "resolves Supabase %s object URLs",
    accessType => {
      expect(
        storageKeyFromStoredUrl(
          `https://example.supabase.co/storage/v1/object/${accessType}/${bucket}/${logoKey}`,
          bucket
        )
      ).toBe(logoKey);
    }
  );

  it("decodes encoded object names in Supabase URLs", () => {
    expect(
      storageKeyFromStoredUrl(
        `https://example.supabase.co/storage/v1/object/public/${bucket}/department/logos/123e4567-e89b-42d3-a456-426614174000/official%20logo.png`,
        bucket
      )
    ).toBe(
      "department/logos/123e4567-e89b-42d3-a456-426614174000/official logo.png"
    );
  });

  it("rejects unrelated external URLs and malformed encoded paths", () => {
    expect(
      storageKeyFromStoredUrl("https://example.com/logo.png", bucket)
    ).toBeNull();
    expect(
      storageKeyFromStoredUrl(
        "https://example.supabase.co/storage/v1/object/public/telegram-files/department/logos/%E0%A4%A",
        bucket
      )
    ).toBeNull();
  });
});
