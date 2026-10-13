import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getRequestAuditContext } from "./auditContext";
import { TRPCError } from "@trpc/server";
import {
  adminProcedure,
  organizationManagerProcedure,
  router,
} from "./_core/trpc";
import { hashPassword, verifyPassword } from "./_core/auth";
import { getSupabaseAdmin } from "./_core/supabase";
import { getUserById, writeAuditLog } from "./db";
import { addOrganizationMembership } from "./organization";
import { isPlatformOwner } from "./ownerAccess";
import {
  assertCanManageOrganization,
  getManagedOrganizationIds,
} from "./organizationScope";

async function getActiveOrganizationForAccount(organizationId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("id, name, isActive")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "تعذر التحقق من الجهة المختارة للحساب",
    });
  }
  if (!data || data.isActive !== true) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "الجهة المختارة غير موجودة أو غير مفعّلة",
    });
  }
  return data as { id: string; name: string; isActive: boolean };
}

async function requireCurrentPassword(
  userId: number,
  password: string
): Promise<void> {
  const user = await getUserById(userId);
  if (
    !user?.passwordHash ||
    !(await verifyPassword(password, user.passwordHash))
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "تأكيد كلمة المرور الحالية غير صحيح أو غير متاح لهذا الحساب",
    });
  }
}

