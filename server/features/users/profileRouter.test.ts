import { describe, expect, it, vi } from "vitest";
import * as auth from "../../_core/auth";
import * as db from "../../db";
import type { TrpcContext } from "../../_core/context";
import { appRouter } from "../../routers";

vi.mock("../../db", async importOriginal => {
  const actual = await importOriginal<typeof import("../../db")>();
  return {
    ...actual,
    getUserById: vi.fn(),
    updateUserPassword: vi.fn(),
    revokeUserSessions: vi.fn(),
  };
});

vi.mock("../../_core/auth", async importOriginal => {
  const actual = await importOriginal<typeof import("../../_core/auth")>();
  return {
    ...actual,
    clearAuthenticatedSession: vi.fn(),
    hashPassword: vi.fn(),
    setAuthenticatedSession: vi.fn(),
    verifyPassword: vi.fn(),
  };
});

function contextFor(
  overrides: Partial<NonNullable<TrpcContext["user"]>> = {}
): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 9,
      authUserId: "00000000-0000-4000-8000-000000000009",
      name: "Test Officer",
      badgeNumber: null,
      email: "officer@example.com",
      loginMethod: "google",
      role: "user",
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("profile router", () => {
  const caller = () => appRouter.createCaller(contextFor());

  it("returns the authenticated user's profile", async () => {
    const context = contextFor();
    await expect(
      appRouter.createCaller(context).profile.get()
    ).resolves.toEqual(context.user);
  });

  it("allows temporary-password users to access the password-change profile", async () => {
    const context = contextFor({ mustChangePassword: true });
    await expect(
      appRouter.createCaller(context).profile.get()
    ).resolves.toEqual(context.user);
  });

  it("rejects managed-account passwords shorter than twelve characters", async () => {
    await expect(
      appRouter
        .createCaller(contextFor({ role: "admin" }))
        .userManagement.create({
          name: "Test Officer",
          username: "test-officer",
          password: "short",
        })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects names shorter than two characters", async () => {
    await expect(
      caller().profile.update({
        name: "أ",
        badgeNumber: null,
        phone: null,
        rank: null,
        unit: null,
        bio: null,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects profile fields that exceed their validation limits", async () => {
    await expect(
      caller().profile.update({
        name: "ضابط تجريبي",
        badgeNumber: "B".repeat(81),
        phone: null,
        rank: null,
        unit: null,
        bio: null,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires a non-empty current password", async () => {
    await expect(
      caller().profile.changePassword({
        currentPassword: "",
        newPassword: "A-secure-password-123",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires a new password of at least twelve characters", async () => {
    await expect(
      caller().profile.changePassword({
        currentPassword: "current-password",
        newPassword: "short",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("revokes server-side sessions and clears the cookie on logout", async () => {
    const context = contextFor();
    vi.mocked(db.revokeUserSessions).mockResolvedValue(undefined);
    vi.mocked(auth.clearAuthenticatedSession).mockImplementation(() => {});

    await appRouter.createCaller(context).logout();

    expect(db.revokeUserSessions).toHaveBeenCalledWith(9);
    expect(auth.clearAuthenticatedSession).toHaveBeenCalledWith(context.res);
  });

  it("revokes old sessions and refreshes this device", async () => {
    const user = {
      ...contextFor().user!,
      passwordHash: "old-hash",
    } as NonNullable<Awaited<ReturnType<typeof db.getUserById>>>;
    const rotatedAuthUserId = "00000000-0000-4000-8000-000000000099";

    vi.mocked(db.getUserById).mockResolvedValue(user);
    vi.mocked(auth.verifyPassword).mockResolvedValue(true);
    vi.mocked(auth.hashPassword).mockResolvedValue("new-hash");
    vi.mocked(db.updateUserPassword).mockResolvedValue(rotatedAuthUserId);
    vi.mocked(auth.setAuthenticatedSession).mockResolvedValue(undefined);

    try {
      await appRouter.createCaller(contextFor()).profile.changePassword({
        currentPassword: "old-pass",
        newPassword: "new-password-123",
      });

      expect(auth.verifyPassword).toHaveBeenCalledWith("old-pass", "old-hash");
      expect(auth.hashPassword).toHaveBeenCalledWith("new-password-123");
      expect(db.updateUserPassword).toHaveBeenCalledWith(9, "new-hash");
      expect(auth.setAuthenticatedSession).toHaveBeenCalledWith(
        expect.anything(),
        {
          id: user.id,
          role: user.role,
          authUserId: rotatedAuthUserId,
        }
      );
    } finally {
      vi.clearAllMocks();
    }
  });
});
