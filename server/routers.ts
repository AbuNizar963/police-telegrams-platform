import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { allocateSerialNumber, createTelegram, getDashboardStats, getOrCreateSettings, getTelegramById, listTelegrams, writeAuditLog } from "./db";
import { storagePut } from "./storage";

const classificationSchema = z.enum(["secret", "normal"]);
const prioritySchema = z.enum(["slow", "normal", "urgent"]);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  dashboard: router({
    stats: protectedProcedure.query(({ ctx }) => getDashboardStats(ctx.user.id, ctx.user.role === "admin")),
  }),

  settings: router({
    get: protectedProcedure.query(({ ctx }) => getOrCreateSettings(ctx.user.id)),
    update: adminProcedure
      .input(z.object({
        departmentName: z.string().trim().min(2).max(255),
        serialPrefix: z.string().trim().min(1).max(24).regex(/^[A-Z0-9-]+$/),
        serialStart: z.number().int().min(1).max(999999999),
        logoUrl: z.string().url().max(2000).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbSettings = await getOrCreateSettings(ctx.user.id);
        if (!dbSettings) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
        const { getDb } = await import("./db");
        const { departmentSettings } = await import("../drizzle/schema");
        const { eq, sql } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
        const { telegrams } = await import("../drizzle/schema");
        const maxRows = await db.select({ maxSerial: sql<number>`COALESCE(MAX(${telegrams.serialNumber}), 0)` }).from(telegrams);
        const safeNextSerial = Math.max(input.serialStart, Number(maxRows[0]?.maxSerial ?? 0) + 1);
        await db.update(departmentSettings).set({ departmentName: input.departmentName, serialPrefix: input.serialPrefix, serialStart: input.serialStart, nextSerial: safeNextSerial, logoUrl: input.logoUrl ?? null, updatedByUserId: ctx.user.id }).where(eq(departmentSettings.id, dbSettings.id));
        await writeAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Administrator", action: "settings.update", entityType: "department_settings", entityId: String(dbSettings.id), metadata: JSON.stringify(input) });
        return getOrCreateSettings(ctx.user.id);
      }),
  }),

  telegrams: router({
    uploadAttachment: protectedProcedure
      .input(z.object({ fileName: z.string().trim().min(1).max(180), contentType: z.enum(["image/jpeg", "image/png", "application/pdf", "audio/mpeg", "audio/wav"]), base64: z.string().min(1).max(14_000_000) }))
      .mutation(async ({ ctx, input }) => {
        const bytes = Buffer.from(input.base64, "base64");
        if (bytes.byteLength > 10 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "حجم المرفق يتجاوز 10 ميغابايت" });
        const uploaded = await storagePut(`telegrams/${ctx.user.id}/${input.fileName}`, bytes, input.contentType);
        await writeAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Officer", action: "attachment.upload", entityType: "telegram_attachment", entityId: uploaded.key, metadata: JSON.stringify({ fileName: input.fileName, contentType: input.contentType, size: bytes.byteLength }) });
        return { ...uploaded, fileName: input.fileName, contentType: input.contentType, size: bytes.byteLength };
      }),
    list: protectedProcedure
      .input(z.object({ search: z.string().max(120).optional(), classification: classificationSchema.optional(), priority: prioritySchema.optional(), category: z.enum(["criminal", "administrative", "traffic", "security", "tactical"]).optional(), status: z.enum(["pending", "in_progress", "resolved", "archived"]).optional() }).optional())
      .query(({ ctx, input }) => listTelegrams(ctx.user.id, ctx.user.role === "admin", input?.search, input?.classification, input?.priority, input?.category, input?.status)),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const telegram = await getTelegramById(input.id);
      if (!telegram) throw new TRPCError({ code: "NOT_FOUND", message: "البرقية غير موجودة" });
      if (ctx.user.role !== "admin" && telegram.createdByUserId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية عرض هذه البرقية" });
      return telegram;
    }),
    create: protectedProcedure
      .input(z.object({
        subject: z.string().trim().min(2).max(255),
        recipient: z.string().trim().min(2).max(255),
        body: z.string().trim().min(3).max(20000),
        classification: classificationSchema,
        priority: prioritySchema,
        category: z.enum(["criminal", "administrative", "traffic", "security", "tactical"]),
        attachmentManifest: z.string().max(10000).optional(),
        gpsLatitude: z.string().max(40).optional(),
        gpsLongitude: z.string().max(40).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const serialNumber = await allocateSerialNumber();
        const dateCode = new Date().toISOString().slice(0, 10);
        const numbering = await getOrCreateSettings(ctx.user.id);
        const serialCode = `${numbering?.serialPrefix ?? "POL"}-${dateCode}-${String(serialNumber).padStart(5, "0")}`;
        const creatorName = ctx.user.name ?? ctx.user.email ?? "شرطي مسجل";
        const creatorIpHeader = ctx.req.headers["x-forwarded-for"];
        const creatorIp = typeof creatorIpHeader === "string" ? creatorIpHeader.split(",")[0].trim() : null;
        const telegram = await createTelegram({ ...input, serialNumber, serialCode, createdByUserId: ctx.user.id, creatorName, creatorEmail: ctx.user.email ?? null, creatorBadgeId: ctx.user.badgeNumber ?? null, creatorIp, creatorFingerprint: ctx.user.openId });
        await writeAuditLog({ actorUserId: ctx.user.id, actorName: creatorName, action: "telegram.create", entityType: "telegram", entityId: String(telegram?.id ?? serialNumber), metadata: JSON.stringify({ serialNumber, classification: input.classification }) });
        return telegram;
      }),
  }),
});

export type AppRouter = typeof appRouter;
