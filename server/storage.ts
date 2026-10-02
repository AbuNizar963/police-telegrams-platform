// Provider-neutral storage boundary for telegram attachments.
// The Forge/S3 adapter is enabled today; future adapters must preserve
// private objects, signed downloads, content types, and stable object keys.

import { ENV } from "./_core/env";

export type StorageData = Buffer | Uint8Array | string;

export interface StoragePutResult {
  key: string;
  url: string;
}

export interface StorageProvider {
  put(
    relKey: string,
    data: StorageData,
    contentType?: string
  ): Promise<StoragePutResult>;
  get(relKey: string): Promise<StoragePutResult>;
  getSignedUrl(relKey: string): Promise<string>;
}

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function createForgeStorageProvider(): StorageProvider {
  return {
    async put(
      relKey: string,
      data: StorageData,
      contentType = "application/octet-stream"
    ) {
      const { forgeUrl, forgeKey } = getForgeConfig();
      const key = appendHashSuffix(normalizeKey(relKey));

      const presignUrl = new URL("v1/storage/presign/put", `${forgeUrl}/`);
      presignUrl.searchParams.set("path", key);
      const presignResp = await fetch(presignUrl, {
        headers: { Authorization: `Bearer ${forgeKey}` },
      });
      if (!presignResp.ok) {
        const message = await presignResp
          .text()
          .catch(() => presignResp.statusText);
        throw new Error(
          `Storage presign failed (${presignResp.status}): ${message}`
        );
      }

      const { url: s3Url } = (await presignResp.json()) as { url: string };
      if (!s3Url) throw new Error("Forge returned empty presign URL");
      const blob = new Blob([data as BlobPart], { type: contentType });
      const uploadResp = await fetch(s3Url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: blob,
      });
      if (!uploadResp.ok) {
        throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
      }

      return { key, url: `/manus-storage/${key}` };
    },

    async get(relKey: string) {
      const key = normalizeKey(relKey);
      return { key, url: `/manus-storage/${key}` };
    },

    async getSignedUrl(relKey: string) {
      const { forgeUrl, forgeKey } = getForgeConfig();
      const key = normalizeKey(relKey);
      const getUrl = new URL("v1/storage/presign/get", `${forgeUrl}/`);
      getUrl.searchParams.set("path", key);
      const response = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${forgeKey}` },
      });
      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(
          `Storage signed URL failed (${response.status}): ${message}`
        );
      }
      const { url } = (await response.json()) as { url: string };
      if (!url) throw new Error("Forge returned empty signed URL");
      return url;
    },
  };
}

function getStorageProvider(): StorageProvider {
  if (ENV.storageProvider === "forge") return createForgeStorageProvider();
  throw new Error(
    `Unsupported storage provider '${ENV.storageProvider}'. Configure a reviewed adapter before enabling it.`
  );
}

export function storagePut(
  relKey: string,
  data: StorageData,
  contentType = "application/octet-stream"
) {
  return getStorageProvider().put(relKey, data, contentType);
}

export function storageGet(relKey: string) {
  return getStorageProvider().get(relKey);
}

export function storageGetSignedUrl(relKey: string) {
  return getStorageProvider().getSignedUrl(relKey);
}
