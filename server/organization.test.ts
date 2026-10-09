import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  const select = vi.fn();
  const eq = vi.fn();
  const order = vi.fn();
  const limit = vi.fn();
  const maybeSingle = vi.fn();
  const insert = vi.fn();
  const upsert = vi.fn();
  const update = vi.fn();
  const single = vi.fn();
  const rpc = vi.fn();

  from.mockReturnValue({ select, insert, upsert, update });
  select.mockReturnValue({ eq, single });
  eq.mockReturnValue({ eq, order, limit, maybeSingle, select });
  order.mockReturnValue({ limit });
  limit.mockReturnValue({ maybeSingle });
  insert.mockReturnValue({ select });
  upsert.mockReturnValue({ select });
  update.mockReturnValue({ eq });

  return {
    from,
    select,
    eq,
    order,
    limit,
    maybeSingle,
    insert,
    upsert,
    update,
    single,
    rpc,
  };
});

vi.mock("./_core/supabase", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

import {
  addOrganizationMembership,
  getUserOrganizationMembership,
  routeTelegram,
  selectPlatformOwnerWorkplace,
  updateOrganization,
} from "./organization";
import { ENV } from "./_core/env";

describe("organization repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeSingle.mockResolvedValue({
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
    await expect(getUserOrganizationMembership(7)).resolves.toMatchObject({
      userId: 7,
      organizationId: "00000000-0000-0000-0000-000000000001",
      role: "dispatcher",
    });
  });

  it("writes a membership with an active role", async () => {
    mocks.single.mockResolvedValueOnce({
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
      })
    ).resolves.toMatchObject({ role: "reviewer", userId: 7 });

    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        organizationId: "00000000-0000-0000-0000-000000000001",
        userId: 7,
        role: "reviewer",
        isActive: true,
      },
      { onConflict: "organizationId,userId" }
    );
  });

  it("routes through the atomic database function using the member organization as source", async () => {
    mocks.rpc.mockResolvedValueOnce({
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
      routeTelegram({
        telegramId: 100,
        toOrganizationId: "00000000-0000-0000-0000-000000000002",
        forwardedByUserId: 7,
        note: "إحالة إلى القيادة",
      })
    ).resolves.toMatchObject({
      id: 9,
      telegramId: 100,
      status: "sent",
    });

    expect(mocks.rpc).toHaveBeenCalledWith("route_telegram", {
      p_telegram_id: 100,
      p_from_organization_id: "00000000-0000-0000-0000-000000000001",
      p_to_organization_id: "00000000-0000-0000-0000-000000000002",
      p_forwarded_by_user_id: 7,
      p_note: "إحالة إلى القيادة",
      p_allow_draft: false,
    });
  });

  it("changes the owner's active organization through the atomic RPC", async () => {
    const organizationId = "00000000-0000-0000-0000-000000000009";
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: organizationId,
        code: "GOV-ALEPPO",
        name: "قيادة الأمن الداخلي في حلب",
        type: "governorate",
        isActive: true,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      selectPlatformOwnerWorkplace({
        user: { id: 1, username: ENV.ownerUsername, role: "admin" },
        organizationId,
      })
    ).resolves.toMatchObject({
      id: organizationId,
      name: "قيادة الأمن الداخلي في حلب",
    });

    expect(mocks.rpc).toHaveBeenCalledWith("set_owner_workplace", {
      p_user_id: 1,
      p_organization_id: organizationId,
    });
  });

  it("allows updating the root central organization without a parent", async () => {
    const organizationId = "00000000-0000-4000-8000-000000000010";
    mocks.single.mockResolvedValueOnce({
      data: {
        id: organizationId,
        code: "CENTRAL",
        name: "القيادة المركزية المحدثة",
        type: "central",
        parentOrganizationId: null,
        telegramDestinationOrganizationId: null,
        isActive: true,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-09T00:00:00.000Z",
      },
      error: null,
    });

    await expect(
      updateOrganization({
        id: organizationId,
        code: "CENTRAL",
        name: "القيادة المركزية المحدثة",
        type: "central",
        parentOrganizationId: null,
        telegramDestinationOrganizationId: null,
        isActive: true,
      })
    ).resolves.toMatchObject({
      id: organizationId,
      name: "القيادة المركزية المحدثة",
      type: "central",
      parentOrganizationId: null,
    });

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ parentOrganizationId: null })
    );
  });

  it("rejects workplace selection for a non-owner before touching the database", async () => {
    await expect(
      selectPlatformOwnerWorkplace({
        user: { id: 8, username: "department-admin", role: "admin" },
        organizationId: "00000000-0000-0000-0000-000000000009",
      })
    ).rejects.toThrow("لا تملك صلاحية تغيير جهة العمل");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not select a missing or inactive organization", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      selectPlatformOwnerWorkplace({
        user: { id: 1, username: ENV.ownerUsername, role: "admin" },
        organizationId: "00000000-0000-0000-0000-000000000009",
      })
    ).rejects.toThrow("الجهة غير موجودة أو غير مفعّلة");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
