import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { hashPassword, publicUser, verifyPassword } from "./_core/auth";
import { protectedProcedure, router } from "./_core/trpc";
import { getUserById, updateUserPassword, updateUserProfile } from "./db";

export const profileRouter = router({
  get: protectedProcedure.query(({ ctx }) => publicUser(ctx.user)),

  update: protectedProcedure
    .input(z.object({
      name: z.string().trim().min(2, "الاسم يجب أن يتكون من حرفين على الأقل").max(255),
      badgeNumber: z.string().trim().max(80).nullable(),
      phone: z.string().trim().max(32).nullable(),
      rank: z.string().trim().max(120).nullable(),
      unit: z.string().trim().max(255).nullable(),
      bio: z.string().trim().max(1000).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const updated = await updateUserProfile(ctx.user.id, {
        name: input.name,
        badgeNumber: input.badgeNumber || null,
        phone: input.phone || null,
        rank: input.rank || null,
        unit: input.unit || null,
        bio: input.bio || null,
      });
      return publicUser(updated);
    }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1).max(256),
      newPassword: z.string().min(12, "كلمة المرور الجديدة يجب ألا تقل عن 12 محرفًا").max(256),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUserById(ctx.user.id);
      if (!user?.passwordHash) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "هذا الحساب لا يستخدم كلمة مرور محلية؛ غيّر كلمة المرور من مزود تسجيل الدخول.",
        });
      }
      const valid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة المرور الحالية غير صحيحة" });
      }
      if (input.currentPassword === input.newPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "اختر كلمة مرور مختلفة عن الحالية" });
      }
      await updateUserPassword(ctx.user.id, await hashPassword(input.newPassword));
      return { success: true };
    }),
});
