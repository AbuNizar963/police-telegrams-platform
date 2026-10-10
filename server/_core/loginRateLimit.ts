import { createHmac } from "node:crypto";
import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { getSupabaseAdmin } from "./supabase";

type LoginRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type RateLimitRpcRow = {
  allowed?: unknown;
  retry_after_seconds?: unknown;
};

function hashLoginRateLimitKey(value: string): string {
  if (ENV.authSessionSecret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters");
  }

  return createHmac("sha256", ENV.authSessionSecret)
    .update(value)
    .digest("hex");
}

async function consumeLoginRateLimit(
  keyHash: string,
  maxAttempts: number
): Promise<LoginRateLimitResult> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "consume_auth_login_rate_limit",
    {
      p_key_hash: keyHash,
      p_max_attempts: maxAttempts,
      p_window_seconds: 15 * 60,
      p_block_seconds: 15 * 60,
    }
  );

  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "تعذر التحقق من محاولات تسجيل الدخول",
    });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | RateLimitRpcRow
    | null;
  if (!row || typeof row.allowed !== "boolean") {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "تعذر التحقق من محاولات تسجيل الدخول",
    });
  }

  const retryAfterSeconds = Number(row.retry_after_seconds);
  return {
    allowed: row.allowed,
    retryAfterSeconds:
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.ceil(retryAfterSeconds)
        : 0,
  };
}

/**
 * Rate-limit login before password verification. Keys are HMACs so raw
 * usernames and client IP addresses are never persisted in the database.
 */
export async function enforceLoginRateLimit(
  req: Request,
  res: Response,
  username: string
): Promise<string> {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const normalizedUsername = username.trim().toLowerCase();
  const ipKeyHash = hashLoginRateLimitKey(`login:ip:${clientIp}`);
  const accountIpKeyHash = hashLoginRateLimitKey(
    `login:account-ip:${normalizedUsername}:${clientIp}`
  );

  const [ipLimit, accountIpLimit] = await Promise.all([
    consumeLoginRateLimit(ipKeyHash, 60),
    consumeLoginRateLimit(accountIpKeyHash, 10),
  ]);

  if (!ipLimit.allowed || !accountIpLimit.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      ipLimit.allowed ? 0 : ipLimit.retryAfterSeconds,
      accountIpLimit.allowed ? 0 : accountIpLimit.retryAfterSeconds
    );
    res.setHeader("Retry-After", String(retryAfterSeconds));
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "تم تجاوز عدد محاولات تسجيل الدخول. حاول لاحقًا.",
    });
  }

  return accountIpKeyHash;
}

/**
 * Successful authentication clears only the account/IP bucket. The broader
 * per-IP bucket remains in place to protect the endpoint from request floods.
 */
export async function clearSuccessfulLoginRateLimit(
  accountIpKeyHash: string
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("auth_login_rate_limits")
    .delete()
    .eq("keyHash", accountIpKeyHash);

  if (error) {
    throw new Error("Failed to clear the successful login rate-limit bucket");
  }
}
