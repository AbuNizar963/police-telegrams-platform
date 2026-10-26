import type { User } from "../drizzle/schema";
import type { AllowedAttachmentType } from "./fileSecurity";
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

function decodeSafeStorageKey(value: string): string | null {
  try {
    const key = value
      .split("/")
      .map(segment => decodeURIComponent(segment))
      .join("/");
    if (
      !key ||
      key
        .split("/")
        .some(
          segment =>
            !segment ||
            segment === "." ||
            segment === ".." ||
            segment.includes("\\")
        )
    ) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

function rawPathnameFromAbsoluteUrl(value: string): string | null {
  const authority = value.match(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i);
  if (!authority) return null;
  return value.slice(authority[0].length).split(/[?#]/, 1)[0] || "/";
}

export function storageKeyFromStoredUrl(
  value: string,
  bucket: string
): string | null {
  const trimmed = value.trim();

  if (trimmed.startsWith("/api/storage/")) {
    const encodedKey = trimmed.slice("/api/storage/".length);
    return decodeSafeStorageKey(encodedKey);
  }

  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    // Validate the absolute URL, but inspect its raw pathname below. The URL
    // parser resolves dot segments, which would otherwise hide ../ before the
    // storage-key validation can reject it.
    new URL(trimmed);
    const path = rawPathnameFromAbsoluteUrl(trimmed);
    if (!path) return null;
    const applicationStoragePrefix = "/api/storage/";
    if (path.startsWith(applicationStoragePrefix)) {
      return decodeSafeStorageKey(path.slice(applicationStoragePrefix.length));
    }
    // Legacy settings may contain signed, public, or authenticated Supabase
    // object URLs. Normalize all supported object URL forms to the private
    // same-origin proxy so export never depends on cross-origin canvas access.
    const objectPrefixes = [
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
    ];
    for (const prefix of objectPrefixes) {
      if (path.startsWith(prefix)) {
        return decodeSafeStorageKey(path.slice(prefix.length));
      }
    }
    return null;
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OrganizationAttachmentKeyParts = {
  organizationId: string;
  telegramId: number;
};

export function parseOrganizationAttachmentKey(
  key: string
): OrganizationAttachmentKeyParts | null {
  const segments = key.split("/");
  const telegramId = Number(segments[3]);
  if (
    segments.length !== 6 ||
    segments[0] !== "organizations" ||
    !UUID_PATTERN.test(segments[1]) ||
    segments[2] !== "telegrams" ||
    !/^[1-9]\d*$/.test(segments[3]) ||
    !Number.isSafeInteger(telegramId) ||
    segments[4] !== "attachments" ||
    !UUID_PATTERN.test(segments[5].slice(0, 36)) ||
    segments[5][36] !== "-" ||
    !segments[5].slice(37) ||
    segments[5].slice(37).includes("\\")
  ) {
    return null;
  }

  return {
    organizationId: segments[1],
    telegramId,
  };
}

export function organizationAttachmentKeyMatches(
  key: string,
  organizationId: string,
  telegramId: number
): boolean {
  const parts = parseOrganizationAttachmentKey(key);
  return Boolean(
    parts &&
    parts.organizationId === organizationId &&
    parts.telegramId === telegramId
  );
}

export async function storagePutOrganizationAttachment(
  organizationId: string,
  telegramId: number,
  fileName: string,
  data: Buffer | Uint8Array | string,
  contentType: AllowedAttachmentType
): Promise<{ key: string; url: string }> {
  const safeOrganizationId = organizationId.trim();
  if (
    !UUID_PATTERN.test(safeOrganizationId) ||
    !Number.isSafeInteger(telegramId) ||
    telegramId <= 0
  ) {
    throw new StorageAccessDeniedError();
  }

  const safeFileName = sanitizeFileName(fileName);
  const key = `organizations/${safeOrganizationId}/telegrams/${telegramId}/attachments/${crypto.randomUUID()}-${safeFileName}`;
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

export async function storageDownload(
  relKey: string
): Promise<{ body: Buffer; contentType: string }> {
  const key = normalizeKey(relKey);

  if (
    !key ||
    key.split("/").some(segment => segment === "." || segment === "..")
  ) {
    throw new StorageAccessDeniedError();
  }

  return getStorageProvider().download(key);
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
  organizationId: string,
  fileName: string,
  data: Buffer | Uint8Array | string,
  contentType: "image/png" | "image/jpeg"
): Promise<{ key: string; url: string }> {
  const safeOrganizationId = organizationId.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      safeOrganizationId
    )
  ) {
    throw new StorageAccessDeniedError();
  }
  const safeFileName = sanitizeFileName(fileName);
  const extension = contentType === "image/jpeg" ? ".jpg" : ".png";
  const baseName = safeFileName.replace(/\.[^.]*$/, "");
  const key = `department/logos/${safeOrganizationId}/${crypto.randomUUID()}-${baseName}${extension}`;
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  await getStorageProvider().upload(key, body, {
    contentType,
    cacheControl: "3600",
  });

  // Persist a stable application URL. The storage route creates a fresh,
  // short-lived signed URL for each request so saved logos do not expire.
  return { key, url: storageStableUrl(key) };
}
