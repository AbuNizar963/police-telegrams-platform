import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

const mocked = vi.hoisted(() => ({
  allocateSerialNumber: vi.fn(),
  createTelegram: vi.fn(),
  updateTelegram: vi.fn(),
  purgeTelegramPermanently: vi.fn(),
  getDashboardStats: vi.fn(),
  getMaxSerialNumber: vi.fn(),
  getOrCreateSettings: vi.fn(),
  getOrganizationSettings: vi.fn(),
  getTelegramById: vi.fn(),
  listTelegrams: vi.fn(),
  getTelegramReport: vi.fn(),
  getUserOrganizationId: vi.fn(),
  listUserNotifications: vi.fn(),
  updateDepartmentSettings: vi.fn(),
  writeAuditLog: vi.fn(),
  createLocalOwnerUser: vi.fn(),
  getUserByUsername: vi.fn(),
  recordTelegramAction: vi.fn(),
}));
const organizationMocks = vi.hoisted(() => ({
  getUserOrganizationMembership: vi.fn(),
  getTelegramRouteById: vi.fn(),
  getOrganizationById: vi.fn(),
  approveTelegramRoute: vi.fn(),
  receiveTelegramRoute: vi.fn(),
  decideTelegramRouteAsReceiver: vi.fn(),
  listPendingRouteApprovals: vi.fn(),
}));

vi.mock("./db", () => mocked);
vi.mock("./organization", async importOriginal => {
  const actual = await importOriginal<typeof import("./organization")>();
  return {
    ...actual,
    getUserOrganizationMembership:
      organizationMocks.getUserOrganizationMembership,
    getTelegramRouteById: organizationMocks.getTelegramRouteById,
    getOrganizationById: organizationMocks.getOrganizationById,
    approveTelegramRoute: organizationMocks.approveTelegramRoute,
    receiveTelegramRoute: organizationMocks.receiveTelegramRoute,
    decideTelegramRouteAsReceiver:
      organizationMocks.decideTelegramRouteAsReceiver,
    listPendingRouteApprovals: organizationMocks.listPendingRouteApprovals,
  };
});
const storageMocks = vi.hoisted(() => ({
  storageDelete: vi.fn(),
}));
vi.mock("./storage", async importOriginal => {
  const actual = await importOriginal<typeof import("./storage")>();
  return {
    ...actual,
    storageDelete: storageMocks.storageDelete,
  };
});

