import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { allocateSerialNumber, createTelegram, getDashboardStats, getMaxSerialNumber, getOrCreateSettings, getTelegramById, listTelegrams, updateDepartmentSettings, writeAuditLog } from "./db";
import { storagePut } from "./storage";
import { storageGetSignedUrl } from "./storage";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";

const classificationSchema = z.enum(["secret", "normal"]);
const prioritySchema = z.enum(["slow", "normal", "urgent"]);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(() => {
      // Supabase owns the browser session. The client calls supabase.auth.signOut().
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
        unitName: z.string().trim().min(2).max(255).optional().default("وحدة العمليات"),
        unitChiefRank: z.string().trim().min(2).max(120).optional().default("العقيد"),
        unitChiefName: z.string().trim().min(2).max(255).optional().default("رئيس الوحدة"),
        serialPrefix: z.string().trim().min(1).max(24).regex(/^[A-Z0-9-]+$/),
        serialStart: z.number().int().min(1).max(999999999),
        timezone: z.string().trim().min(3).max(64).optional().default("Asia/Riyadh"),
        dateFormat: z.string().trim().min(4).max(32).optional().default("dd/MM/yyyy HH:mm:ss"),
        numberSystem: z.enum(["latin", "arabic", "hindi"]).optional().default("latin"),
        logoUrl: z.string().url().max(2000).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbSettings = await getOrCreateSettings(ctx.user.id);
        if (!dbSettings) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
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
        await writeAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Administrator", action: "settings.update", entityType: "department_settings", entityId: String(dbSettings.id), metadata: JSON.stringify(input) });
        return getOrCreateSettings(ctx.user.id);
      }),
  }),

  telegrams: router({
    uploadAttachment: protectedProcedure
      .input(z.object({ fileName: z.string().trim().min(1).max(180), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/mpeg", "audio/wav", "audio/webm"]), base64: z.string().min(1).max(14_000_000) }))
      .mutation(async ({ ctx, input }) => {
        const bytes = Buffer.from(input.base64, "base64");
        if (bytes.byteLength > 10 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "حجم المرفق يتجاوز 10 ميغابايت" });
        const uploaded = await storagePut(`telegrams/${ctx.user.id}/${input.fileName}`, bytes, input.contentType);
        await writeAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Officer", action: "attachment.upload", entityType: "telegram_attachment", entityId: uploaded.key, metadata: JSON.stringify({ fileName: input.fileName, contentType: input.contentType, size: bytes.byteLength }) });
        return { ...uploaded, fileName: input.fileName, contentType: input.contentType, size: bytes.byteLength };
      }),
    extractTextFromImage: protectedProcedure
      .input(z.object({ fileKey: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        const imageUrl = await storageGetSignedUrl(input.fileKey);
        const response = await invokeLLM({ messages: [{ role: "system", content: "أنت محرك OCR احترافي. استخرج النص العربي والإنجليزي الظاهر في الصورة بدقة، وحافظ على ترتيب الأسطر. أعد النص فقط دون شرح." }, { role: "user", content: [{ type: "text", text: "استخرج كل النص من هذه الصورة لاستخدامه داخل برقية رسمية." }, { type: "image_url", image_url: { url: imageUrl, detail: "high" } }] }] });
        const content = response.choices?.[0]?.message?.content;
        await writeAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Officer", action: "ocr.extract", entityType: "telegram_attachment", entityId: input.fileKey, metadata: JSON.stringify({ provider: "vision" }) });
        return { text: typeof content === "string" ? content.trim() : "" };
      }),
    transcribeVoice: protectedProcedure
      .input(z.object({ fileKey: z.string().min(1).max(500), language: z.string().length(2).default("ar") }))
      .mutation(async ({ ctx, input }) => {
        const audioUrl = await storageGetSignedUrl(input.fileKey);
        const result = await transcribeAudio({ audioUrl, language: input.language, prompt: "نص برقية شرطية رسمية باللغة العربية" });
        if (!("text" in result)) throw new TRPCError({ code: "BAD_GATEWAY", message: result.error });
        await writeAuditLog({ actorUserId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Officer", action: "voice.transcribe", entityType: "telegram_attachment", entityId: input.fileKey, metadata: JSON.stringify({ language: result.language }) });
        return { text: result.text, language: result.language };
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
        const numbering = await getOrCreateSettings(ctx.user.id);
        const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: numbering?.timezone ?? "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
        const dateValues = Object.fromEntries(dateParts.map(part => [part.type, part.value]));
        const dateCode = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
        const serialCode = `${numbering?.serialPrefix ?? "POL"}-${dateCode}-${String(serialNumber).padStart(5, "0")}`;
        const creatorName = ctx.user.name ?? ctx.user.email ?? "شرطي مسجل";
        const creatorIpHeader = ctx.req.headers["x-forwarded-for"];
        const creatorIp = typeof creatorIpHeader === "string" ? creatorIpHeader.split(",")[0].trim() : null;
        const telegram = await createTelegram({ ...input, serialNumber, serialCode, createdByUserId: ctx.user.id, creatorName, creatorEmail: ctx.user.email ?? null, creatorBadgeId: ctx.user.badgeNumber ?? null, creatorIp, creatorFingerprint: ctx.user.authUserId });
        await writeAuditLog({ actorUserId: ctx.user.id, actorName: creatorName, action: "telegram.create", entityType: "telegram", entityId: String(telegram?.id ?? serialNumber), metadata: JSON.stringify({ serialNumber, classification: input.classification }) });
        return telegram;
      }),
  }),
});

export type AppRouter = typeof appRouter;
