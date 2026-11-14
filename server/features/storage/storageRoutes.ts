import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { ENV } from "../../_core/env";
import { getAuthenticatedUserFromRequest } from "../../_core/auth";
import {
  getTelegramAttachmentByStorageKey,
  getTelegramById,
  getTelegramVersion,
} from "../../db";
import { canAccessTelegramScope } from "../../telegramAccess";
import {
  getOrganizationSettings,
  isDepartmentLogoExclusiveToOrganization,
} from "../../db";
import { isPlatformOwner } from "../../ownerAccess";
import { validateUploadedFile } from "../../fileSecurity";
import {
  getOrganizationByIdIncludingInactive,
  getUserOrganizationMembership,
} from "../organizations/organization";
import {
  StorageAccessDeniedError,
  organizationAttachmentKeyMatches,
  parseOrganizationAttachmentKey,
  storageCreateSignedUrl,
  storageDownload,
  storageGetSignedUrl,
  storageKeyFromStoredUrl,
  storagePutDepartmentLogo,
} from "./storage";

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

  if (
    possibleOrganizationId &&
    ORGANIZATION_ID_PATTERN.test(possibleOrganizationId)
  ) {
    if (
      possibleOrganizationId.toLowerCase() !==
      membership.organizationId.toLowerCase()
    ) {
      throw new StorageAccessDeniedError();
    }
    return;
  }

  const settings = await getOrganizationSettings(membership.organizationId);
  const configuredLogoKeys = [
    getStoredLogoKey(settings?.logoKey),
    getStoredLogoKey(settings?.logoUrl),
  ].filter((value): value is string => Boolean(value));

  if (
    !configuredLogoKeys.includes(key) ||
    !(await isDepartmentLogoExclusiveToOrganization(
      key,
      membership.organizationId
    ))
  ) {
    throw new StorageAccessDeniedError();
  }
}

const MAX_DEPARTMENT_LOGO_UPLOAD_BYTES = 2_621_440;

type DepartmentLogoUploadContext = {
  organizationId: string;
  fileName: string;
  contentType: "image/png" | "image/jpeg";
};

async function authorizeDepartmentLogoUpload(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = await getAuthenticatedUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return;
  }

  const organizationId = req.get("x-organization-id")?.trim() ?? "";
  if (!ORGANIZATION_ID_PATTERN.test(organizationId)) {
    res.status(400).json({ error: "معرّف الجهة غير صالح" });
    return;
  }

  let fileName: string;
  try {
    fileName = decodeURIComponent(req.get("x-file-name") ?? "");
  } catch {
    res.status(400).json({ error: "اسم ملف الشعار غير صالح" });
    return;
  }

  const contentType = req.get("content-type")?.split(";")[0]?.trim();
  if (contentType !== "image/png" && contentType !== "image/jpeg") {
    res.status(415).json({ error: "صيغة الشعار يجب أن تكون PNG أو JPG" });
    return;
  }

  const expectedExtension =
    contentType === "image/png" ? /\.png$/i : /\.(?:jpe?g)$/i;
  if (!expectedExtension.test(fileName)) {
    res.status(400).json({ error: "امتداد الملف لا يطابق صيغة الصورة" });
    return;
  }

  const organization =
    await getOrganizationByIdIncludingInactive(organizationId);
  if (!organization || organization.deletedAt) {
    res.status(404).json({ error: "الجهة غير موجودة أو محذوفة" });
    return;
  }

  if (!isPlatformOwner(user)) {
    const membership = await getUserOrganizationMembership(user.id);
    const canManageOrganization =
      membership?.isActive === true &&
      ["system_admin", "organization_admin"].includes(membership.role) &&
      membership.organizationId === organization.id;
    if (!canManageOrganization) {
      res.status(403).json({ error: "لا تملك صلاحية رفع شعار هذه الجهة" });
      return;
    }
  }

  res.locals.departmentLogoUpload = {
    organizationId: organization.id,
    fileName,
    contentType,
  } satisfies DepartmentLogoUploadContext;
  next();
}

