import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";

const mocks = vi.hoisted(() => ({
  usersInsert: vi.fn(),
  userDuplicateLookup: vi.fn(),
  organizationLookup: vi.fn(),
  addOrganizationMembership: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  getUserById: vi.fn(),
  purgeInactiveUserSafely: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("../../_core/auth", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));
vi.mock("../organizations/organization", () => ({
  addOrganizationMembership: mocks.addOrganizationMembership,
}));
vi.mock("../../db", () => ({
  getUserById: mocks.getUserById,
  writeAuditLog: mocks.writeAuditLog,
}));
vi.mock("../../_core/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: mocks.organizationLookup }),
          }),
        };
      }
      return {
        select: () => ({
          ilike: () => ({ maybeSingle: mocks.userDuplicateLookup }),
        }),
        insert: mocks.usersInsert,
      };
    },
    rpc: mocks.purgeInactiveUserSafely,
  }),
}));

import { userManagementRouter } from "./userManagementRouter";

const organizationId = "00000000-0000-4000-8000-000000000025";

function adminContext(): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 1,
      authUserId: "00000000-0000-4000-8000-000000000001",
      name: "مالك النظام",
      username: "owner",
      isPlatformOwner: true,
      badgeNumber: null,
      email: "owner@example.com",
      loginMethod: "password",
      role: "admin",
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("user management organization assignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userDuplicateLookup.mockResolvedValue({ data: null, error: null });
    mocks.organizationLookup.mockResolvedValue({
      data: { id: organizationId, name: "قسم الاختبار", isActive: true },
      error: null,
    });
    mocks.hashPassword.mockResolvedValue("hashed-password");
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getUserById.mockResolvedValue({ passwordHash: "hashed-owner-password" });
    mocks.purgeInactiveUserSafely.mockResolvedValue({
      data: { deleted: true, userId: 25 },
      error: null,
    });
    mocks.addOrganizationMembership.mockResolvedValue({ id: 9 });
    mocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.usersInsert.mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: {
              id: 25,
              organizationId,
              username: "officer25",
              name: "الشرطي التجريبي",
              badgeNumber: null,
              phone: null,
              rank: null,
              unit: null,
              role: "user",
              createdAt: "2026-10-12T12:00:00.000Z",
              lastSignedIn: "2026-10-12T12:00:00.000Z",
            },
            error: null,
          }),
      }),
    });
  });

  it("creates the account and its active membership in the selected organization", async () => {
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.create({
        organizationId,
        name: "الشرطي التجريبي",
        username: "officer25",
        password: "A-secure-password-123",
        badgeNumber: null,
        phone: null,
        rank: null,
        unit: null,
      })
    ).resolves.toMatchObject({ id: 25, organizationId });

    expect(mocks.usersInsert).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, username: "officer25" })
    );
    expect(mocks.addOrganizationMembership).toHaveBeenCalledWith({
      organizationId,
      userId: 25,
      role: "dispatcher",
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.create",
        metadata: expect.stringContaining(
          `"organizationId":"${organizationId}"`
        ),
      })
    );
  });

  it("creates an organization administrator membership", async () => {
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.create({
        organizationId,
        name: "مدير الجهة التجريبي",
        username: "organization-admin25",
        password: "A-secure-password-123",
        role: "organization_admin",
      })
    ).resolves.toMatchObject({ id: 25, organizationId });

    expect(mocks.addOrganizationMembership).toHaveBeenCalledWith({
      organizationId,
      userId: 25,
      role: "organization_admin",
    });
  });

  it("rejects an inactive selected organization before inserting an account", async () => {
    mocks.organizationLookup.mockResolvedValue({
      data: { id: organizationId, name: "قسم موقوف", isActive: false },
      error: null,
    });
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.create({
        organizationId,
        name: "الشرطي التجريبي",
        username: "officer25",
        password: "A-secure-password-123",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mocks.usersInsert).not.toHaveBeenCalled();
    expect(mocks.addOrganizationMembership).not.toHaveBeenCalled();
  });

  it("requires the current password before changing an account role", async () => {
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.update({
        id: 25,
        name: "الشرطي التجريبي",
        username: "officer25",
        badgeNumber: null,
        phone: null,
        rank: null,
        unit: null,
        password: "",
        role: "reviewer",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("safe permanent user deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getUserById.mockResolvedValue({ passwordHash: "hashed-owner-password" });
    mocks.purgeInactiveUserSafely.mockResolvedValue({
      data: { deleted: true, userId: 25 },
      error: null,
    });
  });

  it("requires the owner confirmation phrase and delegates deletion to the guarded database RPC", async () => {
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.delete({
        id: 25,
        confirmPassword: "owner-password",
        confirmation: "DELETE USER 25 PERMANENTLY",
      })
    ).resolves.toMatchObject({ deleted: true, userId: 25 });

    expect(mocks.getUserById).toHaveBeenCalledWith(1);
    expect(mocks.verifyPassword).toHaveBeenCalledWith(
      "owner-password",
      "hashed-owner-password"
    );
    expect(mocks.purgeInactiveUserSafely).toHaveBeenCalledWith(
      "purge_inactive_user_safely",
      {
        p_user_id: 25,
        p_owner_user_id: 1,
        p_reason: "حذف نهائي لحساب بطلب مالك النظام",
        p_confirmation: "DELETE USER 25 PERMANENTLY",
      }
    );
  });

  it("does not call the purge RPC when the owner password is invalid", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.delete({
        id: 25,
        confirmPassword: "incorrect",
        confirmation: "DELETE USER 25 PERMANENTLY",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.purgeInactiveUserSafely).not.toHaveBeenCalled();
  });

  it("returns a conflict when database safety checks reject the purge", async () => {
    mocks.purgeInactiveUserSafely.mockResolvedValue({
      data: null,
      error: { message: "Account still owns telegrams" },
    });
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.delete({
        id: 25,
        confirmPassword: "owner-password",
        confirmation: "DELETE USER 25 PERMANENTLY",
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Account still owns telegrams",
    });
  });
});
