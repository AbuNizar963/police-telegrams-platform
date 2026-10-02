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
import { z } from "zod";
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
  createTelegram,
  createTelegramAttachment,
  updateTelegram,
  deleteTelegram,
  getDashboardStats,
  getMaxSerialNumber,
  getOrCreateSettings,
  getTelegramById,
  getTelegramByIdempotencyKey,
  getTelegramReport,
  listTelegrams,
  recordTelegramAction,
  recordTelegramVersion,
  transitionTelegram,
  updateDepartmentSettings,
  writeAuditLog,
  createLocalOwnerUser,
  getUserByUsername,
  getUserOrganizationId,
} from "./db";
import {
  addOrganizationMembership,
  createOrganization,
  getUserOrganizationMembership,
  listOrganizationsForUser,
  listRoutingTargets,
  routeTelegram,
} from "./organization";
import {
  StorageAccessDeniedError,
  storageGetSignedUrl,
  storagePut,
  storagePutDepartmentLogo,
} from "./storage";

const classificationSchema = z.enum(["secret", "normal"]);
const prioritySchema = z.enum(["slow", "normal", "urgent"]);
const categorySchema = z.enum([
  "criminal",
  "administrative",
  "traffic",
  "security",
  "tactical",
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
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const normalizedUsername = input.username.trim();

        let user = await authenticateLocalUser(
          normalizedUsername,
          input.password,
        );

        if (
          !user &&
          normalizedUsername.toLowerCase() === ENV.ownerUsername.trim().toLowerCase() &&
          (ENV.ownerPasswordHash || ENV.ownerInitialPassword)
        ) {
          // The initial secret is only used to bootstrap a missing owner account.
          // Existing accounts and their credentials are never overwritten.
          const bootstrapHash =
            ENV.ownerPasswordHash ||
            (await hashPassword(ENV.ownerInitialPassword));
          const ownerPasswordMatches = await verifyPassword(
            input.password,
            bootstrapHash,
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
              const existing = await getUserByUsername(ENV.ownerUsername.trim());
              if (existing?.passwordHash) {
                user = await authenticateLocalUser(
                  normalizedUsername,
                  input.password,
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
      listOrganizationsForUser(ctx.user.id),
    ),

    context: protectedProcedure.query(async ({ ctx }) => {
      const membership = await getUserOrganizationMembership(ctx.user.id);
      return membership
        ? {
            organizationId: membership.organizationId,
            role: membership.role,
            isActive: membership.isActive,
          }
        : null;
    }),

    routingTargets: protectedProcedure.query(({ ctx }) =>
      listRoutingTargets(ctx.user.id),
    ),

    create: adminProcedure
      .input(
        z.object({
          parentOrganizationId: z.string().uuid().nullable().optional(),
          code: z.string().trim().min(2).max(64).regex(/^[A-Z0-9_-]+$/i),
          name: z.string().trim().min(2).max(255),
          type: z.enum(["central", "command", "department", "station", "unit"]),
        }),
      )
      .mutation(({ input }) => createOrganization(input)),

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
        }),
      )
      .mutation(async ({ ctx, input }) => {
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
      const canViewAll = ctx.user.role === "admin";
      const organizationId = canViewAll
        ? null
        : await getUserOrganizationId(ctx.user.id);

      return getDashboardStats(ctx.user.id, canViewAll, organizationId);
    }),
  }),

  reports: router({
    telegrams: adminProcedure
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
        }),
      )
      .query(async ({ input }) => {
        const report = await getTelegramReport(input);
        return {
          ...report,
          generatedAt: new Date().toISOString(),
          filters: input,
        };
      }),
  }),

  settings: router({
    get: protectedProcedure.query(({ ctx }) =>
      getOrCreateSettings(ctx.user.id),
    ),

    uploadLogo: adminProcedure
      .input(
        z.object({
          fileName: z.string().trim().min(1).max(180),
          contentType: z.enum(["image/jpeg", "image/png"]),
          base64: z.string().min(1).max(7_000_000),
        }),
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
          input.contentType,
        );
      }),

    update: adminProcedure
      .input(
        z.object({
          departmentName: z.string().trim().min(2).max(255),
          // الوحدة التابعة ورئيسها حقول اختيارية؛ الواجهة تسمح بحفظ الإعدادات
          // بدون وحدة تابعة، لذلك يجب قبول القيمة الفارغة بعد trim بدل رفضها.
          unitName: z.string().trim().max(255).default("وحدة العمليات"),
          unitChiefRank: z.string().trim().max(120).default("العقيد"),
          unitChiefName: z.string().trim().max(255).default("رئيس الوحدة"),
          serialPrefix: z.string().trim().min(1).max(24).regex(/^[A-Z0-9-]+$/),
          serialStart: z.number().int().min(1).max(999999999),
          timezone: z.string().trim().min(3).max(64).default("Asia/Riyadh"),
          dateFormat: z.string().trim().min(4).max(32).default("dd/MM/yyyy HH:mm:ss"),
          numberSystem: z.enum(["latin", "arabic", "hindi"]).default("latin"),
          logoUrl: z.string().url().max(2000).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const dbSettings = await getOrCreateSettings(ctx.user.id);
        const maxSerial = await getMaxSerialNumber();
        const safeNextSerial = Math.max(input.serialStart, maxSerial + 1);

        await updateDepartmentSettings(dbSettings.id, {
          departmentName: input.departmentName,
          unitName: input.unitName,
          unitChiefRank: input.unitChiefRank,
          unitChiefName: input.unitChiefName,
          serialPrefix: input.serialPrefix,
          serialStart: input.serialStart,
          nextSerial: safeNextSerial,
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
          metadata: JSON.stringify(input),
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
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const telegram = await getTelegramById(input.telegramId);
        if (!telegram) {
          throw new TRPCError({ code: "NOT_FOUND", message: "البرقية غير موجودة" });
        }
        if (ctx.user.role !== "admin") {
          const organizationId = await getUserOrganizationId(ctx.user.id);
          if (telegram.organizationId !== organizationId && telegram.currentOrganizationId !== organizationId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية إرفاق ملف بهذه البرقية" });
          }
        }
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
          input.contentType,
        );

        await createTelegramAttachment({
          telegramId: input.telegramId,
          storageKey: uploaded.key,
          originalName: input.fileName,
          mimeType: input.contentType,
          sizeBytes: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          uploadedByUserId: ctx.user.id,
        });

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

    list: protectedProcedure
      .input(
        z
          .object({
            search: z.string().max(120).optional(),
            classification: classificationSchema.optional(),
            priority: prioritySchema.optional(),
            category: categorySchema.optional(),
            status: statusSchema.optional(),
            page: z.number().int().min(1).max(100000).default(1),
            pageSize: z.number().int().min(1).max(100).default(50),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        const canViewAll = ctx.user.role === "admin";
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
          input?.page,
          input?.pageSize,
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

        if (ctx.user.role === "admin") return telegram;

        const organizationId = await getUserOrganizationId(ctx.user.id);
        const canRead =
          telegram.organizationId === organizationId ||
          telegram.currentOrganizationId === organizationId;

        if (!canRead) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا تملك صلاحية عرض هذه البرقية",
          });
        }

        return telegram;
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
        }),
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

        if (input.status !== existing.status) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "تغيير الحالة يجب أن يتم عبر مسار دورة الحياة المعتمد",
          });
        }

        const updated = await updateTelegram(id, {
          ...values,
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

        await writeAuditLog({
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Administrator",
          action: "telegram.archive",
          entityType: "telegram",
          entityId: String(existing.id),
          metadata: JSON.stringify({
            serialNumber: existing.serialNumber,
            createdByUserId: existing.createdByUserId,
            creatorName: existing.creatorName,
          }),
        });

        await deleteTelegram(existing.id);
        await recordTelegramAction({
          telegramId: existing.id,
          actorUserId: ctx.user.id,
          action: "telegram.archive",
          fromStatus: existing.status,
          toStatus: "archived",
          reason: "أرشفة إدارية مع الحفاظ على السجل التاريخي",
        });
        return { success: true as const, id: existing.id };
      }),

    route: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          toOrganizationId: z.string().uuid(),
          note: z.string().trim().max(2000).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const route = await routeTelegram({
          telegramId: input.id,
          toOrganizationId: input.toOrganizationId,
          forwardedByUserId: ctx.user.id,
          note: input.note ?? null,
        });

        await writeAuditLog({
          actorUserId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Officer",
          action: "telegram.route",
          entityType: "telegram",
          entityId: String(input.id),
          metadata: JSON.stringify({
            routeId: route.id,
            toOrganizationId: route.toOrganizationId,
          }),
        });

        return route;
      }),

    transition: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          toStatus: statusSchema,
          reason: z.string().trim().max(2000).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const existing = await getTelegramById(input.id);
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "البرقية غير موجودة",
          });
        }

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
            message: error instanceof Error ? error.message : "تعذر تغيير حالة البرقية",
            cause: error,
          });
        }
      }),

    create: protectedProcedure
      .input(
        z.object({
          subject: z.string().trim().min(2).max(255),
          recipient: z.string().trim().min(2).max(255),
          body: z.string().trim().min(3).max(20000),
          classification: classificationSchema,
          priority: prioritySchema,
          category: categorySchema,
          idempotencyKey: z.string().trim().min(16).max(120).optional(),
          attachmentManifest: z.string().max(10000).optional(),
          gpsLatitude: z.string().max(40).optional(),
          gpsLongitude: z.string().max(40).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.idempotencyKey) {
          const existing = await getTelegramByIdempotencyKey(input.idempotencyKey);
          if (existing) return existing;
        }

        const serialNumber = await allocateSerialNumber();
        const numbering = await getOrCreateSettings(ctx.user.id);
        const dateParts = new Intl.DateTimeFormat("en-CA", {
          timeZone: numbering.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(new Date());
        const dateValues = Object.fromEntries(
          dateParts.map(part => [part.type, part.value]),
        );
        const dateCode = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
        const serialCode = `${numbering.serialPrefix}-${dateCode}-${String(serialNumber).padStart(5, "0")}`;
        const organizationId = await getUserOrganizationId(ctx.user.id);
        const creatorName = ctx.user.name ?? ctx.user.email ?? "شرطي مسجل";
        const creatorIpHeader = ctx.req.headers["x-forwarded-for"];
        const creatorIp =
          typeof creatorIpHeader === "string"
            ? creatorIpHeader.split(",")[0].trim()
            : null;

        const telegram = await createTelegram({
          ...input,
          serialNumber,
          serialCode,
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

        return telegram;
      }),
  }),
});

export type AppRouter = typeof appRouter;
