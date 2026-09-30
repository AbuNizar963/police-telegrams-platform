import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, select, eq, order, limit, maybeSingle, insert, upsert, single, rpc } =
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
    const rpc = vi.fn();

    from.mockReturnValue({ select, insert, upsert });
    select.mockReturnValue({ eq, single });
    eq.mockReturnValue({ eq, order, limit, maybeSingle });
    order.mockReturnValue({ limit });
    limit.mockReturnValue({ maybeSingle });
    insert.mockReturnValue({ select });
    upsert.mockReturnValue({ select });
    return { from, select, eq, order, limit, maybeSingle, insert, upsert, single, rpc };
  });

vi.mock("./_core/supabase", () => ({
  getSupabaseAdmin: vi.fn(() => ({ from, rpc })),
}));

import {
  addOrganizationMembership,
  getUserOrganizationMembership,
} from "./organization";

describe("organization repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({
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


  it("routes through the atomic database function using the member organization as source", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        id: 9,
        telegramId: 100,
        fromOrganizationId: "00000000-0000-0000-0000-000000000001",
        toOrganizationId: "00000000-0000-0000-0000-000000000002",
        forwardedByUserId: 7,
        status: "sent",
        note: "إحالة إلى القيادة",
        createdAt: "2026-10-01T00:00:00.000Z",
        receivedAt: null,
        completedAt: null,
      },
      error: null,
    });

    await expect(
      (await import("./organization")).routeTelegram({
        telegramId: 100,
        toOrganizationId: "00000000-0000-0000-0000-000000000002",
        forwardedByUserId: 7,
        note: "إحالة إلى القيادة",
      }),
    ).resolves.toMatchObject({
      id: 9,
      telegramId: 100,
      status: "sent",
    });

    expect(rpc).toHaveBeenCalledWith("route_telegram", {
      p_telegram_id: 100,
      p_from_organization_id: "00000000-0000-0000-0000-000000000001",
      p_to_organization_id: "00000000-0000-0000-0000-000000000002",
      p_forwarded_by_user_id: 7,
      p_note: "إحالة إلى القيادة",
    });
  });
