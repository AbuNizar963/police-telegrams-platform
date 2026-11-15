import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { ENV } from "../../_core/env";
import { getAuthenticatedUserFromRequest } from "../../_core/auth";
import {
  createTelegramAttachment,
  getTelegramAttachmentByStorageKey,
  getTelegramById,
  getTelegramVersion,
  writeAuditLog,
} from "../../db";
import { getRequestAuditContext } from "../../auditContext";
import { canAccessTelegramScope } from "../../telegramAccess";
import {
  getOrganizationSettings,
  isDepartmentLogoExclusiveToOrganization,
} from "../../db";
import { isPlatformOwner } from "../../ownerAccess";
import {
  ALLOWED_ATTACHMENT_TYPES,
  sha256Hex,
  validateUploadedFile,
  type AllowedAttachmentType,
} from "../../fileSecurity";
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
  storageCreateOrganizationAttachmentUploadUrl,
  storageDelete,
  storageGetObjectInfo,
  storagePutDepartmentLogo,
} from "./storage";

const ORGANIZATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_TELEGRAM_ATTACHMENT_UPLOAD_BYTES = 10 * 1024 * 1024;

type TelegramAttachmentRequestContext = {
  user: NonNullable<
    Awaited<ReturnType<typeof getAuthenticatedUserFromRequest>>
  >;
  telegram: NonNullable<Awaited<ReturnType<typeof getTelegramById>>>;
};

async function authorizeTelegramAttachmentRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await getAuthenticatedUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
      return;
    }

    const telegramId = Number(req.params.telegramId);
    if (!Number.isSafeInteger(telegramId) || telegramId < 1) {
      res.status(400).json({ error: "معرّف البرقية غير صالح" });
      return;
    }

    const telegram = await getTelegramById(telegramId);
    if (!telegram) {
      res.status(404).json({ error: "البرقية غير موجودة" });
      return;
    }
    if (!(await canAccessTelegramScope(user, telegram))) {
      res.status(403).json({ error: "لا تملك صلاحية إرفاق ملف بهذه البرقية" });
      return;
    }

    res.locals.telegramAttachmentRequest = {
      user,
      telegram,
    } satisfies TelegramAttachmentRequestContext;
    next();
  } catch (error) {
    next(error);
  }
}

function parseTelegramAttachmentMetadata(body: unknown): {
  fileName: string;
  contentType: AllowedAttachmentType;
  sizeBytes: number;
} | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const fileName =
    typeof value.fileName === "string" ? value.fileName.trim() : "";
  const contentType =
    typeof value.contentType === "string"
      ? value.contentType.trim().toLowerCase()
      : "";
  const sizeBytes = Number(value.sizeBytes);

  if (
    !fileName ||
    fileName.length > 180 ||
    /[\u0000-\u001f]/.test(fileName) ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    !ALLOWED_ATTACHMENT_TYPES.includes(contentType as AllowedAttachmentType) ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 1 ||
    sizeBytes > MAX_TELEGRAM_ATTACHMENT_UPLOAD_BYTES
  ) {
    return null;
  }

  return {
    fileName,
    contentType: contentType as AllowedAttachmentType,
    sizeBytes,
  };
}

async function createTelegramAttachmentUploadUrl(
  req: Request,
  res: Response
): Promise<void> {
  const context = res.locals.telegramAttachmentRequest as
    TelegramAttachmentRequestContext | undefined;
  const metadata = parseTelegramAttachmentMetadata(req.body);
  if (!context || !metadata) {
    res.status(400).json({ error: "بيانات رفع المرفق غير صالحة" });
    return;
  }

  try {
    const upload = await storageCreateOrganizationAttachmentUploadUrl(
      context.telegram.organizationId,
      context.telegram.id,
      metadata.fileName
    );
    res.set("Cache-Control", "no-store");
    res.status(200).json({
      ...upload,
      fileName: metadata.fileName,
      contentType: metadata.contentType,
      sizeBytes: metadata.sizeBytes,
    });
  } catch (error) {
    console.error("[Storage] Telegram attachment upload URL failed", error);
    res.status(502).json({ error: "تعذر تجهيز رابط رفع المرفق" });
  }
}

async function removeUncommittedAttachment(key: string): Promise<void> {
  try {
    await storageDelete(key);
  } catch (error) {
    console.error("[Storage] Uncommitted attachment cleanup failed", error);
  }
}

