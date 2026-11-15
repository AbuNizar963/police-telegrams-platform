import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  upload,
  createSignedUrl,
  createSignedUploadUrl,
  info,
  download,
  from,
  getSupabaseAdmin,
} = vi.hoisted(() => {
  const upload = vi.fn();
  const createSignedUrl = vi.fn();
  const createSignedUploadUrl = vi.fn();
  const info = vi.fn();
  const download = vi.fn();
  const from = vi.fn(() => ({
    upload,
    createSignedUrl,
    createSignedUploadUrl,
    info,
    download,
  }));
  const getSupabaseAdmin = vi.fn(() => ({ storage: { from } }));

  return {
    upload,
    createSignedUrl,
    createSignedUploadUrl,
    info,
    download,
    from,
    getSupabaseAdmin,
  };
});

vi.mock("./supabase", () => ({ getSupabaseAdmin }));

import {
  getStorageProvider,
  resetStorageProviderForTests,
} from "./storageProvider";

describe("Supabase storage provider", () => {
  beforeEach(() => {
    resetStorageProviderForTests();
    vi.clearAllMocks();
    upload.mockResolvedValue({ error: null });
    download.mockResolvedValue({
      data: new Blob(["logo"], { type: "image/png" }),
      error: null,
    });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-object" },
      error: null,
    });
    createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-upload?token=opaque" },
      error: null,
    });
    info.mockResolvedValue({
      data: { size: 123, contentType: "application/pdf" },
      error: null,
    });
  });

  it("reuses a single provider instance", () => {
    expect(getStorageProvider()).toBe(getStorageProvider());
  });

  it("uploads private objects with the configured bucket and options", async () => {
    const body = Buffer.from("attachment");

    await getStorageProvider().upload("telegrams/7/file.pdf", body, {
      contentType: "application/pdf",
      cacheControl: "3600",
    });

    expect(from).toHaveBeenCalledWith(expect.any(String));
    expect(upload).toHaveBeenCalledWith("telegrams/7/file.pdf", body, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    });
  });

  it("surfaces upload failures with provider context", async () => {
    upload.mockResolvedValueOnce({
      error: { message: "bucket unavailable" },
    });

    await expect(
      getStorageProvider().upload("telegrams/7/file.pdf", Buffer.from("x"), {
        contentType: "application/pdf",
        cacheControl: "3600",
      })
    ).rejects.toThrow("Storage upload failed: bucket unavailable");
  });

  it("creates a signed upload URL without allowing object replacement", async () => {
    await expect(
      getStorageProvider().createSignedUploadUrl("organizations/org/file.pdf")
    ).resolves.toBe("https://storage.example/signed-upload?token=opaque");

    expect(createSignedUploadUrl).toHaveBeenCalledWith(
      "organizations/org/file.pdf",
      { upsert: false }
    );
  });

  it("reads object size and content type before downloading file bytes", async () => {
    await expect(
      getStorageProvider().getObjectInfo("organizations/org/file.pdf")
    ).resolves.toEqual({
      size: 123,
      contentType: "application/pdf",
    });
    expect(info).toHaveBeenCalledWith("organizations/org/file.pdf");
  });

  it("downloads object bytes and returns the stored content type", async () => {
    const data = new Blob(["logo-bytes"], { type: "image/png" });
    download.mockResolvedValueOnce({ data, error: null });

    await expect(
      getStorageProvider().download("department/logos/org/logo.png")
    ).resolves.toEqual({
      body: Buffer.from("logo-bytes"),
      contentType: "image/png",
    });

    expect(download).toHaveBeenCalledWith("department/logos/org/logo.png");
  });

  it("surfaces object download failures with provider context", async () => {
    download.mockResolvedValueOnce({
      data: null,
      error: { message: "object missing" },
    });

    await expect(
      getStorageProvider().download("department/logos/org/missing.png")
    ).rejects.toThrow("Storage download failed: object missing");
  });

  it("returns the signed URL for the requested key and expiration", async () => {
    await expect(
      getStorageProvider().createSignedUrl("telegrams/7/file.pdf", 600)
    ).resolves.toBe("https://storage.example/signed-object");

    expect(createSignedUrl).toHaveBeenCalledWith("telegrams/7/file.pdf", 600);
  });

  it("surfaces signed URL errors and empty provider responses", async () => {
    createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(
      getStorageProvider().createSignedUrl("telegrams/7/file.pdf", 600)
    ).rejects.toThrow("Storage signed URL failed: permission denied");

    createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: "" },
      error: null,
    });

    await expect(
      getStorageProvider().createSignedUrl("telegrams/7/file.pdf", 600)
    ).rejects.toThrow("Storage signed URL failed: empty URL");
  });
});
