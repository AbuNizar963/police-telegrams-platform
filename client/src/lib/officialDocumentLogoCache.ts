const logoDataUrlCache = new Map<string, string>();
const pendingLogoRequests = new Map<string, Promise<string>>();

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
  if (source) logoDataUrlCache.delete(cacheKey(source));
  else logoDataUrlCache.clear();
}
