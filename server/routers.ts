import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  authenticateLocalUser,
  clearAuthenticatedSession,
  hashPassword,
  publicUser,
  setAuthenticatedSession,
  verifyPassword,
} from "./_core/auth";
import {
  clearSuccessfulLoginRateLimit,
  enforceLoginRateLimit,
} from "./_core/loginRateLimit";
import { ENV } from "./_core/env";
import { isAllowedPushEndpoint } from "./_core/pushEndpoint";
import { isPlatformOwner, isPlatformOwnerUserId } from "./ownerAccess";
import {
  canAccessTelegramScope,
  canViewAllTelegrams,
  getActiveUserOrganizationId,
} from "./telegramAccess";
import { canManageTelegramContent as canManageTelegramContentByTime } from "@shared/telegramPermissions";
import { z } from "zod";
import { getRequestAuditContext } from "./auditContext";
import { localizeDigits, normalizeNumberSystem } from "@shared/numberSystem";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  organizationAdminProcedure,
  organizationManagerProcedure,
} from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { profileRouter } from "./profileRouter";
import { userManagementRouter } from "./userManagementRouter";
import {
  allocateSerialNumber,
  allocateOrganizationSerialNumber,
  getSuggestedOrganizationSerialNumber,
  reserveOrganizationSerialNumber,
  createTelegram,
  createTelegramAttachment,
  updateTelegram,
  getDashboardStats,
  getMaxSerialNumber,
  getOrCreateSettings,
  getPlatformDocumentSettings,
  getOrganizationSettings,
  getTelegramById,
  findTelegramByOfficialSerial,
  getTelegramAttachmentById,
  getTelegramByIdempotencyKey,
  getTelegramReport,
  listAuditLogs,
  searchAuditLogs,
  listTelegramActions,
  listTelegramVersions,
  listTelegramAttachments,
  listTelegrams,
  purgeTelegramPermanently,
  recordTelegramAction,
  recordTelegramVersion,
  transitionTelegram,
  updateDepartmentSettings,
  updatePlatformDocumentSettings,
  upsertOrganizationSettingsForOrganization,
  updateRouteIncomingSerial,
  updateRouteOutgoingSerial,
  writeAuditLog,
  createLocalOwnerUser,
  getUserByUsername,
  deletePushSubscription,
  deleteMobilePushToken,
  listUserNotifications,
  markNotificationRead,
  resolveRouteNotifications,
  notifyOrganizationUsers,
  notifyUser,
  upsertPushSubscription,
  upsertMobilePushToken,
} from "./db";
import {
  HEX_COLOR_PATTERN,
  MAX_WATERMARK_OPACITY_PERCENT,
} from "../shared/platformDocumentSettings";
import {
  addOrganizationMembership,
  approveTelegramRoute,
  createOrganization,
  decideTelegramRouteAsReceiver,
  ensureOrganizationAccounts,
  getConfiguredTelegramDestination,
  getOrganizationById,
  getOrganizationByIdIncludingInactive,
  getUserOrganizationMembership,
  getTelegramRouteById,
  hasTelegramRoute,
  listAllOrganizations,
  listOrganizationAccountSummaries,
  listOrganizationDescendants,
  provisionOrganizationAccount,
  listIncomingTelegramRoutes,
  listOrganizationsForUser,
  listPendingRouteApprovals,
  listRoutingDirectory,
  listRoutingTargets,
  receiveTelegramRoute,
  routeTelegram,
  routeTelegramBroadcastAtomic,
  type AtomicBroadcastCopyInput,
  selectPlatformOwnerWorkplace,
  updateOrganization,
  updateOrganizationAccount,
} from "./organization";
import {
  assertCanManageOrganization,
  getManagedOrganizationIds,
} from "./organizationScope";
import {
  StorageAccessDeniedError,
  storageCreateSignedUrl,
  storageDelete,
  storageDownload,
  storageGetSignedUrl,
  storageKeyFromStoredUrl,
  organizationAttachmentKeyMatches,
  storagePutOrganizationAttachment,
  storagePutDepartmentLogo,
  storageStableUrl,
} from "./storage";
import { detectOfficialDocumentLogoMimeType } from "../shared/officialDocumentLogo";
import {
  ALLOWED_ATTACHMENT_TYPES,
  validateUploadedFile,
  sha256Hex,
} from "./fileSecurity";
import {
  getWebPushPublicKey,
  notifyOrganizationRouteEvent,
  notifyOrganizationTelegramCreated,
} from "./_core/notification";
import {
  buildTelegramWorkbook,
  formatTelegramWorkbookDateTime,
} from "./telegramWorkbook";
import { parseTelegramWorkbookBase64 } from "./telegramImportWorkbook";
import { parseImportedDate } from "./importedDate";

const classificationSchema = z.enum(["secret", "normal"]);
const prioritySchema = z.enum(["slow", "normal", "urgent"]);
const categorySchema = z.enum([
  "criminal",
  "administrative",
  "traffic",
  "security",
  "tactical",
  "intelligence",
  "emergency",
  "public_order",
  "personnel",
  "logistics",
  "training",
  "community",
  "other",
]);
const statusSchema = z.enum([
  "draft",
  "submitted",
  "in_review",
  "approved",
  "returned",
  "rejected",
  "forwarded",
  "pending",
  "in_progress",
  "resolved",
  "completed",
  "archived",
]);

const excelImportRowSchema = z.object({
  originalSerial: z.string().max(120).optional(),
  time: z.string().max(120).optional(),
  sender: z.string().max(255).optional(),
  date: z.string().max(120).optional(),
  body: z.string().trim().min(3).max(20000),
  recipient: z.string().max(255).optional(),
  signature: z.string().max(255).optional(),
  notes: z.string().max(4000).optional(),
  sheetName: z.enum(["صادر", "وارد"]),
});

const TELEGRAM_IMPORT_PAGE_SIZE = 1000;

type TelegramImportDirection = "incoming" | "outgoing";

function getImportDirection(
  sheetName: "صادر" | "وارد"
): TelegramImportDirection {
  return sheetName === "وارد" ? "incoming" : "outgoing";
}

function normalizeImportedSerial(value: string | number): string {
  return localizeDigits(value, "latin").trim().toLowerCase();
}

function makeImportSerialKey(
  direction: TelegramImportDirection,
  value: string | number
): string {
  return JSON.stringify([direction, normalizeImportedSerial(value)]);
}

function getExistingTelegramSerialKeys(
  telegrams: Awaited<ReturnType<typeof listTelegrams>>
): Set<string> {
  return new Set(
    telegrams.flatMap(telegram => {
      let direction: TelegramImportDirection;
      if (
        telegram.importDirection === "incoming" ||
        telegram.importDirection === "outgoing"
      ) {
        direction = telegram.importDirection;
      } else {
        direction =
          telegram.organizationId === telegram.currentOrganizationId
            ? "outgoing"
            : "incoming";
      }
      return [
        ...(telegram.originalSerial
          ? [makeImportSerialKey(direction, telegram.originalSerial)]
          : []),
        ...(telegram.organizationSerialCode
          ? [makeImportSerialKey(direction, telegram.organizationSerialCode)]
          : []),
        makeImportSerialKey(direction, telegram.serialCode),
      ];
    })
  );
}

async function listAllTelegramsForImport(
  userId: number,
  organizationId: string
): Promise<Awaited<ReturnType<typeof listTelegrams>>> {
  const allTelegrams: Awaited<ReturnType<typeof listTelegrams>> = [];
  for (let page = 1; ; page += 1) {
    const pageRows = await listTelegrams(
      userId,
      false,
      organizationId,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      page,
      TELEGRAM_IMPORT_PAGE_SIZE
    );
    allTelegrams.push(...pageRows);
    if (pageRows.length < TELEGRAM_IMPORT_PAGE_SIZE) return allTelegrams;
  }
}

function isPrivateLogoHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some(value => value > 255)) return true;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

const safeLogoUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .refine(value => {
    if (!value) return true;
    if (value.startsWith("/api/storage/")) return true;
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !isPrivateLogoHostname(url.hostname)
      );
    } catch {
      return false;
    }
  }, "رابط الشعار يجب أن يكون مسار تخزين داخليًا أو رابط HTTPS موثوقًا");

const DEPARTMENT_LOGO_KEY_PATTERN =
  /^department\/logos\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[^/]+\.(?:png|jpg)$/i;

function departmentLogoKeyFromStoredValue(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const key = trimmed.startsWith("department/logos/")
    ? trimmed
    : storageKeyFromStoredUrl(trimmed, ENV.supabaseStorageBucket);
  return key && DEPARTMENT_LOGO_KEY_PATTERN.test(key) ? key : null;
}

function assertOrganizationLogoScope(
  value: string | null | undefined,
  organizationId: string,
  previousValue: unknown
): void {
  const nextValue = value?.trim() || null;
  const previous =
    typeof previousValue === "string" ? previousValue.trim() || null : null;

  // Existing legacy references may be left untouched while unrelated
  // settings are edited. Any new/replaced logo must be organization-scoped.
  if (!nextValue || nextValue === previous) return;

  const key = departmentLogoKeyFromStoredValue(nextValue);
  const scopedMatch = key?.match(
    /^department\/logos\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/[^/]+\.(?:png|jpg)$/i
  );

  if (
    !scopedMatch ||
    scopedMatch[1].toLowerCase() !== organizationId.toLowerCase()
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "أعد رفع شعار الجهة؛ الشعار الحالي لا يخص هذه الجهة",
    });
  }
}

function assertLogoBelongsToOrganization(
  logoValue: string | null | undefined,
  organizationId: string | null,
  previousValues: unknown[]
): void {
  if (!logoValue) return;

  // Keep a previously configured legacy URL working until the organization
  // uploads a replacement. New logo assignments must use that organization's
  // own private storage directory.
  if (previousValues.some(value => value === logoValue)) return;

  const key = departmentLogoKeyFromStoredValue(logoValue);
  const expectedPrefix = organizationId
    ? `department/logos/${organizationId}/`
    : null;

  if (!key || !expectedPrefix || !key.startsWith(expectedPrefix)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "يجب حفظ شعار الجهة في مسار التخزين الخاص بها داخل Supabase",
    });
  }
}
const organizationSettingsPayloadSchema = z.object({
  departmentName: z.string().trim().min(2).max(255),
  unitName: z.string().trim().max(255),
  unitChiefRank: z.string().trim().max(120),
  unitChiefName: z.string().trim().max(255),
  serialPrefix: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[A-Z0-9-]+$/),
  incomingSerialPrefix: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[A-Z0-9-]+$/),
  serialStart: z.number().int().min(1).max(999999999),
  incomingSerialStart: z.number().int().min(1).max(999999999),
  timezone: z.string().trim().min(3).max(64),
  dateFormat: z.enum([
    "dd/MM/yyyy HH:mm:ss",
    "yyyy-MM-dd HH:mm:ss",
    "yyyy/MM/dd HH:mm:ss",
    "dd MMM yyyy HH:mm",
  ]),
  timeFormat: z.enum(["12", "24"]).optional(),
  numberSystem: z.enum(["latin", "arabic"]),
  logoUrl: safeLogoUrlSchema,
});

function getStartingNumberFromPrefix(
  prefix: string,
  configuredStart: number,
  direction: string
): number {
  if (!/^\d+$/.test(prefix)) return configuredStart;
  const numericPrefix = Number(prefix);
  if (
    !Number.isSafeInteger(numericPrefix) ||
    numericPrefix < 1 ||
    numericPrefix > 999_999_999
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `البادئة الرقمية للبرقيات ${direction} يجب أن تكون بين 1 و999999999`,
    });
  }
  return numericPrefix;
}

function assertSupportedTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0);
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "المنطقة الزمنية غير صالحة",
    });
  }
}

type TelegramScopeUser = {
  id: number;
  role: string;
  username?: string | null;
};

