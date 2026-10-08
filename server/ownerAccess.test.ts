import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("./_core/supabase", () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: mocks.from })),
}));

import { ENV } from "./_core/env";
import { isPlatformOwner, isPlatformOwnerUserId } from "./ownerAccess";

describe("isPlatformOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  });

  it("recognizes only the configured owner account with an admin role", () => {
    expect(
      isPlatformOwner({ username: ENV.ownerUsername, role: "admin" })
    ).toBe(true);
    expect(
      isPlatformOwner({
        username: ` ${ENV.ownerUsername.toUpperCase()} `,
        role: "admin",
      })
    ).toBe(true);
  });

  it("does not grant the owner flag to another administrator or a non-admin", () => {
    expect(isPlatformOwner({ username: "another-admin", role: "admin" })).toBe(
      false
    );
    expect(isPlatformOwner({ username: ENV.ownerUsername, role: "user" })).toBe(
      false
    );
    expect(isPlatformOwner(null)).toBe(false);
  });

  it("looks up only identity fields when a membership change targets a user", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { id: 1, username: ENV.ownerUsername, role: "admin" },
      error: null,
    });

    await expect(isPlatformOwnerUserId(1)).resolves.toBe(true);
    expect(mocks.select).toHaveBeenCalledWith("id, username, role");
    expect(mocks.eq).toHaveBeenCalledWith("id", 1);
  });

  it("propagates lookup errors instead of allowing an uncertain assignment", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "lookup failed" },
    });

    await expect(isPlatformOwnerUserId(1)).rejects.toThrow("lookup failed");
  });
});
