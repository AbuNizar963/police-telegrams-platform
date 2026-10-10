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
import { ENV } from "./_core/env";
import { isPlatformOwner, isPlatformOwnerUserId } from "./ownerAccess";
import { z } from "zod";
import { localizeDigits, normalizeNumberSystem } from "@shared/numberSystem";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  organizationAdminProcedure,
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
  getOrganizationSettings,
  getTelegramById,
  getTelegramAttachmentById,
  getTelegramByIdempotencyKey,
  getTelegramReport,
  listTelegramAttachments,
  listTelegrams,
  purgeTelegramPermanently,
  recordTelegramAction,
  recordTelegramVersion,
  transitionTelegram,
  updateDepartmentSettings,
  upsertOrganizationSettingsForOrganization,
  updateRouteIncomingSerial,
  updateRouteOutgoingSerial,
  writeAuditLog,
  createLocalOwnerUser,
  getUserByUsername,
  getUserOrganizationId,
  deletePushSubscription,
  listUserNotifications,
  markNotificationRead,
  notifyOrganizationUsers,
  notifyUser,
  upsertPushSubscription,
} from "./db";
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
  StorageAccessDeniedError,
  storageCreateSignedUrl,
  storageDelete,
  storageGetSignedUrl,
  storagePut,
  storagePutDepartmentLogo,
} from "./storage";
import {
  getWebPushPublicKey,
  notifyOrganizationRouteEvent,
  notifyOrganizationTelegramCreated,
} from "./_core/notification";

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
    "dd MMM yyyy HH:mm",
  ]),
  numberSystem: z.enum(["latin", "arabic"]),
  logoUrl: z.string().url().max(2000).nullable(),
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

function canViewAllTelegrams(user: TelegramScopeUser): boolean {
  return user.role === "admin" && !isPlatformOwner(user);
}

