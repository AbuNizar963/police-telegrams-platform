import { ENV } from "./_core/env";
import { getSupabaseAdmin } from "./_core/supabase";

/**
 * Provider boundary for private object storage.
 *
 * Application code should depend on this contract rather than on a vendor SDK.
 * Implementations must keep objects private and return only short-lived download URLs.
 */
export interface StorageProvider {
  upload(
    key: string,
    body: Buffer,
    options: { contentType: string; cacheControl: string },
  ): Promise<void>;
  createSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

class SupabaseStorageProvider implements StorageProvider {
  async upload(
    key: string,
    body: Buffer,
    options: { contentType: string; cacheControl: string },
  ): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .storage.from(ENV.supabaseStorageBucket)
      .upload(key, body, {
        contentType: options.contentType,
        cacheControl: options.cacheControl,
        upsert: false,
      });

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }
  }

  async createSignedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(ENV.supabaseStorageBucket)
      .createSignedUrl(key, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new Error(
        `Storage signed URL failed: ${error?.message ?? "empty URL"}`,
      );
    }

    return data.signedUrl;
  }
}

let provider: StorageProvider | undefined;

/**
 * Returns the configured storage adapter. Supabase remains the sole configured
 * backend until a separately tested self-hosted adapter is introduced.
 */
export function getStorageProvider(): StorageProvider {
  provider ??= new SupabaseStorageProvider();
  return provider;
}

/** Test seam; production code should not change providers at runtime. */
export function resetStorageProviderForTests(): void {
  provider = undefined;
}