async function receiveDepartmentLogoUpload(
  req: Request,
  res: Response
): Promise<void> {
  const upload = res.locals.departmentLogoUpload as
    DepartmentLogoUploadContext | undefined;
  if (!upload || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "لم يتم استلام بيانات صورة الشعار" });
    return;
  }

  try {
    validateUploadedFile({
      bytes: req.body,
      declaredType: upload.contentType,
      fileName: upload.fileName,
      maxBytes: MAX_DEPARTMENT_LOGO_UPLOAD_BYTES,
    });
    const result = await storagePutDepartmentLogo(
      upload.organizationId,
      upload.fileName,
      req.body,
      upload.contentType
    );
    res.set("Cache-Control", "no-store");
    res.status(201).json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "تعذر التحقق من ملف الشعار";
    const isInvalidFile = new Set([
      "حجم الملف غير صالح",
      "اسم الملف غير صالح",
      "نوع الملف لا يطابق محتواه الحقيقي",
      "هذا الامتداد غير مسموح به",
    ]).has(message);
    if (isInvalidFile) {
      res.status(400).json({ error: message });
      return;
    }

    console.error("[Storage] Department logo upload failed", error);
    res.status(502).json({ error: "تعذر رفع الشعار إلى مساحة التخزين" });
  }
}

export function registerStorageRoutes(app: Express): void {
  app.put(
    "/api/storage/department-logo",
    authorizeDepartmentLogoUpload,
    express.raw({
      type: ["image/png", "image/jpeg"],
      limit: MAX_DEPARTMENT_LOGO_UPLOAD_BYTES,
    }),
    receiveDepartmentLogoUpload
  );

  app.get(
    "/api/telegrams/:telegramId/versions/:versionNumber/logo",
    async (req, res) => {
      const telegramId = Number(req.params.telegramId);
      const versionNumber = Number(req.params.versionNumber);
      if (
        !Number.isSafeInteger(telegramId) ||
        telegramId < 1 ||
        !Number.isSafeInteger(versionNumber) ||
        versionNumber < 1
      ) {
        res.status(400).send("Invalid telegram version reference");
        return;
      }

      const user = await getAuthenticatedUserFromRequest(req);
      if (!user) {
        res.status(401).send("Authentication required");
        return;
      }

      try {
        const telegram = await getTelegramById(telegramId);
        if (!telegram) {
          res.status(404).send("Telegram not found");
          return;
        }
        if (!(await canAccessTelegramScope(user, telegram))) {
          throw new StorageAccessDeniedError();
        }

        const version = await getTelegramVersion(telegramId, versionNumber);
        if (!version) {
          res.status(404).send("Telegram version not found");
          return;
        }
        const letterhead =
          version.snapshot.letterhead &&
          typeof version.snapshot.letterhead === "object"
            ? (version.snapshot.letterhead as Record<string, unknown>)
            : null;
        const key =
          typeof letterhead?.logoStorageKey === "string"
            ? letterhead.logoStorageKey
            : "";
        const expectedPrefix = `department/logos/${telegram.organizationId}/`;
        const fileName = key.startsWith(expectedPrefix)
          ? key.slice(expectedPrefix.length)
          : "";
        if (
          !fileName ||
          fileName.includes("/") ||
          fileName.includes("\\") ||
          fileName === "." ||
          fileName === ".." ||
          !/^[^/]+\.(?:png|jpe?g|webp)$/i.test(fileName) ||
          letterhead?.organizationId !== telegram.organizationId
        ) {
          throw new StorageAccessDeniedError();
        }

        const asset = await storageDownload(key);
        const actualContentType = asset.contentType
          .toLowerCase()
          .split(";")[0]
          ?.trim();
        if (
          asset.body.length === 0 ||
          (actualContentType !== "image/png" &&
            actualContentType !== "image/jpeg" &&
            actualContentType !== "image/webp")
        ) {
          throw new StorageAccessDeniedError();
        }

        res.set("Cache-Control", "private, no-store");
        res.set("Vary", "Cookie");
        res.set("Content-Type", actualContentType);
        res.set("X-Content-Type-Options", "nosniff");
        res.send(asset.body);
      } catch (error) {
        if (error instanceof StorageAccessDeniedError) {
          res.status(403).send("Storage access denied");
          return;
        }
        console.error(
          "[Storage] Historical telegram logo retrieval failed",
          error
        );
        res.status(502).send("Storage backend error");
      }
    }
  );

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

        // Serve bytes through the same-origin route so exports do not depend
        // on cross-origin canvas permissions.
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
          const storageOrganizationId =
            attachment.storageOrganizationId ??
            (isLegacyAttachmentKey ? (telegram?.organizationId ?? null) : null);
          const metadataMatchesTelegram =
            telegram !== null &&
            telegram !== undefined &&
            storageOrganizationId === telegram.organizationId;
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
