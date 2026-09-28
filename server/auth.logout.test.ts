import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
  it("reports success while the browser Supabase client owns session teardown", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
  });
});
