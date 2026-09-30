import { beforeEach, describe, expect, it, vi } from "vitest";

const { upload, createSignedUrl, from, getSupabaseAdmin } = vi.hoisted(() => {
  const upload = vi.fn();
  const createSignedUrl = vi.fn();
  const from = vi.fn(() => ({ upload, createSignedUrl }));
  const getSupabaseAdmin = vi.fn(() => ({ storage: { from } }));

  return { upload, createSignedUrl, from, getSupabaseAdmin };
});

vi.mock("./_core/supabase", () => ({ getSupabaseAdmin }));

import {
  getStorageProvider,
  resetStorageProviderForTests,
} from "./storageProvider";

describe("Supabase storage provider", () => {
  beforeEach(() => {
    resetStorageProviderForTests();
    vi.clearAllMocks();
    upload.mockResolvedValue({ error: null });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-object" },
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
      }),
    ).rejects.toThrow("Storage upload failed: bucket unavailable");
  });

  it("returns the signed URL for the requested key and expiration", async () => {
    await expect(
      getStorageProvider().createSignedUrl("telegrams/7/file.pdf", 600),
    ).resolves.toBe("https://storage.example/signed-object");

    expect(createSignedUrl).toHaveBeenCalledWith(
      "telegrams/7/file.pdf",
      600,
    );
  });

  it("surfaces signed URL errors and empty provider responses", async () => {
    createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(
      getStorageProvider().createSignedUrl("telegrams/7/file.pdf", 600),
    ).rejects.toThrow("Storage signed URL failed: permission denied");

    createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: "" },
      error: null,
    });

    await expect(
      getStorageProvider().createSignedUrl("telegrams/7/file.pdf", 600),
    ).rejects.toThrow("Storage signed URL failed: empty URL");
  });
});
