const ALLOWED_LOGO_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

function startsWithBytes(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Resolve the MIME type from the actual image bytes first. Storage proxies
 * commonly return application/octet-stream and may omit a useful extension.
 */
export function detectOfficialDocumentLogoMimeType(
  bytes: Uint8Array,
  declaredType = "",
  sourceUrl = ""
): string | null {
  if (
    startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return "image/png";
  }
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  const normalizedDeclaredType = declaredType
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (ALLOWED_LOGO_MIME_TYPES.has(normalizedDeclaredType)) {
    return normalizedDeclaredType;
  }

  const extension = sourceUrl
    .split(/[?#]/, 1)[0]
    .split(".")
    .pop()
    ?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "svg" || extension === "svg+xml") {
    return "image/svg+xml";
  }
  return null;
}
