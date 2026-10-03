import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocked = vi.hoisted(() => ({
  allocateSerialNumber: vi.fn(),
  createTelegram: vi.fn(),
  updateTelegram: vi.fn(),
  purgeTelegramPermanently: vi.fn(),
  getDashboardStats: vi.fn(),
  getMaxSerialNumber: vi.fn(),
  getOrCreateSettings: vi.fn(),
  getTelegramById: vi.fn(),
  listTelegrams: vi.fn(),
  updateDepartmentSettings: vi.fn(),
  writeAuditLog: vi.fn(),
  createLocalOwnerUser: vi.fn(),
  getUserByUsername: vi.fn(),
  recordTelegramAction: vi.fn(),
}));

vi.mock("./db", () => mocked);
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

const telegram = {
  id: 7,
  serialNumber: 1001,
  serialCode: "POL-2026-09-29-01001",
  createdByUserId: 42,
  creatorName: "موظف",
  creatorEmail: "officer@example.com",
  creatorBadgeId: null,
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
