import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";

const mocks = vi.hoisted(() => ({
  usersInsert: vi.fn(),
  userDuplicateLookup: vi.fn(),
  userLookup: vi.fn(),
  usersUpdate: vi.fn(),
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
          ilike: () => ({
            neq: () => ({ maybeSingle: mocks.userDuplicateLookup }),
          }),
          eq: () => ({ maybeSingle: mocks.userLookup }),
        }),
        insert: mocks.usersInsert,
        update: (values: Record<string, unknown>) => {
          mocks.usersUpdate(values);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
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
    mocks.userLookup.mockResolvedValue({ data: null, error: null });
    mocks.usersUpdate.mockResolvedValue({ error: null });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getUserById.mockResolvedValue({
      passwordHash: "hashed-owner-password",
    });
    mocks.purgeInactiveUserSafely.mockResolvedValue({
      data: { deleted: true, userId: 25 },
      error: null,
    });
    mocks.organizationLookup.mockResolvedValue({
      data: { id: organizationId, name: "قسم الاختبار", isActive: true },
      error: null,
    });
    mocks.hashPassword.mockResolvedValue("hashed-password");
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

  it("rotates application sessions when an administrator resets a password", async () => {
    mocks.userLookup.mockResolvedValue({
      data: {
        id: 25,
        role: "user",
        username: "officer25",
        organizationId,
      },
      error: null,
    });
    mocks.userDuplicateLookup.mockResolvedValue({ data: null, error: null });
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
        password: "A-new-secure-password-123",
        confirmPassword: "owner-password",
      })
    ).resolves.toMatchObject({ id: 25 });

    const updatedValues = mocks.usersUpdate.mock.calls[0]?.[0];
    expect(updatedValues).toEqual(
      expect.objectContaining({
        password_hash: "hashed-password",
        mustChangePassword: true,
        sessionVersion: expect.any(String),
      })
    );
    expect(updatedValues).not.toHaveProperty("authUserId");
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

describe("user activation lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getUserById.mockResolvedValue({
      passwordHash: "hashed-owner-password",
    });
    mocks.hashPassword.mockResolvedValue("hashed-new-password");
    mocks.usersUpdate.mockResolvedValue({ error: null });
  });

  it("marks disabled accounts inactive and revokes credentials", async () => {
    mocks.userLookup.mockResolvedValue({
      data: {
        id: 25,
        role: "user",
        username: "officer25",
        organizationId: null,
      },
      error: null,
    });
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.disable({ id: 25, confirmPassword: "owner-password" })
    ).resolves.toMatchObject({ success: true });

    expect(mocks.usersUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        loginMethod: "disabled",
        isActive: false,
        password_hash: null,
        sessionVersion: expect.any(String),
      })
    );
  });

  it("reactivates disabled accounts and restores active status", async () => {
    mocks.userLookup.mockResolvedValue({
      data: {
        id: 25,
        role: "user",
        username: "officer25",
        loginMethod: "disabled",
        organizationId: null,
      },
      error: null,
    });
    const caller = userManagementRouter.createCaller(adminContext());

    await expect(
      caller.enable({
        id: 25,
        password: "A-new-secure-password-123",
        confirmPassword: "owner-password",
      })
    ).resolves.toMatchObject({ success: true });

    expect(mocks.usersUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        loginMethod: "password",
        isActive: true,
        mustChangePassword: true,
        sessionVersion: expect.any(String),
      })
    );
  });
});