export const userManagementRouter = router({
  list: organizationManagerProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(100).default(25),
        search: z.string().trim().max(120).default(""),
        organizationId: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const client = getSupabaseAdmin();
      const managedOrganizationIds = await getManagedOrganizationIds(ctx.user);
      if (input.organizationId) {
        await assertCanManageOrganization(ctx.user, input.organizationId);
      }
      const scopedOrganizationIds = input.organizationId
        ? [input.organizationId]
        : managedOrganizationIds;
      let query = client
        .from("users")
        .select(
          "id, organizationId, username, name, badgeNumber, phone, rank, unit, role, loginMethod, createdAt, lastSignedIn",
          { count: "exact" }
        )
        .in("organizationId", scopedOrganizationIds)
        .order("createdAt", { ascending: false })
        .range(
          (input.page - 1) * input.pageSize,
          input.page * input.pageSize - 1
        );
      const search = input.search.toLowerCase();
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,username.ilike.%${search}%,badgeNumber.ilike.%${search}%,phone.ilike.%${search}%`
        );
      }
      const { data, error, count } = await query;
      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تحميل حسابات المستخدمين",
        });
      const users = data ?? [];
      const pageOrganizationIds = Array.from(
        new Set(
          users
            .map(user => user.organizationId)
            .filter((id): id is string => typeof id === "string")
        )
      );
      const organizationNames = new Map<string, string>();
      const membershipRoles = new Map<number, string>();
      if (pageOrganizationIds.length > 0) {
        const organizations = await client
          .from("organizations")
          .select("id, name")
          .in("id", pageOrganizationIds);
        if (organizations.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "تعذر تحميل جهات حسابات المستخدمين",
          });
        }
        for (const organization of organizations.data ?? []) {
          if (
            typeof organization.id === "string" &&
            typeof organization.name === "string"
          ) {
            organizationNames.set(organization.id, organization.name);
          }
        }
      }
      if (users.length > 0) {
        const memberships = await client
          .from("organization_memberships")
          .select("userId, role")
          .in(
            "userId",
            users.map(user => user.id)
          )
          .eq("isActive", true);
        if (memberships.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "تعذر تحميل صلاحيات حسابات المستخدمين",
          });
        }
        for (const membership of memberships.data ?? []) {
          membershipRoles.set(
            Number(membership.userId),
            String(membership.role)
          );
        }
      }
      return {
        items: users.map(user => ({
          ...user,
          membershipRole: membershipRoles.get(Number(user.id)) ?? null,
          organizationName:
            typeof user.organizationId === "string"
              ? (organizationNames.get(user.organizationId) ?? null)
              : null,
        })),
        total: count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / input.pageSize)),
      };
    }),

  create: organizationManagerProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
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
          .min(12, "كلمة المرور المؤقتة يجب ألا تقل عن 12 محرفًا")
          .max(256),
        badgeNumber: z.string().trim().max(80).nullable().optional(),
        phone: z.string().trim().max(32).nullable().optional(),
        rank: z.string().trim().max(120).nullable().optional(),
        unit: z.string().trim().max(255).nullable().optional(),
        role: z
          .enum([
            "regional_admin",
            "organization_supervisor",
            "organization_admin",
            "dispatcher",
            "reviewer",
            "reader",
            "auditor",
          ])
          .default("dispatcher"),
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

      const organization = await getActiveOrganizationForAccount(
        input.organizationId
      );
      await assertCanManageOrganization(ctx.user, organization.id);
      if (
        [
          "regional_admin",
          "organization_supervisor",
          "organization_admin",
        ].includes(input.role) &&
        !isPlatformOwner(ctx.user) &&
        ctx.user.role !== "admin"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "تعيين أدوار الإدارة العليا متاح لمالك النظام فقط",
        });
      }
      const now = new Date().toISOString();
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
          mustChangePassword: true,
          role: "user",
          createdAt: now,
          updatedAt: now,
          lastSignedIn: now,
        })
        .select(
          "id, organizationId, username, name, badgeNumber, phone, rank, unit, role, createdAt, lastSignedIn"
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

      try {
        await addOrganizationMembership({
          organizationId: organization.id,
          userId: data.id,
          role: input.role,
        });
      } catch (membershipError) {
        const cleanup = await client.from("users").delete().eq("id", data.id);
        if (cleanup.error) {
          console.error(
            "[userManagement.create] Failed to remove account after membership failure",
            cleanup.error
          );
        }
        throw membershipError;
      }

      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك النظام",
        action: "user.create",
        entityType: "user",
        entityId: String(data.id),
        metadata: JSON.stringify({
          username,
          organizationId: organization.id,
          organizationName: organization.name,
          badgeNumber: input.badgeNumber ?? null,
        }),
      });
      return data;
    }),

  update: organizationManagerProcedure
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
        password: z.string().min(12).max(256).optional().or(z.literal("")),
        confirmPassword: z.string().min(1).max(256).optional(),
        role: z
          .enum([
            "regional_admin",
            "organization_supervisor",
            "organization_admin",
            "dispatcher",
            "reviewer",
            "reader",
            "auditor",
          ])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if ((input.password || input.role) && !input.confirmPassword) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "تأكيد كلمة المرور الحالية مطلوب لتغيير الصلاحية أو كلمة المرور",
        });
      }
      if ((input.password || input.role) && input.confirmPassword) {
        await requireCurrentPassword(ctx.user.id, input.confirmPassword);
      }
      const client = getSupabaseAdmin();
      const target = await client
        .from("users")
        .select("id, role, username, organizationId")
        .eq("id", input.id)
        .maybeSingle();
      if (target.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تحميل الحساب المطلوب",
        });
      if (!target.data)
        throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
      if (typeof target.data.organizationId === "string") {
        await assertCanManageOrganization(ctx.user, target.data.organizationId);
      }
      if (
        input.role &&
        [
          "regional_admin",
          "organization_supervisor",
          "organization_admin",
        ].includes(input.role) &&
        !isPlatformOwner(ctx.user) &&
        ctx.user.role !== "admin"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "تعيين أدوار الإدارة العليا متاح لمالك النظام فقط",
        });
      }
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
      if (input.role && typeof target.data.organizationId === "string") {
        await addOrganizationMembership({
          organizationId: target.data.organizationId,
          userId: input.id,
          role: input.role,
        });
      }
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
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

  enable: organizationManagerProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        password: z.string().min(12).max(256),
        confirmPassword: z.string().min(1).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireCurrentPassword(ctx.user.id, input.confirmPassword);
      const client = getSupabaseAdmin();
      const target = await client
        .from("users")
        .select("id, role, username, loginMethod, organizationId")
        .eq("id", input.id)
        .maybeSingle();
      if (target.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تحميل الحساب المطلوب",
        });
      if (!target.data)
        throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
      if (typeof target.data.organizationId === "string") {
        await assertCanManageOrganization(ctx.user, target.data.organizationId);
      }
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
          authUserId: randomUUID(),
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
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك النظام",
        action: "user.enable",
        entityType: "user",
        entityId: String(input.id),
        metadata: JSON.stringify({ username: target.data.username }),
      });
      return { success: true };
    }),

  delete: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        confirmPassword: z.string().min(1).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isPlatformOwner(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "الحذف النهائي للحسابات متاح لمالك النظام فقط",
        });
      }
      await requireCurrentPassword(ctx.user.id, input.confirmPassword);
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكنك حذف حسابك الحالي",
        });
      }

      const client = getSupabaseAdmin();
      const target = await client
        .from("users")
        .select("id, role, username")
        .eq("id", input.id)
        .maybeSingle();
      if (target.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تحميل الحساب المطلوب للحذف",
        });
      }
      if (!target.data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
      }
      if (target.data.role === "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكن حذف حساب مالك النظام",
        });
      }

      const { error } = await client.from("users").delete().eq("id", input.id);
      if (error) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "لا يمكن حذف هذا الحساب نهائيًا لأنه مرتبط ببرقيات أو سجلات تدقيق. استخدم التعطيل بدلًا من الحذف.",
        });
      }
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.username ?? "مالك النظام",
        action: "user.delete",
        entityType: "user",
        entityId: String(input.id),
        metadata: JSON.stringify({ username: target.data.username }),
      });
      return { success: true };
    }),

  disable: organizationManagerProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        confirmPassword: z.string().min(1).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireCurrentPassword(ctx.user.id, input.confirmPassword);
      if (input.id === ctx.user.id)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكنك تعطيل حسابك الحالي",
        });
      const client = getSupabaseAdmin();
      const target = await client
        .from("users")
        .select("id, role, username, organizationId")
        .eq("id", input.id)
        .maybeSingle();
      if (target.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "تعذر تحميل الحساب المطلوب",
        });
      if (!target.data)
        throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" });
      if (typeof target.data.organizationId === "string") {
        await assertCanManageOrganization(ctx.user, target.data.organizationId);
      }
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
        ...getRequestAuditContext(ctx.req),
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
