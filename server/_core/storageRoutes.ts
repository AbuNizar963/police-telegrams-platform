import type { Express } from "express";
import { getAuthenticatedUserFromRequest } from "./auth";
import {
  StorageAccessDeniedError,
  storageCreateSignedUrl,
  storageGetSignedUrl,
} from "../storage";

export function registerStorageRoutes(app: Express): void {
  app.get("/api/storage/*key", async (req, res) => {
    const rawKey = req.params.key;
    const key = Array.isArray(rawKey) ? rawKey.join("/") : rawKey;

    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    const user = await getAuthenticatedUserFromRequest(req);
    if (!user) {
      res.status(401).send("Authentication required");
      return;
    }

    try {
      const departmentLogoKeyPattern = new RegExp(
        "^department/logos/" +
          "(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/)?" +
          "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[^/]+\\.(?:png|jpg)$",
        "i"
      );
      const isDepartmentLogo = departmentLogoKeyPattern.test(key);
      if (key.startsWith("department/logos/") && !isDepartmentLogo) {
        throw new StorageAccessDeniedError();
      }

      const url = isDepartmentLogo
        ? await storageCreateSignedUrl(key, 10 * 60)
        : await storageGetSignedUrl(key, user);
      if (isDepartmentLogo) {
        try {
          const assetResponse = await fetch(url);
          if (!assetResponse.ok) {
            throw new Error("Logo storage backend error");
          }
          res.set("Cache-Control", "private, no-store");
          res.set("Vary", "Cookie");
          res.set(
            "Content-Type",
            assetResponse.headers.get("content-type") ?? "image/png"
          );
          res.send(Buffer.from(await assetResponse.arrayBuffer()));
          return;
        } catch (error) {
          // Keep a redirect fallback for storage providers that do not allow
          // server-side fetching; the browser can still follow the signed URL.
          console.warn(
            "[Storage] Logo proxy unavailable, using signed URL",
            error
          );
        }
      }
      res.set("Cache-Control", "private, no-store");
      res.set("Vary", "Cookie");
      res.redirect(307, url);
    } catch (error) {
      if (error instanceof StorageAccessDeniedError) {
        res.status(403).send("Storage access denied");
        return;
      }

      console.error("[Storage] Signed URL failed", error);
      res.status(502).send("Storage backend error");
    }
  });
}
