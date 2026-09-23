import type { User } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getSupabaseAdmin } from "./_core/supabase";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");

  if (lastDot === -1) return `${relKey}_${hash}`;

  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function stableStorageUrl(key: string): string {
  const encoded = key
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");

  return `/api/storage/${encoded}`;
}

export function canAccessStorageKey(
  relKey: string,
  user: Pick<User, "id" | "role">,
): boolean {
  const key = normalizeKey(relKey);
  const segments = key.split("/");

  if (
    segments.length < 3 ||
    segments[0] !== "telegrams" ||
    segments.some(segment => segment === "." || segment === "..")
  ) {
    return false;
  }

  if (user.role === "admin") return true;

  const ownerId = Number(segments[1]);
  return Number.isInteger(ownerId) && ownerId === user.id;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  const { error } = await getSupabaseAdmin()
    .storage.from(ENV.supabaseStorageBucket)
    .upload(key, body, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  return { key, url: stableStorageUrl(key) };
}

export async function storageGet(
  relKey: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: stableStorageUrl(key) };
}

export async function storageGetSignedUrl(
  relKey: string,
  user: Pick<User, "id" | "role">,
): Promise<string> {
  const key = normalizeKey(relKey);

  if (!canAccessStorageKey(key, user)) {
    throw new Error("Storage access denied");
  }

  const { data, error } = await getSupabaseAdmin()
    .storage.from(ENV.supabaseStorageBucket)
    .createSignedUrl(key, 10 * 60);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Storage signed URL failed: ${error?.message ?? "empty URL"}`,
    );
  }

  return data.signedUrl;
}
