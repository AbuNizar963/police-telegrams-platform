const TRUSTED_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
]);

const TRUSTED_PUSH_HOST_SUFFIXES = [
  ".push.services.mozilla.com",
  ".notify.windows.com",
];

/**
 * Web Push endpoints are stored from the browser and later receive server-side
 * HTTPS requests. Restrict them to known browser push providers to prevent
 * authenticated users from turning notification delivery into an SSRF proxy.
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (!endpoint || endpoint.length > 2048) return false;

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return false;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    (parsed.port.length > 0 && parsed.port !== "443") ||
    parsed.hash.length > 0
  ) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  return (
    TRUSTED_PUSH_HOSTS.has(hostname) ||
    TRUSTED_PUSH_HOST_SUFFIXES.some(
      suffix => hostname.endsWith(suffix) && hostname.length > suffix.length
    )
  );
}
