import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import type { TrpcContext } from "./context";
import { getUserOrganizationMembership } from "../organization";
import { isPlatformOwner } from "../ownerAccess";

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

export const authenticatedProcedure = t.procedure.use(requireUser);
// A temporary password is a user-facing reminder, not an access lock. The
// dashboard shows a one-time change/skip dialog while protected procedures
// remain available so the account can read its organization's telegrams.
export const protectedProcedure = authenticatedProcedure;

export const adminProcedure = t.procedure.use(requireUser).use(
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

export const organizationAdminProcedure = t.procedure.use(requireUser).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: UNAUTHED_ERR_MSG,
      });
    }

    // Organization privileges come from the active membership, not the
    // platform-wide user role. Provisioned organization administrators use
    // role="user" and receive organization_admin membership for their unit.
    const membership = await getUserOrganizationMembership(ctx.user.id);
    if (
      !isPlatformOwner(ctx.user) &&
      (!membership ||
        !["system_admin", "organization_admin"].includes(membership.role))
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
