import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  insert: vi.fn(),
  memberRows: [] as Array<{ userId: unknown }>,
  memberError: null as { message: string } | null,
}));

vi.mock("../../_core/supabase", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));

import {
  listActiveOrganizationMemberIds,
  notifyOrganizationUsers,
} from "../../db";

describe("organization notification recipients", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.memberRows = [];
    mocks.memberError = null;

    const membershipQuery = { select: mocks.select, eq: mocks.eq };
    const notificationQuery = { insert: mocks.insert };
    mocks.from.mockImplementation((table: string) =>
      table === "organization_memberships" ? membershipQuery : notificationQuery
    );
    mocks.select.mockReturnValue(membershipQuery);
  });

  function resolveMembershipQuery(
    rows: Array<{ userId: unknown }>,
    error: { message: string } | null = null
  ) {
    mocks.memberRows = rows;
    mocks.memberError = error;
    const result = { data: rows, error };
    mocks.eq
      .mockReturnValueOnce({ select: mocks.select, eq: mocks.eq })
      .mockReturnValueOnce({ select: mocks.select, eq: mocks.eq })
      .mockReturnValueOnce(Promise.resolve(result));
  }

  it("selects only active memberships in an active organization", async () => {
    const organizationId = "org-active";
    resolveMembershipQuery([
      { userId: 7 },
      { userId: 7 },
      { userId: "12" },
      { userId: 0 },
      { userId: "invalid" },
    ]);

    await expect(
      listActiveOrganizationMemberIds(organizationId)
    ).resolves.toEqual([7, 12]);
    expect(mocks.select).toHaveBeenCalledWith(
      "userId, organizations!inner(isActive)"
    );
    expect(mocks.eq).toHaveBeenNthCalledWith(
      1,
      "organizationId",
      organizationId
    );
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "isActive", true);
    expect(mocks.eq).toHaveBeenNthCalledWith(3, "organizations.isActive", true);
  });

  it("does not insert notifications when the organization is disabled", async () => {
    resolveMembershipQuery([]);

    await notifyOrganizationUsers({
      organizationId: "org-disabled",
      type: "telegram.route.created",
      title: "إحالة جديدة",
      body: "لديك إحالة جديدة",
    });

    expect(mocks.eq).toHaveBeenCalledWith("organizations.isActive", true);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("surfaces recipient-query failures instead of creating notifications", async () => {
    resolveMembershipQuery([], { message: "database unavailable" });

    await expect(
      notifyOrganizationUsers({
        organizationId: "org-active",
        type: "telegram.route.created",
        title: "إحالة جديدة",
        body: "لديك إحالة جديدة",
      })
    ).rejects.toThrow("Failed to load active notification recipients");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
