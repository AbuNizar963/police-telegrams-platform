import type { Express } from "express";
import { getAuthenticatedUserFromRequest } from "./auth";
import {
  StorageAccessDeniedError,
  storageCreateSignedUrl,
  storageGetSignedUrl,
} from "../storage";

export function registerStorageRoutes(app: Express): void {
  app.get("/api/storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];

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
      const isDepartmentLogo =
        /^department\/logos\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[^/]+\.(?:png|jpg)$/i.test(
          key
        );
      if (key.startsWith("department/logos/") && !isDepartmentLogo) {
        throw new StorageAccessDeniedError();
      }

      const url = isDepartmentLogo
        ? await storageCreateSignedUrl(key, 10 * 60)
        : await storageGetSignedUrl(key, user);
      res.set("Cache-Control", "private, max-age=300");
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
