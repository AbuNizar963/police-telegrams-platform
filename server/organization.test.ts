import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, select, eq, order, limit, maybeSingle, insert, upsert, single } =
  vi.hoisted(() => {
    const from = vi.fn();
    const select = vi.fn();
    const eq = vi.fn();
    const order = vi.fn();
    const limit = vi.fn();
    const maybeSingle = vi.fn();
    const insert = vi.fn();
    const upsert = vi.fn();
    const single = vi.fn();

    from.mockReturnValue({ select, insert, upsert });
    select.mockReturnValue({ eq, single });
    eq.mockReturnValue({ eq, order, limit, maybeSingle });
    order.mockReturnValue({ limit });
    limit.mockReturnValue({ maybeSingle });
    insert.mockReturnValue({ select });
    upsert.mockReturnValue({ select });
    return { from, select, eq, order, limit, maybeSingle, insert, upsert, single };
  });

vi.mock("./_core/supabase", () => ({
  getSupabaseAdmin: vi.fn(() => ({ from })),
}));

import {
  addOrganizationMembership,
  getUserOrganizationMembership,
} from "./organization";

describe("organization repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the active organization membership for a user", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: {
        id: 1,
        organizationId: "00000000-0000-0000-0000-000000000001",
        userId: 7,
        role: "dispatcher",
        isActive: true,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      error: null,
    });

    await expect(getUserOrganizationMembership(7)).resolves.toMatchObject({
      userId: 7,
      organizationId: "00000000-0000-0000-0000-000000000001",
      role: "dispatcher",
    });
  });

  it("writes a membership with an active role", async () => {
    single.mockResolvedValueOnce({
      data: {
        id: 2,
        organizationId: "00000000-0000-0000-0000-000000000001",
        userId: 7,
        role: "reviewer",
        isActive: true,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      error: null,
    });

    await expect(
      addOrganizationMembership({
        organizationId: "00000000-0000-0000-0000-000000000001",
        userId: 7,
        role: "reviewer",
      }),
    ).resolves.toMatchObject({ role: "reviewer", userId: 7 });

    expect(upsert).toHaveBeenCalledWith(
      {
        organizationId: "00000000-0000-0000-0000-000000000001",
        userId: 7,
        role: "reviewer",
        isActive: true,
      },
      { onConflict: "organizationId,userId" },
    );
  });
});
