const logoDataUrlCache = new Map<string, string>();
const pendingLogoRequests = new Map<string, Promise<string>>();
const logoObjectUrlCache = new Map<string, string>();
const pendingLogoObjectUrlRequests = new Map<string, Promise<string>>();
const MAX_CACHED_OFFICIAL_DOCUMENT_LOGO_OBJECT_URLS = 12;

function cacheKey(source: string): string {
  return source.trim();
}

function rememberObjectUrl(key: string, objectUrl: string): void {
  const previous = logoObjectUrlCache.get(key);
  if (previous && previous !== objectUrl) {
    URL.revokeObjectURL(previous);
  }

  logoObjectUrlCache.delete(key);
  logoObjectUrlCache.set(key, objectUrl);

  while (
    logoObjectUrlCache.size >
    MAX_CACHED_OFFICIAL_DOCUMENT_LOGO_OBJECT_URLS
  ) {
    const oldestEntry = logoObjectUrlCache.entries().next().value;
    if (!oldestEntry) break;

    const [oldestKey, oldestObjectUrl] = oldestEntry;
    logoObjectUrlCache.delete(oldestKey);
    URL.revokeObjectURL(oldestObjectUrl);
  }
}

/**
 * Keeps validated logos in bounded, memory-only caches keyed by their stable
 * source. Private organization images are never copied into localStorage or
 * shared between browser profiles.
 */
export function getCachedOfficialDocumentLogo(
  source: string,
  loader: () => Promise<string>
): Promise<string> {
  const key = cacheKey(source);
  const cached = logoDataUrlCache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = pendingLogoRequests.get(key);
  if (pending) return pending;

  const request = loader()
    .then(value => {
      if (value) logoDataUrlCache.set(key, value);
      return value;
    })
    .finally(() => {
      pendingLogoRequests.delete(key);
    });
  pendingLogoRequests.set(key, request);
  return request;
}

export function clearCachedOfficialDocumentLogo(source?: string): void {
  if (source) {
    const key = cacheKey(source);
    logoDataUrlCache.delete(key);
    const objectUrl = logoObjectUrlCache.get(key);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    logoObjectUrlCache.delete(key);
    return;
  }

  logoDataUrlCache.clear();
  for (const objectUrl of logoObjectUrlCache.values()) {
    URL.revokeObjectURL(objectUrl);
  }
  logoObjectUrlCache.clear();
}

/**
 * Keeps validated binary-backed object URLs separate from the legacy data-URL
 * cache. URLs stay alive while preview/print DOM nodes may still reference
 * them; clearCachedOfficialDocumentLogo revokes them when their source is
 * explicitly invalidated or the cache is cleared.
 */
export function getCachedOfficialDocumentLogoObjectUrl(
  source: string,
  loader: () => Promise<string>
): Promise<string> {
  const key = cacheKey(source);
  const cached = logoObjectUrlCache.get(key);
  if (cached) {
    rememberObjectUrl(key, cached);
    return Promise.resolve(cached);
  }

  const pending = pendingLogoObjectUrlRequests.get(key);
  if (pending) return pending;

  const request = loader()
    .then(value => {
      if (value) rememberObjectUrl(key, value);
      return value;
    })
    .finally(() => {
      pendingLogoObjectUrlRequests.delete(key);
    });
  pendingLogoObjectUrlRequests.set(key, request);
  return request;
}