async function finalizeTelegramAttachmentUpload(
  req: Request,
  res: Response
): Promise<void> {
  const context = res.locals.telegramAttachmentRequest as
    TelegramAttachmentRequestContext | undefined;
  const metadata = parseTelegramAttachmentMetadata(req.body);
  const key =
    req.body &&
    typeof req.body === "object" &&
    typeof (req.body as Record<string, unknown>).key === "string"
      ? ((req.body as Record<string, unknown>).key as string).trim()
      : "";

  if (!context || !metadata || !key) {
    res.status(400).json({ error: "بيانات اعتماد المرفق غير صالحة" });
    return;
  }

  if (
    !organizationAttachmentKeyMatches(
      key,
      context.telegram.organizationId,
      context.telegram.id
    )
  ) {
    res.status(403).json({ error: "مسار المرفق لا يخص هذه البرقية" });
    return;
  }

  const storedFileName = key.split("/").pop()?.slice(37) ?? "";
  const expectedStorageFileName = metadata.fileName.replace(/\.\.+/g, "_");
  if (storedFileName !== expectedStorageFileName) {
    res.status(400).json({ error: "اسم الملف لا يطابق رابط الرفع" });
    return;
  }

  try {
    const existing = await getTelegramAttachmentByStorageKey(key);
    if (existing) {
      if (
        existing.telegramId !== context.telegram.id ||
        existing.storageOrganizationId !== context.telegram.organizationId
      ) {
        res.status(403).json({ error: "المرفق مسجل ضمن جهة أخرى" });
        return;
      }
      res.set("Cache-Control", "no-store");
      res.status(200).json({
        success: true,
        alreadyFinalized: true,
        key,
        fileName: metadata.fileName,
        contentType: metadata.contentType,
        size: metadata.sizeBytes,
      });
      return;
    }

    const objectInfo = await storageGetObjectInfo(key);
    const storedContentType = objectInfo.contentType
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (
      objectInfo.size !== metadata.sizeBytes ||
      objectInfo.size < 1 ||
      objectInfo.size > MAX_TELEGRAM_ATTACHMENT_UPLOAD_BYTES ||
      storedContentType !== metadata.contentType
    ) {
      await removeUncommittedAttachment(key);
      res.status(400).json({
        error: "حجم الملف المرفوع لا يطابق البيانات المعلنة",
      });
      return;
    }

    const asset = await storageDownload(key);
    if (asset.body.byteLength !== metadata.sizeBytes) {
      await removeUncommittedAttachment(key);
      res.status(400).json({ error: "حجم الملف المرفوع غير صالح" });
      return;
    }

    try {
      validateUploadedFile({
        bytes: asset.body,
        declaredType: metadata.contentType,
        fileName: metadata.fileName,
        maxBytes: MAX_TELEGRAM_ATTACHMENT_UPLOAD_BYTES,
      });
    } catch (error) {
      await removeUncommittedAttachment(key);
      res.status(400).json({
        error: error instanceof Error ? error.message : "محتوى المرفق غير صالح",
      });
      return;
    }

    const sha256 = sha256Hex(asset.body);
    try {
      await createTelegramAttachment({
        telegramId: context.telegram.id,
        storageOrganizationId: context.telegram.organizationId,
        storageKey: key,
        originalName: metadata.fileName,
        mimeType: metadata.contentType,
        sizeBytes: asset.body.byteLength,
        sha256,
        uploadedByUserId: context.user.id,
      });
    } catch (error) {
      await removeUncommittedAttachment(key);
      console.error(
        "[Storage] Telegram attachment metadata write failed",
        error
      );
      res.status(500).json({ error: "تعذر تسجيل بيانات المرفق" });
      return;
    }

    await writeAuditLog({
      ...getRequestAuditContext(req),
      actorUserId: context.user.id,
      actorName: context.user.name ?? context.user.email ?? "Officer",
      action: "attachment.upload",
      entityType: "telegram_attachment",
      entityId: String(context.telegram.id),
      metadata: JSON.stringify({
        fileName: metadata.fileName,
        contentType: metadata.contentType,
        size: asset.body.byteLength,
        sha256,
      }),
    });

    res.set("Cache-Control", "no-store");
    res.status(201).json({
      success: true,
      key,
      fileName: metadata.fileName,
      contentType: metadata.contentType,
      size: asset.body.byteLength,
      sha256,
    });
  } catch (error) {
    console.error("[Storage] Telegram attachment finalization failed", error);
    res.status(502).json({ error: "تعذر التحقق من المرفق وتسجيله" });
  }
}

const DEPARTMENT_LOGO_KEY_PATTERN =
  /^department\/logos\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/)?[^/]+\.(?:png|jpe?g|webp)$/i;
const MAX_DEPARTMENT_LOGO_RESPONSE_BYTES = 4_000_000;

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
  app.post(
    "/api/telegrams/:telegramId/attachments/upload-url",
    authorizeTelegramAttachmentRequest,
    createTelegramAttachmentUploadUrl
  );

  app.post(
    "/api/telegrams/:telegramId/attachments/finalize",
    authorizeTelegramAttachmentRequest,
    finalizeTelegramAttachmentUpload
  );

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
        if (asset.body.length > MAX_DEPARTMENT_LOGO_RESPONSE_BYTES) {
          res.status(413).send("Logo exceeds the serverless image size limit");
          return;
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
