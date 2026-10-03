import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "./_core/trpc";
import { hashPassword } from "./_core/auth";
import { getSupabaseAdmin } from "./_core/supabase";
import { writeAuditLog } from "./db";
import {
  addOrganizationMembership,
  getPrimaryOrganization,
} from "./organization";

export const userManagementRouter = router({
  list: adminProcedure.query(async () => {
    const { data, error } = await getSupabaseAdmin()
      .from("users")
      .select(
        "id, username, name, badgeNumber, phone, rank, unit, role, loginMethod, createdAt, lastSignedIn"
      )
      .order("createdAt", { ascending: false });
    if (error)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "تعذر تحميل حسابات المستخدمين",
      });
    return data ?? [];
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(255),
        username: z
          .string()
          .trim()
          .min(3)
          .max(120)
          .regex(
            /^[a-zA-Z0-9._-]+$/,
            "اسم المستخدم يقبل الأحرف الإنجليزية والأرقام والنقطة والشرطة فقط"
          ),
        password: z
          .string()
          .min(4, "يجب أن تتكون كلمة المرور من 4 أحرف على الأقل")
          .max(256),
        badgeNumber: z.string().trim().max(80).nullable().optional(),
        phone: z.string().trim().max(32).nullable().optional(),
        rank: z.string().trim().max(120).nullable().optional(),
        unit: z.string().trim().max(255).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const username = input.username.toLowerCase();
      const client = getSupabaseAdmin();
      const existing = await client
        .from("users")
        .select("id")
        .ilike("username", username)
        .maybeSingle();
      if (existing.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر التحقق من اسم المستخدم",
        });
      if (existing.data)
        throw new TRPCError({
          code: "CONFLICT",
          message: "اسم المستخدم مستخدم بالفعل",
        });

      const now = new Date().toISOString();
      const organization = await getPrimaryOrganization();
      const { data, error } = await client
        .from("users")
        .insert({
          authUserId: randomUUID(),
          organizationId: organization.id,
          username,
          password_hash: await hashPassword(input.password),
          name: input.name,
          badgeNumber: input.badgeNumber?.trim() || null,
          phone: input.phone?.trim() || null,
          rank: input.rank?.trim() || null,
          unit: input.unit?.trim() || null,
          email: null,
          loginMethod: "password",
          role: "user",
          createdAt: now,
          updatedAt: now,
          lastSignedIn: now,
        })
        .select(
          "id, username, name, badgeNumber, phone, rank, unit, role, createdAt, lastSignedIn"
        )
        .single();

      if (error || !data) {
        console.error("[userManagement.create] Supabase insert failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "تعذر إنشاء حساب المستخدم. تحقق من إعدادات قاعدة البيانات وحاول مجددًا.",
        });
      }

      await addOrganizationMembership({
        organizationId: organization.id,
        userId: data.id,
        role: "dispatcher",
      });

      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك النظام",
        action: "user.create",
        entityType: "user",
        entityId: String(data.id),
        metadata: JSON.stringify({
          username,
          badgeNumber: input.badgeNumber ?? null,
        }),
      });
      return data;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(2).max(255),
        username: z
          .string()
          .trim()
          .min(3)
          .max(120)
          .regex(
            /^[a-zA-Z0-9._-]+$/,
            "اسم المستخدم يقبل الأحرف الإنجليزية والأرقام والنقطة والشرطة فقط"
          ),
        badgeNumber: z.string().trim().max(80).nullable(),
        phone: z.string().trim().max(32).nullable(),
        rank: z.string().trim().max(120).nullable(),
        unit: z.string().trim().max(255).nullable(),
        password: z.string().min(4).max(256).optional().or(z.literal("")),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = getSupabaseAdmin();
      const target = await client
        .from("users")
        .select("id, role, username")
        .eq("id", input.id)
        .maybeSingle();
      if (target.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تحميل الحساب المطلوب",
        });
      if (!target.data)
        throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
      if (target.data.role === "admin" && input.id !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكن تعديل حساب مالك آخر من هذه الشاشة",
        });
      }
      const username = input.username.toLowerCase();
      const duplicate = await client
        .from("users")
        .select("id")
        .ilike("username", username)
        .neq("id", input.id)
        .maybeSingle();
      if (duplicate.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر التحقق من اسم المستخدم",
        });
      if (duplicate.data)
        throw new TRPCError({
          code: "CONFLICT",
          message: "اسم المستخدم مستخدم بالفعل",
        });

      const values: Record<string, unknown> = {
        name: input.name,
        username,
        badgeNumber: input.badgeNumber?.trim() || null,
        phone: input.phone?.trim() || null,
        rank: input.rank?.trim() || null,
        unit: input.unit?.trim() || null,
        updatedAt: new Date().toISOString(),
      };
      if (input.password) {
        values.password_hash = await hashPassword(input.password);
        values.mustChangePassword = true;
        // Revoke existing sessions after an administrator resets the password.
        values.authUserId = randomUUID();
      }
      const { data, error } = await client
        .from("users")
        .update(values)
        .eq("id", input.id)
        .select(
          "id, username, name, badgeNumber, phone, rank, unit, role, createdAt, lastSignedIn"
        )
        .single();
      if (error || !data) {
        console.error("[userManagement.update] Supabase update failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر حفظ تعديلات الحساب",
        });
      }
      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك النظام",
        action: "user.update",
        entityType: "user",
        entityId: String(input.id),
        metadata: JSON.stringify({
          username,
          passwordReset: Boolean(input.password),
        }),
      });
      return data;
    }),

  enable: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        password: z.string().min(4).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = getSupabaseAdmin();
      const target = await client
        .from("users")
        .select("id, role, username, loginMethod")
        .eq("id", input.id)
        .maybeSingle();
      if (target.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تحميل الحساب المطلوب",
        });
      if (!target.data)
        throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
      if (target.data.role === "admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكن إعادة تفعيل حساب مالك النظام من هذه الشاشة",
        });
      if (target.data.loginMethod !== "disabled")
        throw new TRPCError({
          code: "CONFLICT",
          message: "الحساب مفعّل بالفعل",
        });
      const { error } = await client
        .from("users")
        .update({
          password_hash: await hashPassword(input.password),
          mustChangePassword: true,
          loginMethod: "password",
          updatedAt: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) {
        console.error("[userManagement.enable] Supabase update failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر إعادة تفعيل الحساب",
        });
      }
      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك النظام",
        action: "user.enable",
        entityType: "user",
        entityId: String(input.id),
        metadata: JSON.stringify({ username: target.data.username }),
      });
      return { success: true };
    }),

  disable: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكنك تعطيل حسابك الحالي",
        });
      const client = getSupabaseAdmin();
      const target = await client
        .from("users")
        .select("id, role, username")
        .eq("id", input.id)
        .maybeSingle();
      if (target.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تحميل الحساب المطلوب",
        });
      if (!target.data)
        throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
      if (target.data.role === "admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكن تعطيل حساب مالك النظام",
        });
      const { error } = await client
        .from("users")
        .update({
          authUserId: randomUUID(),
          password_hash: null,
          loginMethod: "disabled",
          updatedAt: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) {
        console.error("[userManagement.disable] Supabase update failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تعطيل الحساب",
        });
      }
      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك النظام",
        action: "user.disable",
        entityType: "user",
        entityId: String(input.id),
        metadata: JSON.stringify({ username: target.data.username }),
      });
      return { success: true };
    }),
});
