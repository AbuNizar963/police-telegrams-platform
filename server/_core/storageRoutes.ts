import type { Express } from "express";
import { getAuthenticatedUserFromRequest } from "./auth";
import { getTelegramAttachmentByStorageKey, getTelegramById } from "../db";
import { canAccessTelegramScope } from "../telegramAccess";
import {
  StorageAccessDeniedError,
  organizationAttachmentKeyMatches,
  parseOrganizationAttachmentKey,
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
      // Department logos have existed in several storage naming formats.
      // Accept only image files directly under department/logos or one
      // organization-UUID directory below it; never allow nested paths.
      const departmentLogoKeyPattern =
        /^department\/logos\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/)?[^/]+\.(?:png|jpe?g|webp)$/i;
      const isDepartmentLogo = departmentLogoKeyPattern.test(key);
      if (key.startsWith("department/logos/") && !isDepartmentLogo) {
        throw new StorageAccessDeniedError();
      }

      if (isDepartmentLogo) {
        // Download through the storage SDK instead of fetching a signed URL
        // over HTTP. A redirect fallback would send the browser cross-origin,
        // where export canvas conversion can fail because of CORS.
        const asset = await storageDownload(key);
        if (asset.body.length === 0) {
          throw new Error("Logo storage returned an empty object");
        }

        res.set("Cache-Control", "private, no-store");
        res.set("Vary", "Cookie");
        res.set("Content-Type", asset.contentType || "image/png");
        res.set("X-Content-Type-Options", "nosniff");
        res.send(asset.body);
        return;
      }

      const scopedAttachment = parseOrganizationAttachmentKey(key);
      if (key.startsWith("organizations/") && !scopedAttachment) {
        throw new StorageAccessDeniedError();
      }

      const isLegacyAttachmentKey = /^telegrams\/[1-9]\d*\/[^/]+$/.test(key);
      if (scopedAttachment || isLegacyAttachmentKey) {
        const attachment = await getTelegramAttachmentByStorageKey(key);
        if (!attachment) {
          // Both new and legacy attachment objects require an authoritative
          // metadata row. Legacy keys remain readable only through their
          // linked telegram and current organization scope.
          throw new StorageAccessDeniedError();
        } else {
          const telegram = await getTelegramById(attachment.telegramId);
          const metadataMatchesTelegram =
            telegram !== null &&
            telegram !== undefined &&
            attachment.storageOrganizationId === telegram.organizationId;
          const keyMatchesMetadata =
            !scopedAttachment ||
            (scopedAttachment.organizationId ===
              attachment.storageOrganizationId &&
              scopedAttachment.telegramId === telegram?.id &&
              organizationAttachmentKeyMatches(
                key,
                attachment.storageOrganizationId,
                attachment.telegramId
              ));

          if (
            !metadataMatchesTelegram ||
            !keyMatchesMetadata ||
            !telegram ||
            !(await canAccessTelegramScope(user, telegram))
          ) {
            throw new StorageAccessDeniedError();
          }

          const url = await storageCreateSignedUrl(key, 10 * 60);
          res.set("Cache-Control", "private, no-store");
          res.set("Vary", "Cookie");
          res.redirect(307, url);
          return;
        }
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
