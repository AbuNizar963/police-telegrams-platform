import type { Request } from "express";

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getRequestAuditContext(req: Request): {
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: "mobile" | "tablet" | "desktop" | "unknown";
} {
  const forwarded = firstHeader(req.headers["x-forwarded-for"]);
  const realIp = firstHeader(req.headers["x-real-ip"]);
  const ipAddress =
    (forwarded?.split(",")[0]?.trim() || realIp || req.ip || null)?.slice(
      0,
      80
    ) || null;
  const userAgent =
    firstHeader(req.headers["user-agent"])?.slice(0, 512) || null;
  const source = userAgent?.toLowerCase() ?? "";
  const deviceType = /ipad|tablet|android(?!.*mobile)/i.test(source)
    ? "tablet"
    : /mobi|iphone|ipod|android/i.test(source)
      ? "mobile"
      : userAgent
        ? "desktop"
        : "unknown";
  return { ipAddress, userAgent, deviceType };
}
