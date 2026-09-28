import type { Request, Response } from "express";
import { createApp } from "../server/app.ts";

const appPromise = createApp({ productionStatic: false });

function getForwardedPath(req: Request): string {
  const rawPath = req.query.path;
  const pathValue = Array.isArray(rawPath) ? rawPath[0] : rawPath;

  if (typeof pathValue !== "string" || pathValue.length === 0) {
    return "/api";
  }

  const normalizedPath = pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
  return normalizedPath.startsWith("/api/")
    ? normalizedPath
    : `/api${normalizedPath}`;
}

function rebuildRequestUrl(req: Request): void {
  const forwardedPath = getForwardedPath(req);
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(req.query)) {
    if (key === "path") continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) query.append(key, String(item));
      }
      continue;
    }

    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const queryString = query.toString();
  req.url = queryString ? `${forwardedPath}?${queryString}` : forwardedPath;
}

export default async function handler(req: Request, res: Response) {
  rebuildRequestUrl(req);
  const app = await appPromise;
  return app(req, res);
}
