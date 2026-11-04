import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getRequestAuditContext } from "../../auditContext";
import {
  getPlatformDocumentSettings,
  updatePlatformDocumentSettings,
  writeAuditLog,
} from "../../db";
import { isPlatformOwner } from "../../ownerAccess";
import { protectedProcedure, router } from "../../_core/trpc";
import {
  HEX_COLOR_PATTERN,
  MAX_WATERMARK_OPACITY_PERCENT,
} from "../../../shared/features/platform-settings/platformDocumentSettings";

export const platformDocumentSettingsRouter = router({
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
});
