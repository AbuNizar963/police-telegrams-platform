import type { Request, RequestHandler } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

const MAX_TRACKED_KEYS = 10_000;
const buckets = new Map<string, RateLimitEntry>();

/**
 * Process-local fixed-window limiter. Keep the store bounded so attacker-
 * controlled client identifiers cannot grow memory without limit.
 *
 * Production deployments with multiple instances should additionally enforce
 * limits at the shared edge/API gateway; this middleware is a defense-in-depth
 * guard for each application instance.
 */
export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const {
    windowMs,
    maxRequests,
    message = "طلبات كثيرة؛ أعد المحاولة لاحقًا",
    keyGenerator = req => req.ip || "unknown",
  } = options;

  if (
    !Number.isSafeInteger(windowMs) ||
    windowMs <= 0 ||
    !Number.isSafeInteger(maxRequests) ||
    maxRequests <= 0
  ) {
    throw new Error(
      "Rate limit windowMs and maxRequests must be positive integers"
    );
  }

  return (req, res, next) => {
    const now = Date.now();
    const key = keyGenerator(req);
    let entry = buckets.get(key);

    if (!entry || entry.resetAt <= now) {
      if (buckets.size >= MAX_TRACKED_KEYS) {
        for (const [trackedKey, trackedEntry] of buckets) {
          if (trackedEntry.resetAt <= now) buckets.delete(trackedKey);
        }
      }

      if (buckets.size >= MAX_TRACKED_KEYS && !buckets.has(key)) {
        res.setHeader(
          "Retry-After",
          String(Math.max(1, Math.ceil(windowMs / 1000)))
        );
        res.status(429).json({ error: message });
        return;
      }

      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }

    if (entry.count >= maxRequests) {
      res.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000)))
      );
      res.status(429).json({ error: message });
      return;
    }

    entry.count += 1;
    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader("RateLimit-Remaining", String(maxRequests - entry.count));
    res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
    next();
  };
}

/** Test-only reset hook; not used by application code. */
export function resetRateLimitStoreForTests(): void {
  buckets.clear();
}
