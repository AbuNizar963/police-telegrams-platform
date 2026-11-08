import { createHmac } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { ENV } from "./env";
import { getSupabaseAdmin } from "./supabase";

const VERIFICATION_WINDOW_SECONDS = 60;
const VERIFICATION_MAX_ATTEMPTS = 60;
const VERIFICATION_ERROR = "تعذر التحقق من حد الطلبات حاليًا";

type RateLimitRpcRow = {
  allowed?: unknown;
  retry_after_seconds?: unknown;
};

function hashVerificationKey(req: Request): string {
  if (ENV.authSessionSecret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters");
  }

  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  return createHmac("sha256", ENV.authSessionSecret)
    .update(`verification:ip:${clientIp}`)
    .digest("hex");
}

/**
 * Shared, atomic verification throttling for deployments with multiple server
 * instances. The database stores only an HMAC of the client address.
 */
export const verificationRateLimit: RequestHandler = (req, res, next) => {
  void (async () => {
    const { data, error } = await getSupabaseAdmin().rpc(
      "consume_auth_login_rate_limit",
      {
        p_key_hash: hashVerificationKey(req),
        p_max_attempts: VERIFICATION_MAX_ATTEMPTS,
        p_window_seconds: VERIFICATION_WINDOW_SECONDS,
        p_block_seconds: VERIFICATION_WINDOW_SECONDS,
      }
    );

    if (error) throw error;

    const row = (
      Array.isArray(data) ? data[0] : data
    ) as RateLimitRpcRow | null;
    if (!row || typeof row.allowed !== "boolean") {
      throw new Error("Invalid verification rate-limit response");
    }

    res.setHeader("RateLimit-Limit", String(VERIFICATION_MAX_ATTEMPTS));
    if (!row.allowed) {
      const retryAfterSeconds = Number(row.retry_after_seconds);
      const retryAfter =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.ceil(retryAfterSeconds)
          : VERIFICATION_WINDOW_SECONDS;
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        valid: false,
        error: "محاولات تحقق كثيرة؛ أعد المحاولة لاحقًا",
      });
      return;
    }

    next();
  })().catch(() => {
    // Fail closed without logging the request, client IP, or database details.
    console.error("Verification rate-limit check failed");
    if (!res.headersSent) {
      res.status(503).json({ error: VERIFICATION_ERROR });
    }
  });
};
