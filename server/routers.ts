import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { allocateSerialNumber, createTelegram, getDashboardStats, getOrCreateSettings, getTelegramById, listTelegrams, writeAuditLog } from "./db";

const classificationSchema = z.enum(["urgent", "secret", "normal"]);

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
    stats: protectedProcedure.query(() => getDashboardStats()),
  }),

  settings: router({
    get: protectedProcedure.query(({ ctx }) => getOrCreateSettings(ctx.user.id)),
    update: adminProcedure
      .input(z.object({
        departmentName: z.string().trim().min(2).max(255),
        serialStart: z.number().int().min(1).max(999999999),
        logoUrl: z.string().url().max(2000).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbSettings = await getOrCreateSettings(ctx.user.id);
        if (!dbSettings) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
        const { getDb } = await import("./db");
        const { departmentSettings } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
        await db.update(departmentSettings).set({ departmentName: input.departmentName, serialStart: input.serialStart, nextSerial: input.serialStart, logoUrl: input.logoUrl ?? null, updatedByUserId: ctx.user.id }).where(eq(departmentSettings.id, dbSettings.id));
        await writeAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Administrator", action: "settings.update", entityType: "department_settings", entityId: String(dbSettings.id), metadata: JSON.stringify(input) });
        return getOrCreateSettings(ctx.user.id);
      }),
  }),

  telegrams: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().max(120).optional(), classification: classificationSchema.optional() }).optional())
      .query(({ input }) => listTelegrams(input?.search, input?.classification)),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const telegram = await getTelegramById(input.id);
      if (!telegram) throw new TRPCError({ code: "NOT_FOUND", message: "البرقية غير موجودة" });
      return telegram;
    }),
    create: protectedProcedure
      .input(z.object({
        subject: z.string().trim().min(2).max(255),
        recipient: z.string().trim().min(2).max(255),
        body: z.string().trim().min(3).max(20000),
        classification: classificationSchema,
        attachmentManifest: z.string().max(10000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const serialNumber = await allocateSerialNumber();
        const creatorName = ctx.user.name ?? ctx.user.email ?? "شرطي مسجل";
        const telegram = await createTelegram({ ...input, serialNumber, createdByUserId: ctx.user.id, creatorName, creatorEmail: ctx.user.email ?? null });
        await writeAuditLog({ actorUserId: ctx.user.id, actorName: creatorName, action: "telegram.create", entityType: "telegram", entityId: String(telegram?.id ?? serialNumber), metadata: JSON.stringify({ serialNumber, classification: input.classification }) });
        return telegram;
      }),
  }),
});

export type AppRouter = typeof appRouter;