function contextFor(role: "admin" | "user"): TrpcContext {
  return {
    user: {
      id: role === "admin" ? 1 : 42,
      authUserId:
        role === "admin"
          ? "00000000-0000-4000-8000-000000000001"
          : "00000000-0000-4000-8000-000000000042",
      name: role === "admin" ? "مدير النظام" : "موظف",
      badgeNumber: null,
      email: role === "admin" ? "admin@example.com" : "officer@example.com",
      loginMethod: "local",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function ownerContextForTest(): TrpcContext {
  const context = contextFor("admin");
  return {
    ...context,
    user: { ...context.user, username: ENV.ownerUsername },
  };
}

const telegram = {
  id: 7,
  serialNumber: 1001,
  serialCode: "POL-2026-09-29-01001",
  createdByUserId: 42,
  creatorName: "موظف",
  creatorEmail: "officer@example.com",
  creatorBadgeId: null,
  organizationId: "00000000-0000-4000-8000-000000000007",
  currentOrganizationId: "00000000-0000-4000-8000-000000000007",
  creatorIp: null,
  creatorFingerprint: null,
  subject: "موضوع سابق",
  recipient: "غرفة العمليات",
  body: "محتوى البرقية السابق",
  classification: "normal" as const,
  priority: "normal" as const,
  category: "security" as const,
  status: "pending" as const,
  attachmentManifest: null,
  gpsLatitude: null,
  gpsLongitude: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const updateInput = {
  id: 7,
  subject: "موضوع معدل",
  recipient: "غرفة العمليات",
  body: "محتوى البرقية المعدل",
  classification: "normal" as const,
  priority: "urgent" as const,
  category: "security" as const,
  status: "pending" as const,
};

describe("telegram administration permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getTelegramById.mockResolvedValue(telegram);
    mocked.getOrganizationSettings.mockResolvedValue(undefined);
    organizationMocks.getUserOrganizationMembership.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000099",
      role: "member",
      isActive: true,
    });
    mocked.updateTelegram.mockImplementation(async (id, values) => ({
      ...telegram,
      ...values,
      id,
      updatedAt: new Date(),
    }));
    mocked.purgeTelegramPermanently.mockResolvedValue({
      telegram,
      attachmentStorageKeys: [],
    });
    storageMocks.storageDelete.mockResolvedValue(undefined);
    mocked.writeAuditLog.mockResolvedValue(undefined);
    mocked.recordTelegramAction.mockResolvedValue(undefined);
  });

  it("rejects update requests from ordinary officers before database access", async () => {
    const caller = appRouter.createCaller(contextFor("user"));

    await expect(caller.telegrams.update(updateInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocked.getTelegramById).not.toHaveBeenCalled();
    expect(mocked.updateTelegram).not.toHaveBeenCalled();
  });

  it("rejects delete requests from ordinary officers before database access", async () => {
    const caller = appRouter.createCaller(contextFor("user"));

    await expect(caller.telegrams.delete({ id: 7 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocked.getTelegramById).not.toHaveBeenCalled();
    expect(mocked.purgeTelegramPermanently).not.toHaveBeenCalled();
    expect(storageMocks.storageDelete).not.toHaveBeenCalled();
  });

  it("allows administrators to update a telegram without changing its creator or serial", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    const result = await caller.telegrams.update(updateInput);

    expect(result.subject).toBe("موضوع معدل");
    expect(mocked.updateTelegram).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        subject: "موضوع معدل",
        priority: "urgent",
      })
    );
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 1,
        action: "telegram.update",
        entityId: "7",
        metadata: expect.stringContaining('"serialNumber":1001'),
      })
    );
  });

  it("scopes the owner telegram list to the active workplace, even when children are requested", async () => {
    const activeOrganizationId = "00000000-0000-4000-8000-000000000099";
    mocked.getUserOrganizationId.mockResolvedValue(activeOrganizationId);
    mocked.listTelegrams.mockResolvedValue([]);
    const caller = appRouter.createCaller(ownerContextForTest());

    await caller.telegrams.list({ organizationScope: "children" });

    const call = mocked.listTelegrams.mock.calls[0];
    expect(call[1]).toBe(false);
    expect(call[2]).toBe(activeOrganizationId);
    expect(call[12]).toBeNull();
  });

  it("keeps global telegram access for administrators who are not the platform owner", async () => {
    mocked.listTelegrams.mockResolvedValue([]);
    const caller = appRouter.createCaller(contextFor("admin"));

    await caller.telegrams.list();

    const call = mocked.listTelegrams.mock.calls[0];
    expect(call[1]).toBe(true);
    expect(call[2]).toBeNull();
  });

  it("counts dashboard telegrams within the owner's active workplace", async () => {
    const activeOrganizationId = "00000000-0000-4000-8000-000000000099";
    mocked.getUserOrganizationId.mockResolvedValue(activeOrganizationId);
    mocked.getDashboardStats.mockResolvedValue({ total: 0 });
    const caller = appRouter.createCaller(ownerContextForTest());

    await caller.dashboard.stats();

    expect(mocked.getDashboardStats).toHaveBeenCalledWith(
      1,
      false,
      activeOrganizationId
    );
  });

  it("keeps report results inside the owner's active workplace", async () => {
    const activeOrganizationId = "00000000-0000-4000-8000-000000000099";
    organizationMocks.getUserOrganizationMembership.mockResolvedValue({
      organizationId: activeOrganizationId,
      role: "member",
      isActive: true,
    });
    mocked.getTelegramReport.mockResolvedValue({ rows: [], total: 0 });
    const caller = appRouter.createCaller(ownerContextForTest());
    const input = { page: 1, pageSize: 10 };

    await caller.reports.telegrams(input);

    expect(mocked.getTelegramReport).toHaveBeenCalledWith(
      input,
      false,
      activeOrganizationId
    );
  });

  it("keeps exported rows inside the owner's active workplace", async () => {
    const activeOrganizationId = "00000000-0000-4000-8000-000000000099";
    mocked.getUserOrganizationId.mockResolvedValue(activeOrganizationId);
    mocked.listTelegrams.mockResolvedValue([]);
    const caller = appRouter.createCaller(ownerContextForTest());

    await caller.telegrams.exportRows();

    const call = mocked.listTelegrams.mock.calls[0];
    expect(call[1]).toBe(false);
    expect(call[2]).toBe(activeOrganizationId);
  });

  it("scopes the owner's notification inbox to the active workplace", async () => {
    const activeOrganizationId = "00000000-0000-4000-8000-000000000099";
    mocked.getUserOrganizationId.mockResolvedValue(activeOrganizationId);
    mocked.listUserNotifications.mockResolvedValue({
      items: [],
      unreadCount: 0,
    });
    const caller = appRouter.createCaller(ownerContextForTest());

    await caller.notifications.inbox();

    expect(mocked.listUserNotifications).toHaveBeenCalledWith(
      1,
      activeOrganizationId
    );
  });

  it("limits owner pending approvals to the active workplace instead of global admin scope", async () => {
    organizationMocks.listPendingRouteApprovals.mockResolvedValue([]);
    const caller = appRouter.createCaller(ownerContextForTest());

    await caller.organizations.pendingApprovals();

    expect(organizationMocks.listPendingRouteApprovals).toHaveBeenCalledWith(
      1,
      false
    );
  });

  it("blocks owner route approvals and receiver decisions outside the active workplace", async () => {
    const activeOrganizationId = "00000000-0000-4000-8000-000000000099";
    const otherOrganizationId = "00000000-0000-4000-8000-000000000098";
    const sourceOrganizationId = "00000000-0000-4000-8000-000000000097";
    organizationMocks.getUserOrganizationMembership.mockResolvedValue({
      organizationId: activeOrganizationId,
      role: "system_admin",
      isActive: true,
    });
    organizationMocks.getTelegramRouteById.mockResolvedValue({
      id: 31,
      fromOrganizationId: sourceOrganizationId,
      toOrganizationId: otherOrganizationId,
    });
    organizationMocks.getOrganizationById.mockResolvedValue({
      id: sourceOrganizationId,
      parentOrganizationId: otherOrganizationId,
    });
    const caller = appRouter.createCaller(ownerContextForTest());

    await expect(
      caller.telegrams.approveRoute({ routeId: 31, approved: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.telegrams.receiveRoute({ routeId: 31 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.telegrams.decideRouteAsReceiver({
        routeId: 31,
        accepted: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(organizationMocks.approveTelegramRoute).not.toHaveBeenCalled();
    expect(organizationMocks.receiveTelegramRoute).not.toHaveBeenCalled();
    expect(
      organizationMocks.decideTelegramRouteAsReceiver
    ).not.toHaveBeenCalled();
  });

  it("blocks the owner from reading, editing, or deleting another workplace's telegram", async () => {
    mocked.getUserOrganizationId.mockResolvedValue(
      "00000000-0000-4000-8000-000000000099"
    );
    const caller = appRouter.createCaller(ownerContextForTest());

    await expect(caller.telegrams.get({ id: 7 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.telegrams.update(updateInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.telegrams.delete({ id: 7 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(mocked.updateTelegram).not.toHaveBeenCalled();
    expect(mocked.purgeTelegramPermanently).not.toHaveBeenCalled();
    expect(storageMocks.storageDelete).not.toHaveBeenCalled();
  });

  it("normalizes edited telegram text to its organization's number system", async () => {
    const organizationId = "00000000-0000-4000-8000-000000000007";
    mocked.getTelegramById.mockResolvedValue({ ...telegram, organizationId });
    mocked.getOrganizationSettings.mockResolvedValue({
      numberSystem: "arabic",
    });
    const caller = appRouter.createCaller(contextFor("admin"));

    await caller.telegrams.update({
      ...updateInput,
      subject: "موضوع 123",
      recipient: "غرفة 4",
      body: "رقم البلاغ ٥٦",
    });

    expect(mocked.updateTelegram).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        subject: "موضوع ١٢٣",
        recipient: "غرفة ٤",
        body: "رقم البلاغ ٥٦",
      })
    );
    expect(mocked.getOrganizationSettings).toHaveBeenCalledWith(organizationId);
  });

  it("permanently removes a telegram for administrators and records its original identity", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    const result = await caller.telegrams.delete({ id: 7 });

    expect(result).toEqual({
      success: true,
      id: 7,
      serialCode: "POL-2026-09-29-01001",
      permanent: true,
      deletedAttachmentCount: 0,
      pendingStorageCleanup: 0,
    });
    expect(mocked.purgeTelegramPermanently).toHaveBeenCalledWith(7);
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 1,
        action: "telegram.delete",
        entityId: "7",
        metadata: expect.stringContaining('"mode":"permanent"'),
      })
    );
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.stringContaining('"createdByUserId":42'),
      })
    );
  });

  it("cleans up stored attachment objects when the telegram is deleted", async () => {
    mocked.purgeTelegramPermanently.mockResolvedValue({
      telegram,
      attachmentStorageKeys: [
        "telegrams/7/report.pdf",
        "telegrams/7/photo.jpg",
      ],
    });
    const caller = appRouter.createCaller(contextFor("admin"));
    const result = await caller.telegrams.delete({ id: 7 });

    expect(storageMocks.storageDelete).toHaveBeenCalledTimes(2);
    expect(storageMocks.storageDelete).toHaveBeenCalledWith(
      "telegrams/7/report.pdf"
    );
    expect(result.deletedAttachmentCount).toBe(2);
    expect(result.pendingStorageCleanup).toBe(0);
  });

  it("still removes the telegram when one stored object cannot be cleaned", async () => {
    mocked.purgeTelegramPermanently.mockResolvedValue({
      telegram,
      attachmentStorageKeys: [
        "telegrams/7/report.pdf",
        "telegrams/7/photo.jpg",
      ],
    });
    storageMocks.storageDelete.mockRejectedValueOnce(
      new Error("Storage provider does not support cleanup")
    );
    const caller = appRouter.createCaller(contextFor("admin"));
    const result = await caller.telegrams.delete({ id: 7 });

    expect(result.success).toBe(true);
    expect(result.deletedAttachmentCount).toBe(2);
    expect(result.pendingStorageCleanup).toBe(1);
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.stringContaining(
          '"pendingStorageCleanup":["telegrams/7/report.pdf"]'
        ),
      })
    );
  });

  it("reports a missing telegram when the record is already gone", async () => {
    mocked.purgeTelegramPermanently.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(contextFor("admin"));

    await expect(caller.telegrams.delete({ id: 7 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocked.writeAuditLog).not.toHaveBeenCalled();
  });
});
