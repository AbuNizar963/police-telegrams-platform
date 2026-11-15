import { describe, expect, it, vi } from "vitest";
import * as auth from "../../_core/auth";
import * as db from "../../db";
import { appRouter } from "../../routers";
import type { TrpcContext } from "../../_core/context";

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

  it("revokes previous sessions and refreshes the current session after password change", async () => {
    const originalUser = {
      ...contextFor().user!,
      passwordHash: "current-hash",
    } as NonNullable<Awaited<ReturnType<typeof db.getUserById>>>;
    const refreshedUser = {
      ...originalUser,
      authUserId: "00000000-0000-4000-8000-000000000099",
    };

    const getUser = vi.spyOn(db, "getUserById")
      .mockResolvedValueOnce(originalUser)
      .mockResolvedValueOnce(refreshedUser);
    const verify = vi.spyOn(auth, "verifyPassword").mockResolvedValue(true);
    const hash = vi.spyOn(auth, "hashPassword").mockResolvedValue("new-password-hash");
    const update = vi.spyOn(db, "updateUserPassword").mockResolvedValue();
    const refreshSession = vi.spyOn(auth, "setAuthenticatedSession").mockResolvedValue();

    try {
      await appRouter.createCaller(contextFor()).profile.changePassword({
        currentPassword: "current-password",
        newPassword: "new-password-123",
      });

      expect(verify).toHaveBeenCalledWith("current-password", "current-hash");
      expect(hash).toHaveBeenCalledWith("new-password-123");
      expect(update).toHaveBeenCalledWith(9, "new-password-hash");
      expect(getUser).toHaveBeenCalledTimes(2);
      expect(refreshSession).toHaveBeenCalledWith(expect.anything(), refreshedUser);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
