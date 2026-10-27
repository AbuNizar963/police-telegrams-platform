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

import {
  parseOrganizationAttachmentKey,
  storagePutDepartmentLogo,
  storagePutOrganizationAttachment,
} from "./storage";

describe("stable storage URLs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue(undefined);
    createSignedUrl.mockResolvedValue("https://storage.example/signed");
  });

  it("stores new attachments below their immutable organization and telegram path", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    const result = await storagePutOrganizationAttachment(
      organizationId,
      7,
      "report.pdf",
      Buffer.from("attachment"),
      "application/pdf"
    );

    expect(result.key).toMatch(
      new RegExp(
        `^organizations/${organizationId}/telegrams/7/attachments/[0-9a-f-]{36}-report\\.pdf$`,
        "i"
      )
    );
    expect(parseOrganizationAttachmentKey(result.key)).toEqual({
      organizationId,
      telegramId: 7,
    });
    expect(result.url).toBe(`/api/storage/${result.key}`);
    expect(upload).toHaveBeenCalledWith(result.key, Buffer.from("attachment"), {
      contentType: "application/pdf",
      cacheControl: "3600",
    });
  });

  it("rejects invalid organization or telegram identifiers before upload", async () => {
    await expect(
      storagePutOrganizationAttachment(
        "not-a-uuid",
        7,
        "report.pdf",
        Buffer.from("attachment"),
        "application/pdf"
      )
    ).rejects.toThrow("Storage access denied");
    await expect(
      storagePutOrganizationAttachment(
        "550e8400-e29b-41d4-a716-446655440000",
        0,
        "report.pdf",
        Buffer.from("attachment"),
        "application/pdf"
      )
    ).rejects.toThrow("Storage access denied");

    expect(upload).not.toHaveBeenCalled();
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
