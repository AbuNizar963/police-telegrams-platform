const logoDataUrlCache = new Map<string, string>();
const pendingLogoRequests = new Map<string, Promise<string>>();
const logoObjectUrlCache = new Map<string, string>();
const pendingLogoObjectUrlRequests = new Map<string, Promise<string>>();

function cacheKey(source: string): string {
  return source.trim();
}

/**
 * Keeps one validated logo per stable source for the lifetime of the web app.
 * The cache is intentionally memory-only: logos are private organization data
 * and must not be copied into localStorage or shared between browser profiles.
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
  if (cached) return Promise.resolve(cached);

  const pending = pendingLogoObjectUrlRequests.get(key);
  if (pending) return pending;

  const request = loader()
    .then(value => {
      if (value) logoObjectUrlCache.set(key, value);
      return value;
    })
    .finally(() => {
      pendingLogoObjectUrlRequests.delete(key);
    });
  pendingLogoObjectUrlRequests.set(key, request);
  return request;
}
