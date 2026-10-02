import type { User } from "../drizzle/schema";
import { getStorageProvider } from "./storageProvider";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function sanitizeFileName(fileName: string): string {
  const sanitized = fileName
    .trim()
    .replace(/[\\/]+/g, "_")
    .replace(/\.\.+/g, "_");

  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new Error("Invalid storage file name");
  }

  return sanitized.slice(0, 180);
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");

  if (lastDot === -1) return `${relKey}_${hash}`;

  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export function storageStableUrl(key: string): string {
  const encoded = key
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");

  return `/api/storage/${encoded}`;
}

export function canAccessStorageKey(
  relKey: string,
  user: Pick<User, "id" | "role">
): boolean {
  const key = normalizeKey(relKey);
  const segments = key.split("/");

  if (
    segments.length !== 3 ||
    segments[0] !== "telegrams" ||
    !segments[2] ||
    segments.some(
      segment => segment === "." || segment === ".." || segment.includes("\\")
    )
  ) {
    return false;
  }

  if (user.role === "admin") return true;

  const ownerId = Number(segments[1]);
  return Number.isInteger(ownerId) && ownerId === user.id;
}

export function storageKeyFromStoredUrl(
  value: string,
  bucket: string
): string | null {
  const trimmed = value.trim();

  if (trimmed.startsWith("/api/storage/")) {
    const encodedKey = trimmed.slice("/api/storage/".length);
    try {
      return encodedKey
        .split("/")
        .map(segment => decodeURIComponent(segment))
        .join("/");
    } catch {
      return null;
    }
  }

  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    const url = new URL(trimmed);
    const path = decodeURIComponent(url.pathname);
    const prefix = `/storage/v1/object/sign/${bucket}/`;
    return path.startsWith(prefix) ? path.slice(prefix.length) : null;
  } catch {
    return null;
  }
}

export class StorageAccessDeniedError extends Error {
  constructor() {
    super("Storage access denied");
    this.name = "StorageAccessDeniedError";
  }
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const normalizedKey = normalizeKey(relKey);
  const segments = normalizedKey.split("/");

  if (
    segments.length !== 3 ||
    segments[0] !== "telegrams" ||
    !/^\d+$/.test(segments[1])
  ) {
    throw new Error("Invalid storage key");
  }

  const safeFileName = sanitizeFileName(segments[2]);
  const key = appendHashSuffix(`telegrams/${segments[1]}/${safeFileName}`);
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  await getStorageProvider().upload(key, body, {
    contentType,
    cacheControl: "3600",
  });

  return { key, url: storageStableUrl(key) };
}

export async function storageDelete(key: string): Promise<void> {
  const normalizedKey = normalizeKey(key);
  if (
    !normalizedKey ||
    normalizedKey
      .split("/")
      .some(segment => segment === "." || segment === "..")
  ) {
    throw new StorageAccessDeniedError();
  }
  const provider = getStorageProvider();
  if (!provider.remove) {
    throw new Error("Storage provider does not support cleanup");
  }
  await provider.remove(normalizedKey);
}

export async function storageCreateSignedUrl(
  relKey: string,
  expiresInSeconds = 60 * 60
): Promise<string> {
  const key = normalizeKey(relKey);

  if (
    !key ||
    key.split("/").some(segment => segment === "." || segment === "..")
  ) {
    throw new StorageAccessDeniedError();
  }

  return getStorageProvider().createSignedUrl(key, expiresInSeconds);
}

export async function storageGetSignedUrl(
  relKey: string,
  user: Pick<User, "id" | "role">
): Promise<string> {
  const key = normalizeKey(relKey);

  if (!canAccessStorageKey(key, user)) {
    throw new StorageAccessDeniedError();
  }

  return storageCreateSignedUrl(key, 10 * 60);
}

export async function storagePutDepartmentLogo(
  fileName: string,
  data: Buffer | Uint8Array | string,
  contentType: "image/png" | "image/jpeg"
): Promise<{ key: string; url: string }> {
  const safeFileName = sanitizeFileName(fileName);
  const extension = contentType === "image/jpeg" ? ".jpg" : ".png";
  const baseName = safeFileName.replace(/\.[^.]*$/, "");
  const key = `department/logos/${crypto.randomUUID()}-${baseName}${extension}`;
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  await getStorageProvider().upload(key, body, {
    contentType,
    cacheControl: "3600",
  });

  return { key, url: storageStableUrl(key) };
}
