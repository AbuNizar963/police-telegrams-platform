import type { Express } from "express";
import { ENV } from "./env";
import { getAuthenticatedUserFromRequest } from "./auth";
import { getOrganizationSettings } from "../db";
import { isPlatformOwner } from "../ownerAccess";
import { getUserOrganizationMembership } from "../organization";
import {
  StorageAccessDeniedError,
  storageDownload,
  storageGetSignedUrl,
  storageKeyFromStoredUrl,
} from "../storage";

const ORGANIZATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEPARTMENT_LOGO_KEY_PATTERN =
  /^department\/logos\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/)?[^/]+\.(?:png|jpe?g|webp)$/i;

function getStoredLogoKey(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const storedValue = value.trim();
  if (storedValue.startsWith("department/logos/")) return storedValue;
  return storageKeyFromStoredUrl(storedValue, ENV.supabaseStorageBucket);
}

/**
 * Logo objects are private. Organization-scoped keys are accessible only to
 * members of that organization; legacy unscoped keys are accessible only when
 * they are the exact logo configured for the authenticated user's organization.
 */
async function assertDepartmentLogoAccess(
  key: string,
  user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUserFromRequest>>>
): Promise<void> {
  if (isPlatformOwner(user)) return;

  const membership = await getUserOrganizationMembership(user.id);
  if (!membership || !membership.isActive) {
    throw new StorageAccessDeniedError();
  }

  const segments = key.split("/");
  const possibleOrganizationId = segments[2];

  if (possibleOrganizationId && ORGANIZATION_ID_PATTERN.test(possibleOrganizationId)) {
    if (possibleOrganizationId.toLowerCase() !== membership.organizationId.toLowerCase()) {
      throw new StorageAccessDeniedError();
    }
    return;
  }

  const settings = await getOrganizationSettings(membership.organizationId);
  const configuredLogoKeys = [
    getStoredLogoKey(settings?.logoKey),
    getStoredLogoKey(settings?.logoUrl),
  ].filter((value): value is string => Boolean(value));

  if (!configuredLogoKeys.includes(key)) {
    throw new StorageAccessDeniedError();
  }
}

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
      // Department logos support legacy names and organization-scoped names,
      // but nested paths are never valid.
      const isDepartmentLogo = DEPARTMENT_LOGO_KEY_PATTERN.test(key);
      if (key.startsWith("department/logos/") && !isDepartmentLogo) {
        throw new StorageAccessDeniedError();
      }

      if (isDepartmentLogo) {
        await assertDepartmentLogoAccess(key, user);

        // Serve bytes from the private bucket through the same-origin route so
        // exports do not depend on cross-origin canvas permissions.
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