async function assertTelegramOrganizationScope(
  user: TelegramScopeUser,
  telegram: {
    organizationId: string;
    currentOrganizationId: string | null;
  },
  message: string
): Promise<void> {
  if (canViewAllTelegrams(user)) return;

  const organizationId = await getUserOrganizationId(user.id);
  if (
    telegram.organizationId !== organizationId &&
    telegram.currentOrganizationId !== organizationId
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

async function assertOwnerOrganizationScope(
  user: TelegramScopeUser,
  organizationId: string | null,
  message: string
): Promise<void> {
  if (!isPlatformOwner(user)) return;

  const activeOrganizationId = await getUserOrganizationId(user.id);
  if (organizationId !== activeOrganizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

function parseImportedDate(value?: string, time?: string): Date | undefined {
  const normalized = (value ?? "")
    .trim()
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[.]/g, "/");
  const match = normalized.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/);
  if (!match) return undefined;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = Number(match[3]);
  const year = first > 31 ? first : third;
  const month = first > 31 ? second : second;
  const day = first > 31 ? third : first;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  const timeMatch = (time ?? "").trim().match(/^(\d{1,2})(?::(\d{2}))?/);
  if (timeMatch)
    date.setUTCHours(Number(timeMatch[1]), Number(timeMatch[2] ?? 0));
  return date;
}

export const appRouter = router({
  system: systemRouter,
  profile: profileRouter,
  userManagement: userManagementRouter,

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

    all: adminProcedure.query(() => listAllOrganizations()),
    accounts: adminProcedure
      .input(z.object({ organizationId: z.string().uuid() }))
      .query(({ input }) =>
        listOrganizationAccountSummaries(input.organizationId)
      ),
    allAccounts: adminProcedure.query(() => listOrganizationAccountSummaries()),
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
            dateFormat: "dd/MM/yyyy HH:mm:ss",
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
              numberSystem: input.numberSystem,
              logoUrl: input.logoUrl,
              updatedByUserId: ctx.user.id,
            }
          );

          await writeAuditLog({
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

    assignMember: organizationAdminProcedure
      .input(
        z.object({
          organizationId: z.string().uuid(),
          userId: z.number().int().positive(),
          role: z.enum([
            "system_admin",
            "organization_admin",
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
        if (
          ctx.user.role !== "admin" &&
          ctx.organizationMembership.organizationId !== input.organizationId
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا يمكن تعيين مستخدم خارج الجهة التي تديرها",
          });
        }

        return addOrganizationMembership(input);
      }),
  }),

  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      const canViewAll = canViewAllTelegrams(ctx.user);
      const organizationId = await getUserOrganizationId(ctx.user.id);

      return getDashboardStats(ctx.user.id, canViewAll, organizationId);
    }),
  }),

  notifications: router({
    inbox: protectedProcedure.query(async ({ ctx }) => {
      const organizationId = isPlatformOwner(ctx.user)
        ? await getUserOrganizationId(ctx.user.id)
        : undefined;
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
        const organizationId = await getUserOrganizationId(ctx.user.id);
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
          fileName: z.string().trim().min(1).max(180),
          contentType: z.enum(["image/jpeg", "image/png"]),
          base64: z.string().min(1).max(7_000_000),
        })
      )
      .mutation(async ({ input }) => {
        const bytes = Buffer.from(input.base64, "base64");
        if (bytes.byteLength > 5 * 1024 * 1024) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "حجم الشعار يتجاوز 5 ميغابايت",
          });
        }

        return storagePutDepartmentLogo(
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
            .default("dd/MM/yyyy HH:mm:ss"),
          numberSystem: z.enum(["latin", "arabic"]).default("latin"),
          logoUrl: z.string().url().max(2000).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dbSettings = await getOrCreateSettings(ctx.user.id);
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
          numberSystem: input.numberSystem,
          logoUrl: input.logoUrl ?? null,
          updatedByUserId: ctx.user.id,
        });

        await writeAuditLog({
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

  telegrams: router({
    uploadAttachment: protectedProcedure
      .input(
        z.object({
          telegramId: z.number().int().positive(),
          fileName: z.string().trim().min(1).max(180),
          contentType: z.enum([
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
            "audio/mpeg",
            "audio/wav",
            "audio/webm",
          ]),
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

        const uploaded = await storagePut(
          `telegrams/${ctx.user.id}/${input.fileName}`,
          bytes,
          input.contentType
        );

        try {
          await createTelegramAttachment({
            telegramId: input.telegramId,
            storageKey: uploaded.key,
            originalName: input.fileName,
            mimeType: input.contentType,
            sizeBytes: bytes.byteLength,
            sha256: createHash("sha256").update(bytes).digest("hex"),
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
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
          action: "attachment.upload",
          entityType: "telegram_attachment",
          entityId: String(input.telegramId),
          metadata: JSON.stringify({
            fileName: input.fileName,
            contentType: input.contentType,
            size: bytes.byteLength,
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
        const url = await storageCreateSignedUrl(
          attachment.storageKey,
          10 * 60
        );
        await writeAuditLog({
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
        const organizationId = canViewAll
          ? null
          : await getUserOrganizationId(ctx.user.id);
        const descendants =
          !owner && input?.organizationScope
            ? await listOrganizationDescendants(ctx.user.id)
            : [];
        const organizationScopeIds =
          !owner && input?.organizationScope
            ? input.organizationScope === "children"
              ? [organizationId!, ...descendants.map(item => item.id)]
              : descendants.some(item => item.id === input.organizationScope)
                ? [input.organizationScope]
                : [organizationId!]
            : null;

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
          : await getUserOrganizationId(ctx.user.id);
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
          1,
          1000
        );
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

    update: adminProcedure
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

        if (input.status !== existing.status) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "تغيير الحالة يجب أن يتم عبر مسار دورة الحياة المعتمد",
          });
        }

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

        await writeAuditLog({
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Administrator",
          action: "telegram.update",
          entityType: "telegram",
          entityId: String(id),
          metadata: JSON.stringify({
            serialNumber: existing.serialNumber,
            createdByUserId: existing.createdByUserId,
          }),
        });

        return updated;
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
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
            reason:
              "حذف نهائي من حساب المالك أو المدير دون الاحتفاظ بسجل البرقية",
          }),
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
          if (telegram && sourceOrganization?.parentOrganizationId) {
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
          !["system_admin", "organization_admin", "reviewer"].includes(
            membership.role
          )
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
        await writeAuditLog({
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
                telegramId: routedTelegram.id,
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
        await writeAuditLog({
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
            metadata: { serialCode: existing.serialCode },
          });
          await writeAuditLog({
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
          if (existing) return existing;
        }

        const organizationId = await getUserOrganizationId(ctx.user.id);
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
            if (sourceOrganization?.parentOrganizationId) {
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
          actorUserId: ctx.user.id,
          actorName: creatorName,
          action: "telegram.create",
          entityType: "telegram",
          entityId: String(telegram.id),
          metadata: JSON.stringify({
            serialNumber,
            classification: input.classification,
          }),
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
          snapshot: {
            subject: telegram.subject,
            recipient: telegram.recipient,
            body: telegram.body,
            classification: telegram.classification,
            priority: telegram.priority,
            category: telegram.category,
            status: telegram.status,
          },
        });

        try {
          await notifyOrganizationTelegramCreated({
            organizationId: telegram.currentOrganizationId,
            serialCode: telegram.serialCode,
            subject: telegram.subject,
            recipient: telegram.recipient,
            priority: telegram.priority,
            telegramId: telegram.id,
          });
        } catch (error) {
          console.warn("[Notification] Telegram push dispatch failed", error);
        }

        return telegram;
      }),
    nextOutgoingSerial: protectedProcedure.query(async ({ ctx }) => {
      const organizationId = await getUserOrganizationId(ctx.user.id);
      return {
        number: await getSuggestedOrganizationSerialNumber(organizationId),
      };
    }),
    importRows: organizationAdminProcedure
      .input(
        z.object({
          rows: z
            .array(
              z.object({
                originalSerial: z.string().max(120).optional(),
                time: z.string().max(120).optional(),
                sender: z.string().max(255).optional(),
                date: z.string().max(120).optional(),
                body: z.string().trim().min(3).max(20000),
                recipient: z.string().max(255).optional(),
                signature: z.string().max(255).optional(),
                notes: z.string().max(4000).optional(),
                sheetName: z.enum(["صادر", "وارد"]),
              })
            )
            .min(1)
            .max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const organizationId = await getUserOrganizationId(ctx.user.id);
        const settings = await getOrCreateSettings(ctx.user.id);
        const creatorName = ctx.user.name ?? ctx.user.email ?? "شرطي مسجل";
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
          });
          const idempotencyKey = `excel-import:${createHash("sha256")
            .update(sourceKey)
            .digest("hex")}`;
          try {
            const existing = await getTelegramByIdempotencyKey(idempotencyKey);
            if (existing) {
              skipped += 1;
              continue;
            }
            const serialNumber = await allocateSerialNumber();
            const dateParts = new Intl.DateTimeFormat("en-CA", {
              timeZone: settings.timezone,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).formatToParts(new Date());
            const dateValues = Object.fromEntries(
              dateParts.map(part => [part.type, part.value])
            );
            const dateCode = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
            const serialCode = `${settings.serialPrefix}-${dateCode}-${String(serialNumber).padStart(5, "0")}`;
            const importedCreatedAt = parseImportedDate(row.date, row.time);
            const importedBody = [
              row.body,
              row.signature ? `\nتوقيع السجل الأصلي: ${row.signature}` : "",
              row.notes ? `\nملاحظات السجل الأصلي: ${row.notes}` : "",
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
              createdAt: importedCreatedAt,
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
              workflowReason: `استيراد Excel من ورقة ${row.sheetName}، الرقم الأصلي ${row.originalSerial || "غير محدد"}${row.date ? `، التاريخ الأصلي ${row.date}` : ""}${row.time ? `، الوقت الأصلي ${row.time}` : ""}`,
            });
            await writeAuditLog({
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
              snapshot: {
                subject: telegram.subject,
                recipient: telegram.recipient,
                body: telegram.body,
                classification: telegram.classification,
                priority: telegram.priority,
                category: telegram.category,
                status: telegram.status,
              },
            });
            created += 1;
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
