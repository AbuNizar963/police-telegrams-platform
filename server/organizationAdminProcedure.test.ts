import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const getMembershipMock = vi.hoisted(() => vi.fn());

vi.mock("./organization", () => ({
  getUserOrganizationMembership: getMembershipMock,
}));

import { organizationAdminProcedure, router } from "./_core/trpc";

const protectedRouter = router({
  manage: organizationAdminProcedure.query(({ ctx }) => ({
    userRole: ctx.user.role,
    membershipRole: ctx.organizationMembership.role,
  })),
});

function contextFor(role: "user" | "admin" = "user"): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 7,
      authUserId: "00000000-0000-4000-8000-000000000007",
      name: "Organization Administrator",
      badgeNumber: null,
      email: null,
      loginMethod: "password",
      role,
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function membership(role: string) {
  const now = new Date();
  return {
    id: 1,
    organizationId: "00000000-0000-4000-8000-000000000001",
    userId: 7,
    role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

describe("organization admin authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a provisioned user with an active organization_admin membership", async () => {
    getMembershipMock.mockResolvedValueOnce(membership("organization_admin"));

    await expect(
      protectedRouter.createCaller(contextFor("user")).manage()
    ).resolves.toEqual({
      userRole: "user",
      membershipRole: "organization_admin",
    });
  });

  it("allows a system admin with the matching active membership", async () => {
    getMembershipMock.mockResolvedValueOnce(membership("system_admin"));

    await expect(
      protectedRouter.createCaller(contextFor("admin")).manage()
    ).resolves.toEqual({
      userRole: "admin",
      membershipRole: "system_admin",
    });
  });

  it("rejects users whose active membership is not administrative", async () => {
    getMembershipMock.mockResolvedValueOnce(membership("dispatcher"));

    await expect(
      protectedRouter.createCaller(contextFor("user")).manage()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects users without an active organization membership", async () => {
    getMembershipMock.mockResolvedValueOnce(null);

    await expect(
      protectedRouter.createCaller(contextFor("admin")).manage()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