async function assertTelegramOrganizationScope(
  user: TelegramScopeUser,
  telegram: {
    organizationId: string;
    currentOrganizationId: string | null;
  },
  message: string
): Promise<void> {
  if (!(await canAccessTelegramScope(user, telegram))) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

function canManageTelegramContent(
  user: TelegramScopeUser,
  createdAt: Date
): boolean {
  return canManageTelegramContentByTime(createdAt, isPlatformOwner(user));
}

async function assertOwnerOrganizationScope(
  user: TelegramScopeUser,
  organizationId: string | null,
  message: string
): Promise<void> {
  if (!isPlatformOwner(user)) return;

  const activeOrganizationId = await getActiveUserOrganizationId(user);
  if (organizationId !== activeOrganizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

async function getAuditLogAccessScope(user: TelegramScopeUser): Promise<{
  organizationId?: string;
}> {
  const membership = await getUserOrganizationMembership(user.id);
  const hasSystemAuditAccess =
    isPlatformOwner(user) ||
    user.role === "admin" ||
    (membership?.isActive === true && membership.role === "system_admin");
  if (hasSystemAuditAccess) return {};

  // An organization auditor can inspect only events explicitly attributed to
  // the active organization. Platform-wide security events remain restricted.
  if (membership?.isActive === true && membership.role === "auditor") {
    return { organizationId: membership.organizationId };
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "لا تملك صلاحية عرض سجل الإجراءات",
  });
}

function telegramAuditSnapshot(telegram: Record<string, unknown>) {
  const fields = [
    "id",
    "serialNumber",
    "serialCode",
    "originalSerial",
    "subject",
    "recipient",
    "body",
    "classification",
    "priority",
    "category",
    "status",
    "organizationId",
    "currentOrganizationId",
    "createdByUserId",
    "creatorName",
    "creatorBadgeId",
    "attachmentManifest",
    "gpsLatitude",
    "gpsLongitude",
    "createdAt",
    "updatedAt",
  ];
  return Object.fromEntries(
    fields.map(field => [field, telegram[field] ?? null])
  );
}

function toSnapshotIsoDate(
  value: Date | string | null | undefined
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function buildTelegramVersionSnapshot(telegram: {
  id: number;
  serialNumber: number;
  serialCode: string;
  originalSerial?: string | null;
  organizationId: string;
  subject: string;
  recipient: string;
  body: string;
  classification: string;
  priority: string;
  category: string;
  status: string;
  createdAt?: Date | string | null;
  telegramDate?: Date | string | null;
  creatorName: string;
  creatorBadgeId?: string | null;
  verificationToken: string;
  gpsLatitude?: string | null;
  gpsLongitude?: string | null;
}) {
  const settings = await getOrganizationSettings(telegram.organizationId);
  const candidateLogoKey = departmentLogoKeyFromStoredValue(
    settings?.logoKey || settings?.logoUrl
  );
  const organizationLogoPrefix = `department/logos/${telegram.organizationId}/`;
  const logoStorageKey =
    candidateLogoKey?.startsWith(organizationLogoPrefix) === true
      ? candidateLogoKey
      : null;

  return {
    schemaVersion: 1,
    telegramId: telegram.id,
    serialNumber: telegram.serialNumber,
    serialCode: telegram.serialCode,
    originalSerial: telegram.originalSerial ?? null,
    organizationId: telegram.organizationId,
    createdAt: toSnapshotIsoDate(telegram.createdAt),
    telegramDate: toSnapshotIsoDate(telegram.telegramDate),
    creatorName: telegram.creatorName || "غير محدد",
    creatorBadgeId: telegram.creatorBadgeId ?? null,
    verificationToken: telegram.verificationToken || "",
    gpsLatitude: telegram.gpsLatitude ?? null,
    gpsLongitude: telegram.gpsLongitude ?? null,
    subject: telegram.subject,
    recipient: telegram.recipient,
    body: telegram.body,
    classification: telegram.classification,
    priority: telegram.priority,
    category: telegram.category,
    status: telegram.status,
    letterhead: {
      organizationId: telegram.organizationId,
      logoStorageKey,
      logoContentType: !logoStorageKey
        ? null
        : logoStorageKey.toLowerCase().endsWith(".png")
          ? "image/png"
          : logoStorageKey.toLowerCase().endsWith(".webp")
            ? "image/webp"
            : "image/jpeg",
    },
  };
}

export const appRouter = router({
  system: systemRouter,
  profile: profileRouter,
  userManagement: userManagementRouter,

  auditLogs: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return listAuditLogs(await getAuditLogAccessScope(ctx.user));
    }),
    search: protectedProcedure
      .input(
        z.object({
          actorUserId: z.number().int().positive().optional(),
          action: z.string().trim().max(80).optional(),
          resourceId: z.string().trim().max(80).optional(),
          search: z.string().trim().max(120).optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          page: z.number().int().min(1).max(100000).default(1),
          pageSize: z.number().int().min(10).max(100).default(25),
        })
      )
      .query(async ({ ctx, input }) =>
        searchAuditLogs({
          ...input,
          ...(await getAuditLogAccessScope(ctx.user)),
        })
      ),
  }),

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    login: publicProcedure
      .input(
        z.object({
          username: z.string().trim().min(3).max(120),
          password: z.string().min(1).max(256),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const normalizedUsername = input.username.trim();
        const loginRateLimitKey = await enforceLoginRateLimit(
          ctx.req,
          ctx.res,
          normalizedUsername
        );

        let user = await authenticateLocalUser(
          normalizedUsername,
          input.password
        );

        if (
          !user &&
          normalizedUsername.toLowerCase() ===
            ENV.ownerUsername.trim().toLowerCase() &&
          (ENV.ownerPasswordHash || ENV.ownerInitialPassword)
        ) {
          // The initial secret is only used to bootstrap a missing owner account.
          // Existing accounts and their credentials are never overwritten.
          const bootstrapHash =
            ENV.ownerPasswordHash ||
            (await hashPassword(ENV.ownerInitialPassword));
          const ownerPasswordMatches = await verifyPassword(
            input.password,
            bootstrapHash
          );

          if (ownerPasswordMatches) {
            try {
              const owner = await createLocalOwnerUser({
                username: ENV.ownerUsername.trim(),
                passwordHash: bootstrapHash,
              });
              user = publicUser(owner);
            } catch {
              // A concurrent login may have created the owner first. Re-read and
              // authenticate against the persisted credential rather than replacing it.
              const existing = await getUserByUsername(
                ENV.ownerUsername.trim()
              );
              if (existing?.passwordHash) {
                user = await authenticateLocalUser(
                  normalizedUsername,
                  input.password
                );
              } else if (!existing) {
                throw new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: "تعذر إنشاء حساب المالك",
                });
              }
            }
          }
        }

        if (!user) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "اسم المستخدم أو كلمة المرور غير صحيحة",
          });
        }

        try {
          await clearSuccessfulLoginRateLimit(loginRateLimitKey);
        } catch (error) {
          console.warn(
            "[Auth] Failed to clear successful login rate limit",
            error
          );
        }

        await setAuthenticatedSession(ctx.res, user);
        return user;
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      clearAuthenticatedSession(ctx.res);
      return { success: true } as const;
    }),
  }),

  organizations: router({
    mine: protectedProcedure.query(({ ctx }) =>
      listOrganizationsForUser(ctx.user.id)
    ),

    context: protectedProcedure.query(async ({ ctx }) => {
      const membership = await getUserOrganizationMembership(ctx.user.id);
      if (!membership) return null;
      const organization = await getOrganizationById(membership.organizationId);
      return {
        organizationId: membership.organizationId,
        organizationName: organization?.name ?? "الجهة الحالية",
        role: membership.role,
        isActive: membership.isActive,
        isOwner: isPlatformOwner(ctx.user),
      };
    }),

    // Expose only the logo for the user's own organization. Full settings remain
    // restricted to platform owners, while mobile users can render their
    // organization's letterhead and welcome branding.
    logo: protectedProcedure
      .input(z.object({ organizationId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        if (!isPlatformOwner(ctx.user)) {
          const membership = await getUserOrganizationMembership(ctx.user.id);
          if (
            !membership ||
            !membership.isActive ||
            membership.organizationId !== input.organizationId
          ) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "لا تملك صلاحية عرض شعار هذه الجهة",
            });
          }
        }

        const settings = await getOrganizationSettings(input.organizationId);
        const configuredLogoUrl = settings?.logoUrl?.trim() || null;
        const storageKey = departmentLogoKeyFromStoredValue(
          settings?.logoKey || configuredLogoUrl
        );
        const scopedLogo = storageKey?.match(
          /^department\/logos\/([0-9a-f-]{36})\//i
        );
        if (
          scopedLogo &&
          scopedLogo[1].toLowerCase() !== input.organizationId.toLowerCase()
        ) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "الشعار المحفوظ لا يتبع الجهة المطلوبة",
          });
        }
        return {
          organizationId: input.organizationId,
          // Always use the authenticated same-origin image route for private
          // storage objects instead of exposing a region-sensitive CDN URL.
          logoUrl: storageKey
            ? storageStableUrl(storageKey)
            : configuredLogoUrl,
          settingsExists: Boolean(settings),
        };
      }),

    logoForExport: protectedProcedure
      .input(z.object({ organizationId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        if (!isPlatformOwner(ctx.user)) {
          const membership = await getUserOrganizationMembership(ctx.user.id);
          if (
            !membership ||
            !membership.isActive ||
            membership.organizationId !== input.organizationId
          ) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "لا تملك صلاحية تصدير شعار هذه الجهة",
            });
          }
        }

        const settings = await getOrganizationSettings(input.organizationId);
        const logoUrl = settings?.logoUrl?.trim() || null;
        const storedLogo = settings?.logoKey?.trim() || logoUrl;
        const storageKey = storedLogo
          ? storedLogo.startsWith("department/logos/")
            ? storedLogo
            : storageKeyFromStoredUrl(storedLogo, ENV.supabaseStorageBucket)
          : null;

        if (!storageKey) {
          return {
            organizationId: input.organizationId,
            logoUrl,
            logoDataUrl: null,
          };
        }

        const departmentLogoKeyPattern =
          /^department\/logos\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/)?[^/]+\.(?:png|jpe?g|webp)$/i;
        if (!departmentLogoKeyPattern.test(storageKey)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "مسار شعار الجهة غير صالح للتصدير",
          });
        }
        const scopedStorageKey = storageKey.match(
          /^department\/logos\/([0-9a-f-]{36})\//i
        );
        if (
          scopedStorageKey &&
          scopedStorageKey[1].toLowerCase() !==
            input.organizationId.toLowerCase()
        ) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "الشعار المحفوظ لا يتبع الجهة المطلوبة",
          });
        }

        if (!isPlatformOwner(ctx.user) && !scopedStorageKey) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "أعد رفع الشعار من إعدادات الجهة؛ الشعار الحالي غير معزول",
          });
        }

        const asset = await storageDownload(storageKey);
        const mimeType = detectOfficialDocumentLogoMimeType(
          asset.body,
          asset.contentType,
          storageKey
        );
        if (!mimeType || asset.body.length === 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ملف شعار الجهة غير صالح للطباعة أو التصدير",
          });
        }

        return {
          organizationId: input.organizationId,
          logoUrl,
          logoDataUrl:
            asset.body.length <= 2_500_000
              ? `data:${mimeType};base64,${asset.body.toString("base64")}`
              : null,
        };
      }),

    selectWorkplace: protectedProcedure
      .input(z.object({ organizationId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        if (!isPlatformOwner(ctx.user)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "هذا الخيار متاح لمالك النظام فقط",
          });
        }
        const organization = await selectPlatformOwnerWorkplace({
          user: ctx.user,
          organizationId: input.organizationId,
        });
        return {
          organizationId: organization.id,
          organizationName: organization.name,
        };
      }),

    descendants: protectedProcedure.query(({ ctx }) =>
      listOrganizationDescendants(ctx.user.id)
    ),

    routingTargets: protectedProcedure.query(({ ctx }) =>
      listRoutingTargets(ctx.user.id)
    ),

    routingDirectory: protectedProcedure.query(({ ctx }) =>
      listRoutingDirectory(ctx.user.id)
    ),

    all: organizationManagerProcedure.query(async ({ ctx }) => {
      const allowedIds = new Set(await getManagedOrganizationIds(ctx.user));
      const organizations = await listAllOrganizations();
      return organizations.filter(organization =>
        allowedIds.has(organization.id)
      );
    }),
    accounts: organizationManagerProcedure
      .input(z.object({ organizationId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const allowedIds = new Set(await getManagedOrganizationIds(ctx.user));
        if (!allowedIds.has(input.organizationId)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا تملك صلاحية عرض حسابات هذه الجهة",
          });
        }
        return listOrganizationAccountSummaries(input.organizationId);
      }),
    allAccounts: organizationManagerProcedure.query(async ({ ctx }) => {
      const allowedIds = await getManagedOrganizationIds(ctx.user);
      const summaries = await Promise.all(
        allowedIds.map(organizationId =>
          listOrganizationAccountSummaries(organizationId)
        )
      );
      return summaries.flat();
    }),
    settings: router({
      get: adminProcedure
        .input(z.object({ organizationId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
          if (!isPlatformOwner(ctx.user)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "إعدادات الجهات متاحة لمالك النظام فقط",
            });
          }
          const organization = await getOrganizationByIdIncludingInactive(
            input.organizationId
          );
          if (!organization) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "الجهة غير موجودة",
            });
          }
          const settings = await getOrganizationSettings(input.organizationId);
          if (settings) return { ...settings, settingsExists: true };
          return {
            organizationId: organization.id,
            departmentName: organization.name,
            unitName: "وحدة العمليات",
            unitChiefRank: "العقيد",
            unitChiefName: "رئيس الوحدة",
            serialPrefix: "POL",
            incomingSerialPrefix: "POL",
            serialStart: 1,
            incomingSerialStart: 1,
            nextOutgoingSerial: 1,
            nextIncomingSerial: 1,
            timezone: "Asia/Damascus",
            dateFormat: "yyyy/MM/dd HH:mm:ss",
            timeFormat: "24" as const,
            numberSystem: "latin" as const,
            logoUrl: null,
            logoKey: null,
            settingsExists: false,
          };
        }),

      update: adminProcedure
        .input(
          organizationSettingsPayloadSchema.extend({
            organizationId: z.string().uuid(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          if (!isPlatformOwner(ctx.user)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "إعدادات الجهات متاحة لمالك النظام فقط",
            });
          }
          const organization = await getOrganizationByIdIncludingInactive(
            input.organizationId
          );
          if (!organization) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "الجهة غير موجودة",
            });
          }

          const previousSettings = await getOrganizationSettings(
            input.organizationId
          );
          assertOrganizationLogoScope(
            input.logoUrl,
            organization.id,
            previousSettings?.logoUrl
          );
          assertSupportedTimezone(input.timezone);
          const outgoingStart = getStartingNumberFromPrefix(
            input.serialPrefix,
            input.serialStart,
            "الصادرة"
          );
          const incomingStart = getStartingNumberFromPrefix(
            input.incomingSerialPrefix,
            input.incomingSerialStart,
            "الواردة"
          );
          const saved = await upsertOrganizationSettingsForOrganization(
            organization.id,
            {
              departmentName: localizeDigits(
                input.departmentName,
                input.numberSystem
              ),
              unitName: localizeDigits(input.unitName, input.numberSystem),
              unitChiefRank: localizeDigits(
                input.unitChiefRank,
                input.numberSystem
              ),
              unitChiefName: localizeDigits(
                input.unitChiefName,
                input.numberSystem
              ),
              serialPrefix: input.serialPrefix,
              incomingSerialPrefix: input.incomingSerialPrefix,
              serialStart: outgoingStart,
              incomingSerialStart: incomingStart,
              nextOutgoingSerial: outgoingStart,
              nextIncomingSerial: incomingStart,
              timezone: input.timezone,
              dateFormat: input.dateFormat,
              timeFormat:
                input.timeFormat ?? previousSettings?.timeFormat ?? "24",
              numberSystem: input.numberSystem,
              logoUrl: input.logoUrl,
              updatedByUserId: ctx.user.id,
            }
          );

          await writeAuditLog({
            ...getRequestAuditContext(ctx.req),
            actorUserId: ctx.user.id,
            actorName: ctx.user.name ?? ctx.user.email ?? "Administrator",
            action: "organization.settings.update",
            entityType: "department_settings",
            entityId: String(saved.id),
            metadata: JSON.stringify({
              organizationId: organization.id,
              organizationCode: organization.code,
              organizationName: organization.name,
              departmentName: input.departmentName,
              unitName: input.unitName,
              unitChiefRank: input.unitChiefRank,
              unitChiefName: input.unitChiefName,
              serialPrefix: input.serialPrefix,
              incomingSerialPrefix: input.incomingSerialPrefix,
              serialStart: outgoingStart,
              incomingSerialStart: incomingStart,
              timezone: input.timezone,
              dateFormat: input.dateFormat,
              timeFormat: input.timeFormat,
              numberSystem: input.numberSystem,
            }),
          });

          return saved;
        }),
    }),
    pendingApprovals: protectedProcedure.query(({ ctx }) =>
      listPendingRouteApprovals(ctx.user.id, canViewAllTelegrams(ctx.user))
    ),

    create: adminProcedure
      .input(
        z.object({
          parentOrganizationId: z.string().uuid().nullable().optional(),
          telegramDestinationOrganizationId: z
            .string()
            .uuid()
            .nullable()
            .optional(),
          code: z
            .string()
            .trim()
            .min(2)
            .max(64)
            .regex(/^[A-Z0-9_-]+$/i),
          name: z.string().trim().min(2).max(255),
          allowHierarchyOverride: z.boolean().default(false),
          createAccount: z.boolean().default(true),
          type: z.enum([
            "central",
            "governorate",
            "region",
            "police_department",
            "command",
            "department",
            "station",
            "unit",
          ]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.allowHierarchyOverride && !isPlatformOwner(ctx.user)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "تجاوز التسلسل الافتراضي متاح لمالك النظام فقط",
          });
        }
        const result = await createOrganization({
          ...input,
          createdByUserId: ctx.user.id,
        });
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Administrator",
          action: input.allowHierarchyOverride
            ? "organization.created_with_hierarchy_override"
            : "organization.created",
          entityType: "organization",
          entityId: result.organization.id,
          metadata: JSON.stringify({
            organizationId: result.organization.id,
            code: result.organization.code,
            name: result.organization.name,
            type: result.organization.type,
            parentOrganizationId: result.organization.parentOrganizationId,
            allowHierarchyOverride: input.allowHierarchyOverride,
            accountCreated: Boolean(result.account),
          }),
        });
        return result;
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          parentOrganizationId: z.string().uuid().nullable(),
          telegramDestinationOrganizationId: z.string().uuid().nullable(),
          code: z
            .string()
            .trim()
            .min(2)
            .max(64)
            .regex(/^[A-Z0-9_-]+$/i),
          name: z.string().trim().min(2).max(255),
          accountUsername: z
            .string()
            .trim()
            .max(120)
            .regex(/^[a-zA-Z0-9._-]*$/)
            .default(""),
          accountPassword: z
            .string()
            .min(12)
            .max(256)
            .optional()
            .or(z.literal("")),
          allowHierarchyOverride: z.boolean().default(false),
          type: z.enum([
            "central",
            "governorate",
            "region",
            "police_department",
            "command",
            "department",
            "station",
            "unit",
          ]),
          isActive: z.boolean(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.allowHierarchyOverride && !isPlatformOwner(ctx.user)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "تجاوز التسلسل الافتراضي متاح لمالك النظام فقط",
          });
        }
        const previousOrganization = await getOrganizationByIdIncludingInactive(
          input.id
        );
        if (!previousOrganization) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "الجهة غير موجودة",
          });
        }
        const { accountUsername, accountPassword, ...organizationInput } =
          input;
        const organization = await updateOrganization(organizationInput);
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Administrator",
          action: input.allowHierarchyOverride
            ? "organization.hierarchy.override"
            : "organization.updated",
          entityType: "organization",
          entityId: organization.id,
          metadata: JSON.stringify({
            organizationId: organization.id,
            before: {
              name: previousOrganization.name,
              type: previousOrganization.type,
              parentOrganizationId: previousOrganization.parentOrganizationId,
              telegramDestinationOrganizationId:
                previousOrganization.telegramDestinationOrganizationId,
            },
            after: {
              name: organization.name,
              type: organization.type,
              parentOrganizationId: organization.parentOrganizationId,
              telegramDestinationOrganizationId:
                organization.telegramDestinationOrganizationId,
            },
            allowHierarchyOverride: input.allowHierarchyOverride,
          }),
        });
        const account = accountUsername
          ? await updateOrganizationAccount({
              organizationId: organization.id,
              username: accountUsername,
              password: accountPassword || undefined,
            })
          : null;
        return { organization, account };
      }),

    ensureAccounts: adminProcedure.mutation(({ ctx }) =>
      ensureOrganizationAccounts({ actorUserId: ctx.user.id })
    ),
    provisionAccount: adminProcedure
      .input(z.object({ organizationId: z.string().uuid() }))
      .mutation(({ ctx, input }) =>
        provisionOrganizationAccount({
          organizationId: input.organizationId,
          actorUserId: ctx.user.id,
        })
      ),

    assignMember: organizationManagerProcedure
      .input(
        z.object({
          organizationId: z.string().uuid(),
          userId: z.number().int().positive(),
          role: z.enum([
            "system_admin",
            "organization_admin",
            "regional_admin",
            "organization_supervisor",
            "dispatcher",
            "reviewer",
            "reader",
            "auditor",
          ]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (await isPlatformOwnerUserId(input.userId)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "لا يمكن تغيير عضوية مالك النظام من هذا المسار؛ استخدم محدد جهة العمل",
          });
        }
        await assertCanManageOrganization(ctx.user, input.organizationId);
        if (
          ["system_admin", "organization_admin", "regional_admin"].includes(
            input.role
          ) &&
          !isPlatformOwner(ctx.user) &&
          ctx.user.role !== "admin"
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "تعيين أدوار الإدارة العليا متاح لمالك النظام فقط",
          });
        }

        return addOrganizationMembership(input);
      }),
  }),

  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      const canViewAll = canViewAllTelegrams(ctx.user);
      const organizationId = await getActiveUserOrganizationId(ctx.user);

      return getDashboardStats(ctx.user.id, canViewAll, organizationId);
    }),
  }),

  notifications: router({
    registerMobileToken: protectedProcedure
      .input(
        z.object({
          token: z.string().trim().min(20).max(4096),
          platform: z.enum(["android", "ios"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const organizationId = await getActiveUserOrganizationId(ctx.user);
        await upsertMobilePushToken({
          userId: ctx.user.id,
          organizationId,
          token: input.token,
          platform: input.platform,
        });
        return { registered: true };
      }),
    unregisterMobileToken: protectedProcedure
      .input(z.object({ token: z.string().trim().min(20).max(4096) }))
      .mutation(async ({ ctx, input }) => {
        await deleteMobilePushToken(input.token, ctx.user.id);
        return { registered: false };
      }),
    inbox: protectedProcedure.query(async ({ ctx }) => {
      const organizationId = canViewAllTelegrams(ctx.user)
        ? undefined
        : await getActiveUserOrganizationId(ctx.user);
      return listUserNotifications(ctx.user.id, organizationId);
    }),
    markRead: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await markNotificationRead(ctx.user.id, input.id);
        return { read: true };
      }),
    config: protectedProcedure.query(() => ({
      enabled: Boolean(getWebPushPublicKey()),
      publicKey: getWebPushPublicKey(),
    })),
    subscribe: protectedProcedure
      .input(
        z.object({
          endpoint: z.string().url().max(2048),
          keys: z.object({
            p256dh: z.string().min(16).max(256),
            auth: z.string().min(8).max(256),
          }),
          userAgent: z.string().max(512).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!isAllowedPushEndpoint(input.endpoint)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "عنوان الإشعار لا ينتمي إلى مزوّد إشعارات موثوق",
          });
        }

        const organizationId = await getActiveUserOrganizationId(ctx.user);
        await upsertPushSubscription({
          userId: ctx.user.id,
          organizationId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent,
        });
        return { subscribed: true };
      }),
    unsubscribe: protectedProcedure
      .input(z.object({ endpoint: z.string().url().max(2048) }))
      .mutation(async ({ ctx, input }) => {
        await deletePushSubscription(ctx.user.id, input.endpoint);
        return { subscribed: false };
      }),
  }),

  reports: router({
    telegrams: protectedProcedure
      .input(
        z.object({
          search: z.string().max(120).optional(),
          classification: classificationSchema.optional(),
          priority: prioritySchema.optional(),
          category: categorySchema.optional(),
          status: statusSchema.optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(50),
        })
      )
      .query(async ({ ctx, input }) => {
        const owner = isPlatformOwner(ctx.user);
        const canViewAll = canViewAllTelegrams(ctx.user);
        const membership = await getUserOrganizationMembership(ctx.user.id);
        const allowedRoles = [
          "system_admin",
          "organization_admin",
          "regional_admin",
          "organization_supervisor",
          "reviewer",
          "reader",
          "auditor",
        ];
        if (
          !canViewAll &&
          !owner &&
          (!membership || !allowedRoles.includes(membership.role))
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا تملك صلاحية إصدار التقارير",
          });
        }
        const report = await getTelegramReport(
          input,
          canViewAll,
          canViewAll ? null : (membership?.organizationId ?? null)
        );
        return {
          ...report,
          generatedAt: new Date().toISOString(),
          filters: input,
        };
      }),
  }),

  settings: router({
    get: protectedProcedure.query(({ ctx }) =>
      getOrCreateSettings(ctx.user.id)
    ),

    uploadLogo: organizationAdminProcedure
      .input(
        z.object({
          organizationId: z.string().uuid(),
          fileName: z.string().trim().min(1).max(180),
          contentType: z.enum(["image/jpeg", "image/png"]),
          base64: z.string().min(1).max(7_000_000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const bytes = Buffer.from(input.base64, "base64");
        if (bytes.byteLength > 5 * 1024 * 1024) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "حجم الشعار يتجاوز 5 ميغابايت",
          });
        }
        validateUploadedFile({
          bytes,
          declaredType: input.contentType,
          fileName: input.fileName,
          maxBytes: 5 * 1024 * 1024,
        });

        const organization = await getOrganizationByIdIncludingInactive(
          input.organizationId
        );
        if (!organization) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "الجهة غير موجودة",
          });
        }
        if (!isPlatformOwner(ctx.user)) {
          const membership = await getUserOrganizationMembership(ctx.user.id);
          if (
            !membership ||
            !membership.isActive ||
            membership.organizationId !== organization.id
          ) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "لا تملك صلاحية رفع شعار هذه الجهة",
            });
          }
        }

        return storagePutDepartmentLogo(
          organization.id,
          input.fileName,
          bytes,
          input.contentType
        );
      }),

    update: organizationAdminProcedure
      .input(
        z.object({
          organizationId: z.string().uuid().nullable().optional(),
          departmentName: z.string().trim().min(2).max(255),
          // الوحدة التابعة ورئيسها حقول اختيارية؛ الواجهة تسمح بحفظ الإعدادات
          // بدون وحدة تابعة، لذلك يجب قبول القيمة الفارغة بعد trim بدل رفضها.
          unitName: z.string().trim().max(255).default("وحدة العمليات"),
          unitChiefRank: z.string().trim().max(120).default("العقيد"),
          unitChiefName: z.string().trim().max(255).default("رئيس الوحدة"),
          serialPrefix: z
            .string()
            .trim()
            .min(1)
            .max(24)
            .regex(/^[A-Z0-9-]+$/),
          incomingSerialPrefix: z
            .string()
            .trim()
            .min(1)
            .max(24)
            .regex(/^[A-Z0-9-]+$/),
          serialStart: z.number().int().min(1).max(999999999),
          incomingSerialStart: z.number().int().min(1).max(999999999),
          timezone: z.string().trim().min(3).max(64).default("Asia/Riyadh"),
          dateFormat: z
            .string()
            .trim()
            .min(4)
            .max(32)
            .default("yyyy/MM/dd HH:mm:ss"),
          timeFormat: z.enum(["12", "24"]).default("24"),
          numberSystem: z.enum(["latin", "arabic"]).default("latin"),
          logoUrl: safeLogoUrlSchema.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dbSettings = await getOrCreateSettings(ctx.user.id);
        const previousLogoValue = dbSettings.logoKey ?? dbSettings.logoUrl;
        assertLogoBelongsToOrganization(
          input.logoUrl,
          dbSettings.organizationId,
          [dbSettings.logoKey, dbSettings.logoUrl]
        );
        if (
          input.organizationId !== undefined &&
          dbSettings.organizationId !== input.organizationId
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "تغيّرت جهة العمل؛ حدّث الإعدادات ثم أعد الحفظ",
          });
        }

        const startFromPrefix = (
          prefix: string,
          configuredStart: number,
          direction: string
        ) => {
          if (!/^\d+$/.test(prefix)) return configuredStart;
          const numericPrefix = Number(prefix);
          if (
            !Number.isSafeInteger(numericPrefix) ||
            numericPrefix < 1 ||
            numericPrefix > 999_999_999
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `البادئة الرقمية للبرقيات ${direction} يجب أن تكون بين 1 و999999999`,
            });
          }
          return numericPrefix;
        };
        if (dbSettings.organizationId) {
          assertOrganizationLogoScope(
            input.logoUrl,
            dbSettings.organizationId,
            dbSettings.logoUrl
          );
        }

        const outgoingStart = startFromPrefix(
          input.serialPrefix,
          input.serialStart,
          "الصادرة"
        );
        const incomingStart = startFromPrefix(
          input.incomingSerialPrefix,
          input.incomingSerialStart,
          "الواردة"
        );
        const maxSerial = await getMaxSerialNumber();
        const safeNextSerial = Math.max(outgoingStart, maxSerial + 1);

        await updateDepartmentSettings(dbSettings.id, {
          departmentName: localizeDigits(
            input.departmentName,
            input.numberSystem
          ),
          unitName: localizeDigits(input.unitName, input.numberSystem),
          unitChiefRank: localizeDigits(
            input.unitChiefRank,
            input.numberSystem
          ),
          unitChiefName: localizeDigits(
            input.unitChiefName,
            input.numberSystem
          ),
          serialPrefix: input.serialPrefix,
          incomingSerialPrefix: input.incomingSerialPrefix,
          serialStart: outgoingStart,
          incomingSerialStart: incomingStart,
          nextSerial: safeNextSerial,
          // Numeric prefixes become that direction's start; nonnumeric prefixes
          // preserve its configured start. The two organization counters remain
          // independent, while the global serial remains an internal identifier.
          nextOutgoingSerial: outgoingStart,
          nextIncomingSerial: incomingStart,
          timezone: input.timezone,
          dateFormat: input.dateFormat,
          timeFormat: input.timeFormat,
          numberSystem: input.numberSystem,
          logoUrl: input.logoUrl ?? null,
          updatedByUserId: ctx.user.id,
        });

        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Administrator",
          action: "settings.update",
          entityType: "department_settings",
          entityId: String(dbSettings.id),
          metadata: JSON.stringify({
            ...input,
            serialStart: outgoingStart,
            incomingSerialStart: incomingStart,
            nextOutgoingSerial: outgoingStart,
            nextIncomingSerial: incomingStart,
          }),
        });

        return getOrCreateSettings(ctx.user.id);
      }),
  }),

  platformDocumentSettings: router({
    get: protectedProcedure.query(() => getPlatformDocumentSettings()),

    update: protectedProcedure
      .input(
        z.object({
          showMinistryWatermarkText: z.boolean(),
          watermarkOpacityPercent: z
            .number()
            .int()
            .min(0)
            .max(MAX_WATERMARK_OPACITY_PERCENT),
          headerDividerColor: z.string().regex(HEX_COLOR_PATTERN),
          showVerificationQr: z.boolean(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!isPlatformOwner(ctx.user)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "إعدادات النظام متاحة لمالك المنصة فقط",
          });
        }

        const saved = await updatePlatformDocumentSettings(input, ctx.user.id);
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Platform owner",
          action: "platform.document_settings.update",
          entityType: "platform_document_settings",
          entityId: "1",
          metadata: JSON.stringify(input),
        });
        return saved;
      }),
  }),

  telegrams: router({
    uploadAttachment: protectedProcedure
      .input(
        z.object({
          telegramId: z.number().int().positive(),
          fileName: z.string().trim().min(1).max(180),
          contentType: z.enum(ALLOWED_ATTACHMENT_TYPES),
          base64: z.string().min(1).max(14_000_000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const telegram = await getTelegramById(input.telegramId);
        if (!telegram) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }
        await assertTelegramOrganizationScope(
          ctx.user,
          telegram,
          "لا تملك صلاحية إرفاق ملف بهذه البرقية"
        );
        const bytes = Buffer.from(input.base64, "base64");

        if (bytes.byteLength > 10 * 1024 * 1024) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "حجم المرفق يتجاوز 10 ميغابايت",
          });
        }

        try {
          validateUploadedFile({
            bytes,
            declaredType: input.contentType,
            fileName: input.fileName,
            maxBytes: 10 * 1024 * 1024,
          });
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error
                ? error.message
                : "بيانات المرفق غير صالحة",
          });
        }

        const uploaded = await storagePutOrganizationAttachment(
          telegram.organizationId,
          telegram.id,
          input.fileName,
          bytes,
          input.contentType
        );

        try {
          await createTelegramAttachment({
            telegramId: input.telegramId,
            storageOrganizationId: telegram.organizationId,
            storageKey: uploaded.key,
            originalName: input.fileName,
            mimeType: input.contentType,
            sizeBytes: bytes.byteLength,
            sha256: sha256Hex(bytes),
            uploadedByUserId: ctx.user.id,
          });
        } catch (error) {
          try {
            await storageDelete(uploaded.key);
          } catch (cleanupError) {
            console.error(
              "[Storage] Orphan attachment cleanup failed",
              cleanupError
            );
          }
          throw error;
        }

        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
          action: "attachment.upload",
          entityType: "telegram_attachment",
          entityId: String(input.telegramId),
          metadata: JSON.stringify({
            fileName: input.fileName,
            contentType: input.contentType,
            size: bytes.byteLength,
            sha256: sha256Hex(bytes),
          }),
        });

        return {
          ...uploaded,
          fileName: input.fileName,
          contentType: input.contentType,
          size: bytes.byteLength,
        };
      }),
    attachments: protectedProcedure
      .input(z.object({ telegramId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const telegram = await getTelegramById(input.telegramId);
        if (!telegram) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }
        await assertTelegramOrganizationScope(
          ctx.user,
          telegram,
          "لا تملك صلاحية قراءة مرفقات هذه البرقية"
        );
        return listTelegramAttachments(input.telegramId);
      }),
    actions: protectedProcedure
      .input(z.object({ telegramId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const telegram = await getTelegramById(input.telegramId);
        if (!telegram) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }
        await assertTelegramOrganizationScope(
          ctx.user,
          telegram,
          "لا تملك صلاحية عرض سجل إجراءات هذه البرقية"
        );
        return listTelegramActions(input.telegramId);
      }),

    versions: protectedProcedure
      .input(z.object({ telegramId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const telegram = await getTelegramById(input.telegramId);
        if (!telegram) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }
        await assertTelegramOrganizationScope(
          ctx.user,
          telegram,
          "لا تملك صلاحية عرض إصدارات هذه البرقية"
        );

        const versions = await listTelegramVersions(input.telegramId);
        return versions.map(version => {
          const letterhead =
            version.snapshot.letterhead &&
            typeof version.snapshot.letterhead === "object"
              ? (version.snapshot.letterhead as Record<string, unknown>)
              : null;
          const storedLogoKey =
            typeof letterhead?.logoStorageKey === "string"
              ? letterhead.logoStorageKey
              : null;
          const expectedLogoPrefix = `department/logos/${telegram.organizationId}/`;
          const hasHistoricalLogo =
            Boolean(storedLogoKey) &&
            storedLogoKey!.startsWith(expectedLogoPrefix);

          return {
            id: version.id,
            telegramId: version.telegramId,
            versionNumber: version.versionNumber,
            changedByUserId: version.changedByUserId,
            changeReason: version.changeReason,
            createdAt: version.createdAt,
            snapshot: {
              ...version.snapshot,
              letterhead: {
                organizationId: telegram.organizationId,
                logoContentType:
                  typeof letterhead?.logoContentType === "string"
                    ? letterhead.logoContentType
                    : null,
                hasLogo: hasHistoricalLogo,
              },
            },
            logoUrl: hasHistoricalLogo
              ? `/api/telegrams/${telegram.id}/versions/${version.versionNumber}/logo`
              : null,
          };
        });
      }),
    downloadAttachment: protectedProcedure
      .input(z.object({ attachmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const attachment = await getTelegramAttachmentById(input.attachmentId);
        if (!attachment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "المرفق غير موجود",
          });
        }
        const telegram = await getTelegramById(attachment.telegramId);
        if (!telegram) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية المرتبطة بالمرفق غير موجودة",
          });
        }
        await assertTelegramOrganizationScope(
          ctx.user,
          telegram,
          "لا تملك صلاحية تنزيل هذا المرفق"
        );
        if (
          attachment.storageOrganizationId !== telegram.organizationId ||
          (attachment.storageKey.startsWith("organizations/") &&
            !organizationAttachmentKeyMatches(
              attachment.storageKey,
              attachment.storageOrganizationId,
              telegram.id
            ))
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "مسار المرفق لا يطابق الجهة المالكة",
          });
        }
        const url = await storageCreateSignedUrl(
          attachment.storageKey,
          10 * 60
        );
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
          action: "attachment.download",
          entityType: "telegram_attachment",
          entityId: String(attachment.id),
          metadata: JSON.stringify({
            telegramId: attachment.telegramId,
            sha256: attachment.sha256,
          }),
        });
        return {
          url,
          fileName: attachment.originalName,
          mimeType: attachment.mimeType,
        };
      }),
    recordDocumentOutput: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          operation: z.enum(["print", "download"]),
          format: z.enum(["pdf", "png"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const telegram = await getTelegramById(input.id);
        if (!telegram) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }
        await assertTelegramOrganizationScope(
          ctx.user,
          telegram,
          "لا تملك صلاحية إخراج هذه البرقية"
        );
        const occurredAt = new Date().toISOString();
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
          action: `telegram.document.${input.operation}`,
          entityType: "telegram",
          entityId: String(telegram.id),
          metadata: JSON.stringify({
            serialNumber: telegram.serialNumber,
            serialCode: telegram.serialCode,
            format: input.format,
            occurredAt,
          }),
        });
        return { success: true as const, occurredAt };
      }),
    incomingRoutes: protectedProcedure
      .input(z.object({ telegramId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const telegram = await getTelegramById(input.telegramId);
        if (!telegram) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }
        await assertTelegramOrganizationScope(
          ctx.user,
          telegram,
          "لا تملك صلاحية عرض سجل استلام هذه البرقية"
        );
        return listIncomingTelegramRoutes({
          telegramId: input.telegramId,
          userId: ctx.user.id,
          canViewAll: canViewAllTelegrams(ctx.user),
        });
      }),

    list: protectedProcedure
      .input(
        z
          .object({
            search: z.string().max(120).optional(),
            classification: classificationSchema.optional(),
            priority: prioritySchema.optional(),
            category: categorySchema.optional(),
            status: statusSchema.optional(),
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional(),
            organizationScope: z
              .union([z.string().uuid(), z.literal("children")])
              .optional(),
            page: z.number().int().min(1).max(100000).default(1),
            pageSize: z.number().int().min(1).max(100).default(50),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const owner = isPlatformOwner(ctx.user);
        const canViewAll = canViewAllTelegrams(ctx.user);
        const membership = await getUserOrganizationMembership(ctx.user.id);
        const regionalManagerScope =
          membership?.role === "regional_admin"
            ? await getManagedOrganizationIds(ctx.user, { activeOnly: true })
            : null;
        const organizationId = canViewAll
          ? null
          : await getActiveUserOrganizationId(ctx.user);
        const descendants =
          !owner && input?.organizationScope
            ? await listOrganizationDescendants(ctx.user.id)
            : [];
        const organizationScopeIds =
          regionalManagerScope ??
          (!owner && input?.organizationScope
            ? input.organizationScope === "children"
              ? [organizationId!, ...descendants.map(item => item.id)]
              : descendants.some(item => item.id === input.organizationScope)
                ? [input.organizationScope]
                : [organizationId!]
            : null);

        return listTelegrams(
          ctx.user.id,
          canViewAll,
          organizationId,
          input?.search,
          input?.classification,
          input?.priority,
          input?.category,
          input?.status,
          input?.from,
          input?.to,
          input?.page,
          input?.pageSize,
          organizationScopeIds
        );
      }),

    exportRows: protectedProcedure
      .input(
        z
          .object({
            search: z.string().max(120).optional(),
            classification: classificationSchema.optional(),
            priority: prioritySchema.optional(),
            category: categorySchema.optional(),
            status: statusSchema.optional(),
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const canViewAll = canViewAllTelegrams(ctx.user);
        const organizationId = canViewAll
          ? null
          : await getActiveUserOrganizationId(ctx.user);
        const rows = await listTelegrams(
          ctx.user.id,
          canViewAll,
          organizationId,
          input?.search,
          input?.classification,
          input?.priority,
          input?.category,
          input?.status,
          input?.from,
          input?.to,
          1,
          1000
        );
        const settings = await getOrCreateSettings(ctx.user.id);
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
          action: "telegram.export.rows",
          entityType: "telegram_collection",
          entityId: String(rows.length),
          metadata: JSON.stringify({
            rowCount: rows.length,
            filters: input ?? {},
          }),
        });
        return rows.map(row => ({
          ...row,
          ...formatTelegramWorkbookDateTime(
            row.telegramDate ?? row.createdAt,
            settings.timezone
          ),
        }));
      }),

    exportWorkbook: protectedProcedure
      .input(
        z.object({
          rows: z
            .array(
              z.object({
                serial: z.string().max(120),
                time: z.string().max(120),
                sender: z.string().max(255),
                date: z.string().max(120),
                body: z.string().max(20000),
                recipient: z.string().max(255),
                signature: z.string().max(255),
                notes: z.string().max(4000),
                direction: z.enum(["صادر", "وارد"]),
              })
            )
            .min(1)
            .max(1000),
          password: z.string().max(128).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const base64 = await buildTelegramWorkbook(input);
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
          action: "telegram.export.workbook",
          entityType: "telegram_collection",
          entityId: String(input.rows.length),
          metadata: JSON.stringify({
            rowCount: input.rows.length,
            passwordProtected: Boolean(input.password),
          }),
        });
        return {
          base64,
          fileName: `سجل-البرقيات-${new Date().toISOString().slice(0, 10)}.xlsx`,
        };
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const telegram = await getTelegramById(input.id);

        if (!telegram) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }

        await assertTelegramOrganizationScope(
          ctx.user,
          telegram,
          "لا تملك صلاحية عرض هذه البرقية"
        );

        const senderOrganization = await getOrganizationByIdIncludingInactive(
          telegram.organizationId
        );

        return {
          ...telegram,
          senderOrganizationName: senderOrganization?.name ?? null,
        };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          subject: z.string().trim().min(2).max(255),
          recipient: z.string().trim().min(2).max(255),
          body: z.string().trim().min(3).max(20000),
          classification: classificationSchema,
          priority: prioritySchema,
          category: categorySchema,
          status: statusSchema,
          attachmentManifest: z.string().max(10000).nullable().optional(),
          gpsLatitude: z.string().max(40).nullable().optional(),
          gpsLongitude: z.string().max(40).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...values } = input;
        const existing = await getTelegramById(id);
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }
        await assertTelegramOrganizationScope(
          ctx.user,
          existing,
          "لا تملك صلاحية تعديل هذه البرقية خارج جهة العمل النشطة"
        );

        if (!canManageTelegramContent(ctx.user, existing.createdAt)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "انتهت مهلة تعديل البرقية (48 ساعة)؛ الصلاحية الدائمة للمالك فقط",
          });
        }

        if (input.status !== existing.status) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "تغيير الحالة يجب أن يتم عبر مسار دورة الحياة المعتمد",
          });
        }

        const beforeState = telegramAuditSnapshot(
          existing as unknown as Record<string, unknown>
        );

        const organizationSettings = existing.organizationId
          ? await getOrganizationSettings(existing.organizationId)
          : undefined;
        const numberSystem = normalizeNumberSystem(
          organizationSettings?.numberSystem
        );
        const updated = await updateTelegram(id, {
          ...values,
          subject: localizeDigits(values.subject, numberSystem),
          recipient: localizeDigits(values.recipient, numberSystem),
          body: localizeDigits(values.body, numberSystem),
          ...(values.attachmentManifest !== undefined
            ? { attachmentManifest: values.attachmentManifest }
            : {}),
          ...(values.gpsLatitude !== undefined
            ? { gpsLatitude: values.gpsLatitude }
            : {}),
          ...(values.gpsLongitude !== undefined
            ? { gpsLongitude: values.gpsLongitude }
            : {}),
        });

        const afterState = telegramAuditSnapshot(
          updated as unknown as Record<string, unknown>
        );
        await recordTelegramVersion({
          telegramId: updated.id,
          changedByUserId: ctx.user.id,
          changeReason: "تعديل محتوى البرقية",
          snapshot: await buildTelegramVersionSnapshot(updated),
        });

        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Administrator",
          action: "telegram.update",
          entityType: "telegram",
          entityId: String(id),
          metadata: JSON.stringify({
            serialNumber: existing.serialNumber,
            createdByUserId: existing.createdByUserId,
          }),
          beforeState: JSON.stringify(beforeState),
          afterState: JSON.stringify(afterState),
        });

        return updated;
      }),

    reissue: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          reason: z.string().trim().min(5).max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const telegram = await getTelegramById(input.id);
        if (!telegram) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }
        await assertTelegramOrganizationScope(
          ctx.user,
          telegram,
          "لا تملك صلاحية إعادة إصدار هذه البرقية"
        );
        if (!canManageTelegramContent(ctx.user, telegram.createdAt)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "انتهت مهلة إعادة إصدار البرقية (48 ساعة)؛ الصلاحية الدائمة للمالك فقط",
          });
        }

        const snapshot = await buildTelegramVersionSnapshot(telegram);
        const letterhead = snapshot.letterhead as {
          logoStorageKey: string | null;
        };
        if (!letterhead.logoStorageKey) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "لا يوجد شعار محفوظ حاليًا لهذه الجهة؛ ارفع الشعار أولًا ثم أعد إصدار البرقية.",
          });
        }
        const versionNumber = await recordTelegramVersion({
          telegramId: telegram.id,
          changedByUserId: ctx.user.id,
          changeReason: `إعادة إصدار البرقية بنفس رقمها الرسمي: ${input.reason}`,
          snapshot: {
            ...snapshot,
            issuance: {
              type: "reissue",
              reason: input.reason,
              officialSerialCode: telegram.serialCode,
            },
          },
        });

        let actionLogRecorded = true;
        try {
          await recordTelegramAction({
            telegramId: telegram.id,
            actorUserId: ctx.user.id,
            action: "telegram.reissue",
            reason: input.reason,
            metadata: {
              versionNumber,
              serialNumber: telegram.serialNumber,
              serialCode: telegram.serialCode,
            },
          });
        } catch (error) {
          actionLogRecorded = false;
          console.error("[Telegram] Reissue action log failed", error);
        }

        let auditLogRecorded = true;
        try {
          await writeAuditLog({
            ...getRequestAuditContext(ctx.req),
            actorUserId: ctx.user.id,
            actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
            action: "telegram.reissue",
            entityType: "telegram",
            entityId: String(telegram.id),
            metadata: JSON.stringify({
              serialNumber: telegram.serialNumber,
              serialCode: telegram.serialCode,
              versionNumber,
              organizationId: telegram.organizationId,
            }),
            reason: input.reason,
            beforeState: JSON.stringify(
              telegramAuditSnapshot(
                telegram as unknown as Record<string, unknown>
              )
            ),
            afterState: JSON.stringify({
              serialNumber: telegram.serialNumber,
              serialCode: telegram.serialCode,
              versionNumber,
              organizationId: telegram.organizationId,
            }),
          });
        } catch (error) {
          auditLogRecorded = false;
          console.error("[Telegram] Reissue audit log failed", error);
        }

        return {
          success: true as const,
          telegramId: telegram.id,
          serialNumber: telegram.serialNumber,
          serialCode: telegram.serialCode,
          versionNumber,
          actionLogRecorded,
          auditLogRecorded,
        };
      }),

    delete: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          reason: z.string().trim().min(3).max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existing = await getTelegramById(input.id);
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }
        await assertTelegramOrganizationScope(
          ctx.user,
          existing,
          "لا تملك صلاحية حذف هذه البرقية خارج جهة العمل النشطة"
        );

        if (!canManageTelegramContent(ctx.user, existing.createdAt)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "انتهت مهلة حذف البرقية (48 ساعة)؛ الصلاحية الدائمة للمالك فقط",
          });
        }

        const beforeState = telegramAuditSnapshot(
          existing as unknown as Record<string, unknown>
        );

        const purged = await purgeTelegramPermanently(existing.id);
        if (!purged) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }

        const failedStorageKeys: string[] = [];
        for (const storageKey of purged.attachmentStorageKeys) {
          try {
            await storageDelete(storageKey);
          } catch (error) {
            failedStorageKeys.push(storageKey);
            console.warn(
              "[Telegram] Attachment object cleanup failed",
              storageKey,
              error
            );
          }
        }

        // The telegram and its history are physically removed; this audit entry
        // stays as the immutable record that the deletion happened.
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Administrator",
          action: "telegram.delete",
          entityType: "telegram",
          entityId: String(purged.telegram.id),
          metadata: JSON.stringify({
            mode: "permanent",
            serialNumber: purged.telegram.serialNumber,
            serialCode: purged.telegram.serialCode,
            subject: existing.subject,
            recipient: existing.recipient,
            statusAtDeletion: existing.status,
            createdByUserId: existing.createdByUserId,
            creatorName: existing.creatorName,
            creatorBadgeId: existing.creatorBadgeId ?? null,
            deletedAttachmentCount: purged.attachmentStorageKeys.length,
            pendingStorageCleanup: failedStorageKeys,
          }),
          reason: input.reason,
          beforeState: JSON.stringify(beforeState),
        });

        return {
          success: true as const,
          id: purged.telegram.id,
          serialCode: purged.telegram.serialCode,
          permanent: true as const,
          deletedAttachmentCount: purged.attachmentStorageKeys.length,
          pendingStorageCleanup: failedStorageKeys.length,
        };
      }),

    route: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          toOrganizationId: z.string().uuid(),
          note: z.string().trim().max(2000).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existing = await getTelegramById(input.id);
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }
        await assertTelegramOrganizationScope(
          ctx.user,
          existing,
          "لا تملك صلاحية إحالة هذه البرقية خارج جهة العمل النشطة"
        );
        const route = await routeTelegram({
          telegramId: input.id,
          toOrganizationId: input.toOrganizationId,
          forwardedByUserId: ctx.user.id,
          note: input.note ?? null,
        });

        const routedTelegram = await getTelegramById(input.id);
        const sourceSettings = await getOrganizationSettings(
          route.fromOrganizationId
        );
        if (sourceSettings) {
          const outgoingSerialNumber =
            route.fromOrganizationId === routedTelegram?.organizationId &&
            routedTelegram.organizationSerialNumber
              ? routedTelegram.organizationSerialNumber
              : await allocateOrganizationSerialNumber(
                  route.fromOrganizationId,
                  "outgoing"
                );
          const dateParts = new Intl.DateTimeFormat("en-CA", {
            timeZone: sourceSettings.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).formatToParts(new Date());
          const dateValues = Object.fromEntries(
            dateParts.map(part => [part.type, part.value])
          );
          await updateRouteOutgoingSerial({
            routeId: route.id,
            serialNumber: outgoingSerialNumber,
            serialCode: `${sourceSettings.serialPrefix}-${dateValues.year}-${dateValues.month}-${dateValues.day}-${String(outgoingSerialNumber).padStart(5, "0")}`,
          });
        }

        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
          action: "telegram.route",
          entityType: "telegram",
          entityId: String(input.id),
          metadata: JSON.stringify({
            routeId: route.id,
            toOrganizationId: route.toOrganizationId,
            approvalStatus: route.approvalStatus,
          }),
        });

        try {
          const telegram = await getTelegramById(input.id);
          const sourceOrganization = await getOrganizationById(
            route.fromOrganizationId
          );
          if (telegram && route.approvalStatus === "not_required") {
            const incomingSerialCode =
              route.routeSerialCode ?? telegram.serialCode;
            await notifyOrganizationUsers({
              organizationId: route.toOrganizationId,
              type: "route.approved",
              title: "برقية واردة",
              body: `وردت برقية جديدة برقم ${incomingSerialCode}.`,
              telegramId: telegram.id,
              routeId: route.id,
            });
            await notifyOrganizationTelegramCreated({
              organizationId: route.toOrganizationId,
              serialCode: incomingSerialCode,
              subject: telegram.subject,
              recipient: telegram.recipient,
              priority: telegram.priority,
              category: telegram.category,
              telegramId: telegram.id,
              direction: "incoming",
            });
          } else if (telegram && sourceOrganization?.parentOrganizationId) {
            const destination = await getOrganizationById(
              route.toOrganizationId
            );
            await notifyOrganizationUsers({
              organizationId: sourceOrganization.parentOrganizationId,
              type: "route.requested",
              title: "طلب إحالة بانتظار اعتماد السلطة الأعلى",
              body: `البرقية ${telegram.serialCode} مطلوبة للإحالة إلى ${destination?.name ?? "جهة مستلمة"}.`,
              telegramId: telegram.id,
              routeId: route.id,
            });
            await notifyOrganizationRouteEvent({
              organizationId: sourceOrganization.parentOrganizationId,
              type: "route.requested",
              title: "طلب إحالة بانتظار الاعتماد",
              body: `البرقية ${telegram.serialCode} تحتاج قرار السلطة الأعلى.`,
              telegramId: telegram.id,
              serialCode: telegram.serialCode,
              routeId: route.id,
            });
          }
        } catch (error) {
          console.warn("[Notification] Route request dispatch failed", error);
        }
        return route;
      }),
    approveRoute: protectedProcedure
      .input(
        z.object({
          routeId: z.number().int().positive(),
          approved: z.boolean(),
          reason: z.string().trim().max(2000).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const membership = await getUserOrganizationMembership(ctx.user.id);
        if (
          !membership ||
          ![
            "system_admin",
            "organization_admin",
            "regional_admin",
            "organization_supervisor",
            "reviewer",
          ].includes(membership.role)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا تملك صلاحية اعتماد إحالات البرقيات",
          });
        }
        if (isPlatformOwner(ctx.user)) {
          const routeContext = await getTelegramRouteById(input.routeId);
          if (!routeContext) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "الإحالة غير موجودة",
            });
          }
          const sourceOrganization = await getOrganizationById(
            routeContext.fromOrganizationId
          );
          await assertOwnerOrganizationScope(
            ctx.user,
            sourceOrganization?.parentOrganizationId ?? null,
            "لا تملك صلاحية اعتماد إحالة خارج جهة العمل النشطة"
          );
        }
        const route = await approveTelegramRoute({
          routeId: input.routeId,
          approverUserId: ctx.user.id,
          approved: input.approved,
          reason: input.reason,
        });
        await resolveRouteNotifications(route.id);
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
          action: input.approved
            ? "telegram.route.approve"
            : "telegram.route.reject",
          entityType: "telegram_route",
          entityId: String(route.id),
          metadata: JSON.stringify({
            telegramId: route.telegramId,
            toOrganizationId: route.toOrganizationId,
            reason: input.reason ?? null,
          }),
        });
        const routedTelegram = await getTelegramById(route.telegramId);
        if (routedTelegram) {
          if (route.approvalStatus === "approved") {
            const destinationSettings = await getOrganizationSettings(
              route.toOrganizationId
            );
            if (destinationSettings) {
              const incomingSerialNumber =
                await allocateOrganizationSerialNumber(
                  route.toOrganizationId,
                  "incoming"
                );
              const dateParts = new Intl.DateTimeFormat("en-CA", {
                timeZone: destinationSettings.timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).formatToParts(new Date());
              const dateValues = Object.fromEntries(
                dateParts.map(part => [part.type, part.value])
              );
              await updateRouteIncomingSerial({
                routeId: route.id,
                serialNumber: incomingSerialNumber,
                serialCode: `${destinationSettings.incomingSerialPrefix}-${dateValues.year}-${dateValues.month}-${dateValues.day}-${String(incomingSerialNumber).padStart(5, "0")}`,
              });
            }
            await notifyUser({
              userId: route.forwardedByUserId,
              organizationId: route.fromOrganizationId,
              type: "route.approved",
              title: "تم اعتماد إحالة البرقية",
              body: `اعتمدت السلطة الأعلى إحالة ${routedTelegram.serialCode}. رقم الإحالة الجديد: ${route.routeSerialCode ?? "غير متاح"}.`,
              telegramId: routedTelegram.id,
              routeId: route.id,
            });
            await notifyOrganizationUsers({
              organizationId: route.toOrganizationId,
              type: "route.approved",
              title: "برقية واردة معتمدة",
              body: `وردت البرقية ${routedTelegram.serialCode} برقم إحالة ${route.routeSerialCode ?? "جديد"} باسم السلطة المعتمدة.`,
              telegramId: routedTelegram.id,
              routeId: route.id,
            });
            try {
              await notifyOrganizationRouteEvent({
                organizationId: route.toOrganizationId,
                type: "route.approved",
                title: "برقية واردة معتمدة",
                body: `وردت البرقية برقم إحالة ${route.routeSerialCode ?? "جديد"}.`,
                telegramId: routedTelegram.id,
                serialCode: routedTelegram.serialCode,
                routeId: route.id,
                routeSerialCode: route.routeSerialCode,
              });
              await notifyOrganizationTelegramCreated({
                organizationId: route.toOrganizationId,
                serialCode: route.routeSerialCode ?? routedTelegram.serialCode,
                subject: routedTelegram.subject,
                recipient: routedTelegram.recipient,
                priority: routedTelegram.priority,
                category: routedTelegram.category,
                telegramId: routedTelegram.id,
                direction: "incoming",
              });
            } catch (error) {
              console.warn(
                "[Notification] Approved route push dispatch failed",
                error
              );
            }
          } else {
            await notifyUser({
              userId: route.forwardedByUserId,
              organizationId: route.fromOrganizationId,
              type: "route.rejected",
              title: "تم رفض إحالة البرقية",
              body: `رُفضت إحالة ${routedTelegram.serialCode}: ${route.approvalReason ?? input.reason ?? "دون سبب"}`,
              telegramId: routedTelegram.id,
              routeId: route.id,
            });
            try {
              await notifyOrganizationRouteEvent({
                organizationId: route.fromOrganizationId,
                type: "route.rejected",
                title: "تم رفض إحالة البرقية",
                body: `رُفضت إحالة ${routedTelegram.serialCode}.`,
                telegramId: routedTelegram.id,
                serialCode: routedTelegram.serialCode,
                routeId: route.id,
              });
            } catch (error) {
              console.warn(
                "[Notification] Rejected route push dispatch failed",
                error
              );
            }
          }
        }
        return route;
      }),
    receiveRoute: protectedProcedure
      .input(z.object({ routeId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (isPlatformOwner(ctx.user)) {
          const routeContext = await getTelegramRouteById(input.routeId);
          if (!routeContext) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "الإحالة غير موجودة",
            });
          }
          await assertOwnerOrganizationScope(
            ctx.user,
            routeContext.toOrganizationId,
            "لا تملك صلاحية استلام إحالة خارج جهة العمل النشطة"
          );
        }
        const route = await receiveTelegramRoute({
          routeId: input.routeId,
          receiverUserId: ctx.user.id,
        });
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
          action: "telegram.route.receive",
          entityType: "telegram_route",
          entityId: String(route.id),
          metadata: JSON.stringify({ telegramId: route.telegramId }),
        });
        return route;
      }),
    decideRouteAsReceiver: protectedProcedure
      .input(
        z.object({
          routeId: z.number().int().positive(),
          accepted: z.boolean(),
          reason: z.string().trim().max(2000).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!input.accepted && !input.reason?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "سبب رفض الاستلام مطلوب",
          });
        }
        if (isPlatformOwner(ctx.user)) {
          const routeContext = await getTelegramRouteById(input.routeId);
          if (!routeContext) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "الإحالة غير موجودة",
            });
          }
          await assertOwnerOrganizationScope(
            ctx.user,
            routeContext.toOrganizationId,
            "لا تملك صلاحية اتخاذ قرار استلام خارج جهة العمل النشطة"
          );
        }
        const route = await decideTelegramRouteAsReceiver({
          routeId: input.routeId,
          receiverUserId: ctx.user.id,
          accepted: input.accepted,
          reason: input.reason,
        });
        await resolveRouteNotifications(route.id);
        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
          action: input.accepted
            ? "telegram.route.receiver_accept"
            : "telegram.route.receiver_reject",
          entityType: "telegram_route",
          entityId: String(route.id),
          metadata: JSON.stringify({
            telegramId: route.telegramId,
            reason: input.reason ?? null,
          }),
        });
        const decidedTelegram = await getTelegramById(route.telegramId);
        if (decidedTelegram) {
          await notifyUser({
            userId: route.forwardedByUserId,
            organizationId: route.fromOrganizationId,
            type: input.accepted
              ? "route.receiver_accepted"
              : "route.receiver_rejected",
            title: input.accepted
              ? "أكدت الجهة المستقبلة استلام البرقية"
              : "رفضت الجهة المستقبلة استلام البرقية",
            body: input.accepted
              ? `أكدت الجهة المستقبلة استلام ${decidedTelegram.serialCode}.`
              : `رُفض استلام ${decidedTelegram.serialCode}: ${input.reason}`,
            telegramId: decidedTelegram.id,
            routeId: route.id,
          });
        }
        return route;
      }),

    transition: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          toStatus: statusSchema,
          reason: z.string().trim().max(2000).nullable().optional(),
          expectedRevision: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existing = await getTelegramById(input.id);
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }
        await assertTelegramOrganizationScope(
          ctx.user,
          existing,
          "لا تملك صلاحية تغيير حالة هذه البرقية خارج جهة العمل النشطة"
        );

        try {
          const transitioned = await transitionTelegram({
            telegramId: input.id,
            actorUserId: ctx.user.id,
            toStatus: input.toStatus,
            reason: input.reason ?? null,
            expectedRevision: input.expectedRevision,
            metadata: { serialCode: existing.serialCode },
          });
          await writeAuditLog({
            ...getRequestAuditContext(ctx.req),
            actorUserId: ctx.user.id,
            actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
            action: "telegram.status.transition",
            entityType: "telegram",
            entityId: String(input.id),
            metadata: JSON.stringify({
              fromStatus: existing.status,
              toStatus: input.toStatus,
              reason: input.reason ?? null,
            }),
          });
          return transitioned;
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.toLowerCase().includes("conflict")
          ) {
            const current = await getTelegramById(input.id);
            throw new TRPCError({
              code: "CONFLICT",
              message: `تعارض مزامنة: تغيّرت البرقية على الخادم. الإصدار الحالي هو ${current?.revision ?? "الأحدث"}. أعد تحميلها ثم أعد تنفيذ الإجراء.`,
              cause: error,
            });
          }
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              error instanceof Error
                ? error.message
                : "تعذر تغيير حالة البرقية",
            cause: error,
          });
        }
      }),

    create: protectedProcedure
      .input(
        z.object({
          subject: z.string().trim().min(2).max(255),
          recipient: z.string().trim().min(2).max(255),
          recipientOrganizationId: z.string().uuid().optional(),
          broadcastToDescendants: z.boolean().optional(),
          body: z.string().trim().min(3).max(20000),
          classification: classificationSchema,
          priority: prioritySchema,
          category: categorySchema,
          idempotencyKey: z.string().trim().min(16).max(120).optional(),
          attachmentManifest: z.string().max(10000).optional(),
          gpsLatitude: z.string().max(40).optional(),
          gpsLongitude: z.string().max(40).optional(),
          requestedOrganizationSerialNumber: z
            .number()
            .int()
            .min(1)
            .max(999999999)
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.idempotencyKey) {
          const existing = await getTelegramByIdempotencyKey(
            input.idempotencyKey
          );
          if (existing) {
            if (input.broadcastToDescendants && existing.status === "draft") {
              let hasExistingRoute: boolean;
              try {
                hasExistingRoute = await hasTelegramRoute(existing.id);
              } catch (error) {
                throw new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message:
                    "تعذر التحقق من حالة الإرسال الجماعي السابقة؛ راجع البرقية قبل إعادة المحاولة.",
                  cause: error,
                });
              }

              if (!hasExistingRoute) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: [
                    "مفتاح التكرار مرتبط بالبرقية المسودة",
                    existing.serialCode ?? String(existing.id),
                    "ولم يُعثر على مسار إرسال. لم تُعتبر المحاولة السابقة ناجحة؛",
                    "راجع المسودة وأعد المحاولة بمفتاح جديد.",
                  ].join(" "),
                });
              }
            }

            return existing;
          }
        }

        const organizationId = await getActiveUserOrganizationId(ctx.user);
        const numbering = await getOrCreateSettings(ctx.user.id);
        const numberSystem = normalizeNumberSystem(numbering.numberSystem);
        let organizationSerialNumber: number;
        if (input.requestedOrganizationSerialNumber === undefined) {
          organizationSerialNumber = await allocateOrganizationSerialNumber(
            organizationId,
            "outgoing"
          );
        } else {
          try {
            organizationSerialNumber = await reserveOrganizationSerialNumber(
              organizationId,
              input.requestedOrganizationSerialNumber
            );
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.includes("رقم البرقية مستخدم بالفعل")
            ) {
              throw new TRPCError({
                code: "CONFLICT",
                message:
                  "رقم البرقية المحدد مستخدم بالفعل لهذه الجهة. اختر رقمًا آخر.",
                cause: error,
              });
            }
            throw error;
          }
        }
        const serialNumber = await allocateSerialNumber();
        const dateParts = new Intl.DateTimeFormat("en-CA", {
          timeZone: numbering.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(new Date());
        const dateValues = Object.fromEntries(
          dateParts.map(part => [part.type, part.value])
        );
        const dateCode = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
        const serialCode = `${numbering.serialPrefix}-${dateCode}-${String(serialNumber).padStart(5, "0")}`;
        const organizationSerialCode = `${numbering.serialPrefix}-${dateCode}-${String(organizationSerialNumber).padStart(5, "0")}`;
        const broadcastTargets = input.broadcastToDescendants
          ? (await listOrganizationDescendants(ctx.user.id)).filter(
              target => target.parentOrganizationId === organizationId
            )
          : [];
        if (input.broadcastToDescendants && broadcastTargets.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "لا توجد جهات تابعة مباشرة لإرسال البرقية إليها",
          });
        }
        const selectedDestination = input.recipientOrganizationId
          ? (await listRoutingTargets(ctx.user.id)).find(
              target => target.id === input.recipientOrganizationId
            )
          : null;
        if (input.recipientOrganizationId && !selectedDestination) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "الجهة المختارة غير متاحة ضمن مسار العمل المسموح",
          });
        }
        const configuredDestination = input.broadcastToDescendants
          ? (broadcastTargets[0] ?? null)
          : (selectedDestination ??
            (await getConfiguredTelegramDestination(ctx.user.id)));
        const creatorName = ctx.user.name ?? ctx.user.email ?? "شرطي مسجل";
        const creatorIpHeader = ctx.req.headers["x-forwarded-for"];
        const creatorIp =
          typeof creatorIpHeader === "string"
            ? creatorIpHeader.split(",")[0].trim()
            : null;
        const {
          recipientOrganizationId: _recipientOrganizationId,
          broadcastToDescendants: _broadcastToDescendants,
          requestedOrganizationSerialNumber: _requestedOrganizationSerialNumber,
          ...telegramInput
        } = input;
        telegramInput.subject = localizeDigits(
          telegramInput.subject,
          numberSystem
        );
        telegramInput.recipient = localizeDigits(
          telegramInput.recipient,
          numberSystem
        );
        telegramInput.body = localizeDigits(telegramInput.body, numberSystem);

        let telegram: Awaited<ReturnType<typeof createTelegram>>;
        try {
          telegram = await createTelegram({
            ...telegramInput,
            serialNumber,
            serialCode,
            organizationSerialNumber,
            organizationSerialCode,
            idempotencyKey: input.idempotencyKey ?? null,
            status: "draft",
            verificationToken: randomUUID(),
            createdByUserId: ctx.user.id,
            organizationId,
            currentOrganizationId: organizationId,
            creatorName,
            creatorEmail: ctx.user.email ?? null,
            creatorBadgeId: ctx.user.badgeNumber ?? null,
            creatorIp,
            creatorFingerprint: ctx.user.authUserId,
          });
        } catch (error) {
          if (input.idempotencyKey) {
            const existing = await getTelegramByIdempotencyKey(
              input.idempotencyKey
            );
            if (existing) return existing;
          }
          throw error;
        }

        // A telegram has one active destination, so a broadcast is represented
        // by one independently routed copy for each direct child organization.
        // Track the primary telegram before routing so failures there are visible too.
        const broadcastProgress: Array<{
          telegramId: number;
          organizationId: string;
          status: "created" | "routed";
        }> =
          configuredDestination && broadcastTargets.length > 0
            ? [
                {
                  telegramId: telegram.id,
                  organizationId: configuredDestination.id,
                  status: "created",
                },
              ]
            : [];

        const reportBroadcastFailure = async (
          error: unknown
        ): Promise<never> => {
          const failure =
            error instanceof Error ? error.message : String(error);
          let auditRecorded = false;

          try {
            await recordTelegramAction({
              telegramId: telegram.id,
              actorUserId: ctx.user.id,
              action: "telegram.broadcast.atomic_failure",
              fromStatus: telegram.status,
              toStatus: telegram.status,
              reason:
                "فشل الإرسال الجماعي؛ تراجعت مسارات الإرسال ونسخه داخل معاملة واحدة، وبقيت البرقية الأساسية كمسودة.",
              metadata: {
                failure,
                rollbackGuaranteed: true,
                targets: broadcastTargets.map(target => ({
                  organizationId: target.id,
                  name: target.name,
                })),
                progress: broadcastProgress,
              },
            });
            auditRecorded = true;
          } catch (auditError) {
            console.error(
              "[Telegram broadcast] Failed to persist partial-failure audit",
              auditError
            );
          }

          const auditMessage = auditRecorded
            ? "تراجعت مسارات الإرسال ونسخه ذريًا، وسُجّل الفشل للمراجعة."
            : "تراجعت مسارات الإرسال ونسخه ذريًا، لكن تعذّر حفظ سجل التدقيق؛ يلزم مراجعة السجلات يدويًا.";

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `تعذر إكمال الإرسال الجماعي للبرقية ${telegram.serialCode}. ${auditMessage} معرّف البرقية الأساسية: ${telegram.id}.`,
            cause: error,
          });
        };

        if (broadcastTargets.length > 0) {
          try {
            const copyPayloads: AtomicBroadcastCopyInput[] = [];

            for (const target of broadcastTargets.slice(1)) {
              const targetOrganizationSerialNumber =
                await allocateOrganizationSerialNumber(
                  organizationId,
                  "outgoing"
                );
              const targetSerialNumber = await allocateSerialNumber();
              const targetSerialCode = `${numbering.serialPrefix}-${dateCode}-${String(targetSerialNumber).padStart(5, "0")}`;
              const targetOrganizationSerialCode = `${numbering.serialPrefix}-${dateCode}-${String(targetOrganizationSerialNumber).padStart(5, "0")}`;

              copyPayloads.push({
                targetOrganizationId: target.id,
                serialNumber: targetSerialNumber,
                serialCode: targetSerialCode,
                organizationSerialNumber: targetOrganizationSerialNumber,
                organizationSerialCode: targetOrganizationSerialCode,
                verificationToken: randomUUID(),
                creatorName,
                creatorEmail: ctx.user.email ?? null,
                creatorBadgeId: ctx.user.badgeNumber ?? null,
                creatorIp,
                creatorFingerprint: ctx.user.authUserId,
                subject: telegramInput.subject,
                recipient: telegramInput.recipient,
                body: telegramInput.body,
                classification: telegramInput.classification,
                priority: telegramInput.priority,
                category: telegramInput.category,
                attachmentManifest: telegramInput.attachmentManifest ?? null,
                gpsLatitude: telegramInput.gpsLatitude ?? null,
                gpsLongitude: telegramInput.gpsLongitude ?? null,
              });
            }

            const broadcastResult = await routeTelegramBroadcastAtomic({
              telegramId: telegram.id,
              toOrganizationId: broadcastTargets[0].id,
              forwardedByUserId: ctx.user.id,
              note: "إرسال جماعي إلى الجهات التابعة مباشرة",
              copies: copyPayloads,
            });

            broadcastProgress[0].status = "routed";
            broadcastProgress.push(
              ...broadcastResult.copies.map(copy => ({
                telegramId: copy.telegramId,
                organizationId: copy.targetOrganizationId,
                status: "routed" as const,
              }))
            );

            try {
              const sourceOrganization =
                await getOrganizationById(organizationId);
              if (sourceOrganization?.parentOrganizationId) {
                await notifyOrganizationUsers({
                  organizationId: sourceOrganization.parentOrganizationId,
                  type: "route.requested",
                  title: "طلب إحالة بانتظار اعتماد السلطة الأعلى",
                  body: `البرقية ${telegram.serialCode} تحتاج موافقة قبل انتقالها إلى الجهة المستلمة.`,
                  telegramId: telegram.id,
                  routeId: broadcastResult.primaryRoute.id,
                });
              }
            } catch (error) {
              console.warn(
                "[Notification] Create route notification failed",
                error
              );
            }

            try {
              const routedTelegram = await getTelegramById(telegram.id);
              if (routedTelegram) telegram = routedTelegram;
            } catch (error) {
              // Routing and all copies have already committed atomically. A failed
              // refresh must not misreport a successful broadcast as a partial failure.
              console.warn(
                "[Telegram broadcast] Primary telegram refresh failed after commit",
                error
              );
            }
          } catch (error) {
            await reportBroadcastFailure(error);
          }
        } else if (configuredDestination) {
          const route = await routeTelegram({
            telegramId: telegram.id,
            toOrganizationId: configuredDestination.id,
            forwardedByUserId: ctx.user.id,
            allowDraft: true,
            note: input.recipientOrganizationId
              ? "إحالة إلى الجهة المختارة عند إنشاء البرقية"
              : "إحالة تلقائية إلى الجهة المحددة للقسم أو المخفر",
          });
          try {
            const sourceOrganization =
              await getOrganizationById(organizationId);
            if (route.approvalStatus === "not_required") {
              const incomingSerialCode =
                route.routeSerialCode ?? telegram.serialCode;
              await notifyOrganizationUsers({
                organizationId: route.toOrganizationId,
                type: "route.approved",
                title: "برقية واردة",
                body: `وردت برقية جديدة برقم ${incomingSerialCode}.`,
                telegramId: telegram.id,
                routeId: route.id,
              });
              await notifyOrganizationTelegramCreated({
                organizationId: route.toOrganizationId,
                serialCode: incomingSerialCode,
                subject: telegram.subject,
                recipient: telegram.recipient,
                priority: telegram.priority,
                category: telegram.category,
                telegramId: telegram.id,
                direction: "incoming",
              });
            } else if (sourceOrganization?.parentOrganizationId) {
              await notifyOrganizationUsers({
                organizationId: sourceOrganization.parentOrganizationId,
                type: "route.requested",
                title: "طلب إحالة بانتظار اعتماد السلطة الأعلى",
                body: `البرقية ${telegram.serialCode} تحتاج موافقة قبل انتقالها إلى الجهة المستلمة.`,
                telegramId: telegram.id,
                routeId: route.id,
              });
            }
          } catch (error) {
            console.warn(
              "[Notification] Create route notification failed",
              error
            );
          }
          const routedTelegram = await getTelegramById(telegram.id);
          if (routedTelegram) telegram = routedTelegram;
        }

        await writeAuditLog({
          ...getRequestAuditContext(ctx.req),
          actorUserId: ctx.user.id,
          actorName: creatorName,
          action: "telegram.create",
          entityType: "telegram",
          entityId: String(telegram.id),
          metadata: JSON.stringify({
            serialNumber,
            classification: input.classification,
          }),
          afterState: JSON.stringify(
            telegramAuditSnapshot(
              telegram as unknown as Record<string, unknown>
            )
          ),
        });

        await recordTelegramAction({
          telegramId: telegram.id,
          actorUserId: ctx.user.id,
          action: "telegram.create",
          toStatus: telegram.status,
          metadata: { serialNumber: telegram.serialNumber },
        });
        await recordTelegramVersion({
          telegramId: telegram.id,
          changedByUserId: ctx.user.id,
          changeReason: "الإصدار الأول عند إنشاء البرقية",
          snapshot: await buildTelegramVersionSnapshot(telegram),
        });

        try {
          await notifyOrganizationTelegramCreated({
            organizationId: telegram.currentOrganizationId,
            serialCode: telegram.serialCode,
            subject: telegram.subject,
            recipient: telegram.recipient,
            priority: telegram.priority,
            category: telegram.category,
            telegramId: telegram.id,
            direction: "outgoing",
          });
        } catch (error) {
          console.warn("[Notification] Telegram push dispatch failed", error);
        }

        return telegram;
      }),
    nextOutgoingSerial: protectedProcedure.query(async ({ ctx }) => {
      const organizationId = await getActiveUserOrganizationId(ctx.user);
      return {
        number: await getSuggestedOrganizationSerialNumber(organizationId),
      };
    }),
    importWorkbookPreview: organizationAdminProcedure
      .input(
        z.object({
          base64: z.string().min(1).max(22_000_000),
          password: z.string().max(128).optional(),
        })
      )
      .mutation(async ({ input }) =>
        parseTelegramWorkbookBase64(input.base64, input.password)
      ),
    resolveImportReferences: protectedProcedure
      .input(z.object({ notes: z.string().max(4000) }))
      .query(async ({ ctx, input }) => {
        const organizationId = await getActiveUserOrganizationId(ctx.user);
        const references = Array.from(
          input.notes.matchAll(/ب\s*([وص])\s*([0-9٠-٩۰-۹]+)/g)
        ).slice(0, 20);

        const normalizeDigits = (value: string) =>
          value
            .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
            .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

        return (
          await Promise.all(
            references.map(async match => {
              const marker = match[1] ?? "";
              const rawSerial = match[2] ?? "";
              if (!rawSerial) return null;
              const direction = marker === "و" ? "incoming" : "outgoing";
              const serial = normalizeDigits(rawSerial);
              const telegram = await findTelegramByOfficialSerial({
                organizationId,
                serial,
                direction,
              });
              if (!telegram) return null;
              return {
                referenceText: match[0],
                serial,
                direction,
                verificationToken: telegram.verificationToken,
              };
            })
          )
        ).filter(
          (reference): reference is NonNullable<typeof reference> =>
            reference !== null
        );
      }),

    importPreview: organizationAdminProcedure
      .input(z.object({ rows: z.array(excelImportRowSchema).min(1).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        const organizationId = await getActiveUserOrganizationId(ctx.user);
        const existing = await listAllTelegramsForImport(
          ctx.user.id,
          organizationId
        );
        const keys = getExistingTelegramSerialKeys(existing);
        return input.rows.map((row, index) => {
          const value = row.originalSerial?.trim() ?? "";
          const direction = getImportDirection(row.sheetName);
          const key = value ? makeImportSerialKey(direction, value) : "";
          const duplicate = Boolean(value) && keys.has(key);
          if (value) keys.add(key);
          return { index, duplicate };
        });
      }),

    importRows: organizationAdminProcedure
      .input(z.object({ rows: z.array(excelImportRowSchema).min(1).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        const organizationId = await getActiveUserOrganizationId(ctx.user);
        const settings = await getOrCreateSettings(ctx.user.id);
        const creatorName = ctx.user.name ?? ctx.user.email ?? "شرطي مسجل";
        const existingTelegrams = await listAllTelegramsForImport(
          ctx.user.id,
          organizationId
        );
        const existingSerialKeys =
          getExistingTelegramSerialKeys(existingTelegrams);
        let created = 0;
        let skipped = 0;
        const errors: Array<{ row: number; message: string }> = [];

        for (let index = 0; index < input.rows.length; index += 1) {
          const row = input.rows[index];
          const sourceKey = JSON.stringify({
            organizationId,
            sheetName: row.sheetName,
            originalSerial: row.originalSerial ?? "",
            time: row.time ?? "",
            date: row.date ?? "",
            body: row.body,
            signature: row.signature ?? "",
            notes: row.notes ?? "",
          });
          const idempotencyKey = `excel-import:${createHash("sha256")
            .update(sourceKey)
            .digest("hex")}`;
          try {
            const originalSerial = row.originalSerial?.trim() ?? "";
            const direction = getImportDirection(row.sheetName);
            const existing = await getTelegramByIdempotencyKey(idempotencyKey);
            if (existing) {
              skipped += 1;
              continue;
            }
            if (
              originalSerial &&
              existingSerialKeys.has(
                makeImportSerialKey(direction, originalSerial)
              )
            ) {
              errors.push({
                row: index + 2,
                message: `رقم البرقية الأصلي "${originalSerial}" موجود مسبقًا. لم يُنشأ رقم بديل ولم تُستورد هذه البرقية.`,
              });
              continue;
            }
            const importedCreatedAt = parseImportedDate(
              row.date,
              row.time,
              settings.timezone
            );
            if (row.date?.trim() && !importedCreatedAt) {
              throw new Error(
                `تعذر قراءة تاريخ البرقية "${row.date}" في صف Excel. صحح تنسيق التاريخ ثم أعد الاستيراد؛ لم يُستبدل التاريخ بتاريخ اليوم.`
              );
            }
            const serialNumber = await allocateSerialNumber();
            const serialDate = importedCreatedAt ?? new Date();
            const dateParts = new Intl.DateTimeFormat("en-CA", {
              timeZone: settings.timezone,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).formatToParts(serialDate);
            const dateValues = Object.fromEntries(
              dateParts.map(part => [part.type, part.value])
            );
            const dateCode = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
            const serialCode = `${settings.serialPrefix}-${dateCode}-${String(serialNumber).padStart(5, "0")}`;
            const importedBody = [
              row.body,
              row.signature ? `\nتوقيع السجل الأصلي: ${row.signature}` : "",
            ]
              .filter(Boolean)
              .join("\n");
            const subject =
              row.sender?.trim() ||
              `سجل مستورد من Excel رقم ${row.originalSerial || index + 1}`;
            const recipient =
              row.recipient?.trim() || "غير محدد في السجل الأصلي";
            const telegram = await createTelegram({
              serialNumber,
              serialCode,
              idempotencyKey,
              verificationToken: randomUUID(),
              originalSerial: originalSerial || null,
              importNotes: row.notes?.trim() || null,
              importDirection: direction,
              telegramDate: importedCreatedAt ?? null,
              createdByUserId: ctx.user.id,
              organizationId,
              currentOrganizationId: organizationId,
              creatorName,
              creatorEmail: ctx.user.email ?? null,
              creatorBadgeId: ctx.user.badgeNumber ?? null,
              creatorIp: null,
              creatorFingerprint: ctx.user.authUserId,
              subject: localizeDigits(subject, settings.numberSystem),
              recipient: localizeDigits(recipient, settings.numberSystem),
              body: localizeDigits(importedBody, settings.numberSystem),
              classification: "normal",
              priority: "normal",
              category: "administrative",
              status: "draft",
              workflowReason: `استيراد Excel من ورقة ${row.sheetName}، الرقم الأصلي ${
                row.originalSerial || "غير محدد"
              }${row.date ? `، التاريخ الأصلي ${row.date}` : ""}${
                row.time ? `، الوقت الأصلي ${row.time}` : ""
              }`,
            });
            await writeAuditLog({
              ...getRequestAuditContext(ctx.req),
              actorUserId: ctx.user.id,
              actorName: creatorName,
              action: "telegram.import.excel",
              entityType: "telegram",
              entityId: String(telegram.id),
              metadata: JSON.stringify({
                sheetName: row.sheetName,
                originalSerial: row.originalSerial ?? null,
                originalDate: row.date ?? null,
                originalTime: row.time ?? null,
              }),
            });
            await recordTelegramAction({
              telegramId: telegram.id,
              actorUserId: ctx.user.id,
              action: "telegram.import.excel",
              toStatus: telegram.status,
              metadata: {
                sheetName: row.sheetName,
                originalSerial: row.originalSerial ?? null,
                originalDate: row.date ?? null,
              },
            });
            await recordTelegramVersion({
              telegramId: telegram.id,
              changedByUserId: ctx.user.id,
              changeReason: "استيراد السجل من ملف Excel",
              snapshot: await buildTelegramVersionSnapshot(telegram),
            });
            created += 1;
            existingSerialKeys.add(
              makeImportSerialKey(direction, telegram.serialCode)
            );
            if (telegram.organizationSerialCode) {
              existingSerialKeys.add(
                makeImportSerialKey(direction, telegram.organizationSerialCode)
              );
            }
            if (originalSerial) {
              existingSerialKeys.add(
                makeImportSerialKey(direction, originalSerial)
              );
            }
          } catch (error) {
            errors.push({
              row: index + 2,
              message:
                error instanceof Error ? error.message : "تعذر استيراد الصف",
            });
          }
        }

        return { created, skipped, errors: errors.slice(0, 25) };
      }),
  }),
});

export type AppRouter = typeof appRouter;
