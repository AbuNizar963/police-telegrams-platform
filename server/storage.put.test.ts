import { beforeEach, describe, expect, it, vi } from "vitest";

const { upload, createSignedUrl, remove, provider } = vi.hoisted(() => {
  const upload = vi.fn();
  const createSignedUrl = vi.fn();
  const remove = vi.fn();
  const provider = { upload, createSignedUrl, remove };
  return { upload, createSignedUrl, remove, provider };
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
    remove.mockResolvedValue(undefined);
  });

  it("keeps attachment URLs stable", async () => {
    const result = await storagePut(
      "telegrams/7/report.pdf",
      Buffer.from("attachment"),
      "application/pdf"
    );

    expect(result.key).toMatch(/^telegrams\/7\/report_[a-f0-9]{8}\.pdf$/);
    expect(result.url).toBe(`/api/storage/${result.key}`);
    expect(upload).toHaveBeenCalledWith(
      result.key,
      Buffer.from("attachment"),
      { contentType: "application/pdf", cacheControl: "3600" }
    );
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("returns a stable organization-scoped URL for uploaded logos", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    const result = await storagePutDepartmentLogo(
      organizationId,
      "badge.png",
      Buffer.from("image"),
      "image/png"
    );

    expect(result.key).toMatch(
      new RegExp(
        `^department/logos/${organizationId}/[0-9a-f-]{36}-badge\\.png$`
      )
    );
    expect(result.url).toBe(`/api/storage/${result.key}`);
    expect(upload).toHaveBeenCalledWith(
      result.key,
      Buffer.from("image"),
      { contentType: "image/png", cacheControl: "3600" }
    );
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects an invalid organization ID before uploading a logo", async () => {
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
