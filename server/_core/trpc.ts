import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import type { TrpcContext } from "./context";
import { getUserOrganizationMembership } from "../organization";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG,
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: NOT_ADMIN_ERR_MSG,
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);

export const organizationAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: UNAUTHED_ERR_MSG,
      });
    }

    if (ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "لا تملك صلاحية إدارة الجهة الشرطية",
      });
    }

    const membership = await getUserOrganizationMembership(ctx.user.id);
    if (
      !membership ||
      !["system_admin", "organization_admin"].includes(membership.role)
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "لا تملك صلاحية إدارة الجهة الشرطية",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        organizationMembership: membership,
      },
    });
  })
);
