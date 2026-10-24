import type { Express } from "express";
import { getAuthenticatedUserFromRequest } from "./auth";
import {
  StorageAccessDeniedError,
  storageCreateSignedUrl,
  storageDownload,
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

      if (isDepartmentLogo) {
        // Download through the storage SDK and stream bytes from this origin.
        // Redirecting to a signed third-party URL breaks fetch() during export
        // in browsers that enforce CORS, so logo requests must not fall back
        // to cross-origin redirects.
        const asset = await storageDownload(key);
        if (!asset.body.length) {
          throw new Error("Logo storage returned an empty object");
        }
        res.set("Cache-Control", "private, no-store");
        res.set("Vary", "Cookie");
        res.set("X-Content-Type-Options", "nosniff");
        res.set("Content-Type", asset.contentType ?? "application/octet-stream");
        res.send(asset.body);
        return;
      }

      const url = await storageGetSignedUrl(key, user);
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
