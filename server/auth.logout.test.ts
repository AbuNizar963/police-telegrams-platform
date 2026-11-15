import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, revokeUserSessions: vi.fn() };
});

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      authUserId: "00000000-0000-4000-8000-000000000001",
      email: "sample@example.com",
      name: "Sample User",
      badgeNumber: null,
      loginMethod: "google",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { setHeader: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("auth.logout", () => {
  it("revokes server sessions and clears the browser cookie", async () => {
    const context = createAuthContext();
    vi.mocked(db.revokeUserSessions).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(context);
    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
    expect(db.revokeUserSessions).toHaveBeenCalledWith(1);
    expect(context.res.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      expect.stringContaining("Max-Age=0")
    );
  });

  it("clears the browser cookie when server-side revocation fails", async () => {
    const context = createAuthContext();
    vi.mocked(db.revokeUserSessions).mockRejectedValue(
      new Error("database unavailable")
    );
    const caller = appRouter.createCaller(context);

    await expect(caller.auth.logout()).rejects.toThrow(
      "database unavailable"
    );
    expect(context.res.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      expect.stringContaining("Max-Age=0")
    );
  });
});
