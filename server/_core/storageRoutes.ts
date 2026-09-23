import type { Express } from "express";
import { getAuthenticatedUserFromRequest } from "./auth";
import { storageGetSignedUrl } from "../storage";

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
      const url = await storageGetSignedUrl(key, user);
      res.set("Cache-Control", "private, max-age=300");
      res.redirect(307, url);
    } catch (error) {
      if (error instanceof Error && error.message === "Storage access denied") {
        res.status(403).send("Storage access denied");
        return;
      }

      console.error("[Storage] Signed URL failed", error);
      res.status(502).send("Storage backend error");
    }
  });
}
