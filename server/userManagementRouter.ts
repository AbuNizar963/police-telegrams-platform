import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "./_core/trpc";
import { hashPassword } from "./_core/auth";
import { getSupabaseAdmin } from "./_core/supabase";
import { writeAuditLog } from "./db";

export const userManagementRouter = router({
  list: adminProcedure.query(async () => {
    const { data, error } = await getSupabaseAdmin()
      .from("users")
      .select("id, username, name, badgeNumber, rank, unit, role, createdAt, lastSignedIn")
      .order("createdAt", { ascending: false });
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر تحميل حسابات المستخدمين" });
    return data ?? [];
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().trim().min(2).max(255),
      username: z.string().trim().min(3).max(120).regex(/^[a-zA-Z0-9._-]+$/, "اسم المستخدم يقبل الأحرف الإنجليزية والأرقام والنقطة والشرطة فقط"),
      password: z.string().min(12).max(256),
      badgeNumber: z.string().trim().max(80).nullable().optional(),
      rank: z.string().trim().max(120).nullable().optional(),
      unit: z.string().trim().max(255).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const username = input.username.toLowerCase();
      const client = getSupabaseAdmin();
      const existing = await client.from("users").select("id").ilike("username", username).maybeSingle();
      if (existing.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر التحقق من اسم المستخدم" });
      if (existing.data) throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم بالفعل" });

      const now = new Date().toISOString();
      const { data, error } = await client.from("users").insert({
        authUserId: randomUUID(),
        username,
        password_hash: await hashPassword(input.password),
        name: input.name,
        badgeNumber: input.badgeNumber?.trim() || null,
        rank: input.rank?.trim() || null,
        unit: input.unit?.trim() || null,
        email: null,
        loginMethod: "password",
        role: "user",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      }).select("id, username, name, badgeNumber, rank, unit, role, createdAt, lastSignedIn").single();

      if (error || !data) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إنشاء حساب المستخدم" });
      }

      await writeAuditLog({
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك النظام",
        action: "user.create",
        entityType: "user",
        entityId: String(data.id),
        metadata: JSON.stringify({ username, badgeNumber: input.badgeNumber ?? null }),
      });
      return data;
    }),
});
