import { beforeEach, describe, expect, it, vi } from "vitest";

const { upload, createSignedUrl, provider } = vi.hoisted(() => {
  const upload = vi.fn();
  const createSignedUrl = vi.fn();
  const provider = { upload, createSignedUrl };
  return { upload, createSignedUrl, provider };
});

vi.mock("./storageProvider", () => ({
  getStorageProvider: () => provider,
}));

import { storagePut, storagePutDepartmentLogo } from "./storage";

describe("stable storage URLs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue(undefined);
    createSignedUrl.mockResolvedValue("https://storage.example/signed");
  });

  it("keeps attachment URLs stable", async () => {
    const result = await storagePut(
      "telegrams/7/report.pdf",
      Buffer.from("attachment"),
      "application/pdf"
    );

    expect(result.key).toMatch(/^telegrams\/7\/report_[a-f0-9]{8}\.pdf$/);
    expect(result.url).toBe(`/api/storage/${result.key}`);
    expect(upload).toHaveBeenCalledWith(result.key, Buffer.from("attachment"), {
      contentType: "application/pdf",
      cacheControl: "3600",
    });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("returns a stable logo URL", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    const result = await storagePutDepartmentLogo(
      organizationId,
      "badge.png",
      Buffer.from("image"),
      "image/png"
    );

    expect(result.key.startsWith(`department/logos/${organizationId}/`)).toBe(
      true
    );
    expect(result.key.endsWith("-badge.png")).toBe(true);
    expect(result.url).toBe(`/api/storage/${result.key}`);
    expect(upload).toHaveBeenCalledWith(result.key, Buffer.from("image"), {
      contentType: "image/png",
      cacheControl: "3600",
    });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects malformed organization IDs", async () => {
    await expect(
      storagePutDepartmentLogo(
        "not-a-uuid",
        "badge.png",
        Buffer.from("image"),
        "image/png"
      )
    ).rejects.toThrow("Storage access denied");

    expect(upload).not.toHaveBeenCalled();
  });
});
