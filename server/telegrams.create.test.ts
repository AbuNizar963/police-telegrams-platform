import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocked = vi.hoisted(() => ({
  allocateSerialNumber: vi.fn(),
  createTelegramWithAttachments: vi.fn(),
  writeAuditLog: vi.fn(),
  getDashboardStats: vi.fn(),
  getOrCreateSettings: vi.fn(),
  getTelegramById: vi.fn(),
  getTelegramByIdempotencyKey: vi.fn(),
  listTelegramAttachments: vi.fn(),
  listTelegrams: vi.fn(),
  updateTelegramStatus: vi.fn(),
}));

vi.mock("./data/database", () => mocked);

function createContext(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "officer-42",
      name: "النقيب أحمد",
      email: "ahmad@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("telegrams.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.allocateSerialNumber.mockResolvedValue(1001);
    mocked.createTelegramWithAttachments.mockImplementation(async input => ({
      id: 7,
      createdAt: new Date(),
      ...input,
    }));
    mocked.writeAuditLog.mockResolvedValue(undefined);
    mocked.getTelegramByIdempotencyKey.mockResolvedValue(undefined);
    mocked.listTelegramAttachments.mockResolvedValue([]);
  });

  it("uses the authenticated officer identity instead of accepting a client-supplied author", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.telegrams.create({
      subject: "تنبيه أمني",
      recipient: "غرفة العمليات",
      body: "محتوى البرقية للاختبار",
      classification: "normal",
      priority: "urgent",
      category: "security",
    });

    expect(result?.serialNumber).toBe(1001);
    expect(mocked.createTelegramWithAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        createdByUserId: 42,
        creatorName: "النقيب أحمد",
        creatorEmail: "ahmad@example.com",
        serialNumber: 1001,
        serialCode: expect.stringMatching(/^POL-\d{4}-\d{2}-\d{2}-\d{5}$/),
      }),
      []
    );
    expect(
      mocked.createTelegramWithAttachments.mock.calls[0]?.[0]
    ).not.toHaveProperty("creatorName", "مستخدم آخر");
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 42,
        actorName: "النقيب أحمد",
        action: "telegram.create",
        entityType: "telegram",
      })
    );
  });

  it("returns the existing telegram for a repeated idempotency key", async () => {
    const caller = appRouter.createCaller(createContext());
    const input = {
      idempotencyKey: "telegram-retry-key-42",
      subject: "تنبيه مكرر",
      recipient: "غرفة العمليات",
      body: "يجب ألا ينشئ هذا الطلب سجلين",
      classification: "normal" as const,
      priority: "normal" as const,
      category: "administrative" as const,
    };
    const first = await caller.telegrams.create(input);
    mocked.getTelegramByIdempotencyKey.mockResolvedValue(first);
    const second = await caller.telegrams.create(input);

    expect(second).toEqual(first);
    expect(mocked.createTelegramWithAttachments).toHaveBeenCalledTimes(1);
  });

  it("passes validated attachment metadata into the atomic transaction", async () => {
    const caller = appRouter.createCaller(createContext());
    const checksum = "a".repeat(64);

    await caller.telegrams.create({
      subject: "بلاغ مرفق",
      recipient: "غرفة العمليات",
      body: "تسجيل مرفق مرتبط بالبرقية",
      classification: "normal",
      priority: "normal",
      category: "administrative",
      attachmentManifest: JSON.stringify([
        {
          fileKey: "telegrams/42/report.png",
          fileName: "report.png",
          contentType: "image/png",
          size: 16,
          checksumSha256: checksum,
        },
      ]),
    });

    expect(mocked.createTelegramWithAttachments).toHaveBeenLastCalledWith(
      expect.objectContaining({ attachmentManifest: expect.any(String) }),
      [
        expect.objectContaining({
          fileKey: "telegrams/42/report.png",
          fileName: "report.png",
          contentType: "image/png",
          size: 16,
          checksumSha256: checksum,
          uploadedByUserId: 42,
          scanStatus: "pending",
        }),
      ]
    );
  });

  it("returns attachment metadata for an authorized telegram detail", async () => {
    const telegram = {
      id: 7,
      status: "pending" as const,
      createdByUserId: 42,
      subject: "بلاغ محفوظ",
    };
    const attachments = [
      {
        id: 3,
        telegramId: 7,
        fileKey: "telegrams/42/report.png",
        fileName: "report.png",
        contentType: "image/png",
        size: 16,
        checksumSha256: "a".repeat(64),
        uploadedByUserId: 42,
        scanStatus: "pending" as const,
        createdAt: new Date(),
      },
    ];
    mocked.getTelegramById.mockResolvedValue(telegram);
    mocked.listTelegramAttachments.mockResolvedValue(attachments);

    const caller = appRouter.createCaller(createContext());
    const result = await caller.telegrams.get({ id: 7 });

    expect(result.attachments).toEqual(attachments);
    expect(mocked.listTelegramAttachments).toHaveBeenCalledWith(7);
  });

  it("allows administrators to move a telegram through the supported lifecycle", async () => {
    const adminContext = createContext();
    adminContext.user = { ...adminContext.user, role: "admin" };
    const existing = {
      id: 7,
      status: "pending" as const,
      createdByUserId: 42,
    };
    mocked.getTelegramById.mockResolvedValue(existing);
    mocked.updateTelegramStatus.mockResolvedValue({
      ...existing,
      status: "in_progress",
    });
    const caller = appRouter.createCaller(adminContext);

    const result = await caller.telegrams.updateStatus({
      id: 7,
      status: "in_progress",
      reason: "تمت إحالة البرقية إلى القسم المختص",
    });

    expect(result?.status).toBe("in_progress");
    expect(mocked.updateTelegramStatus).toHaveBeenCalledWith(
      7,
      "in_progress",
      null
    );
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "telegram.status.in_progress",
        entityId: "7",
      })
    );
  });

  it("rejects lifecycle changes from non-administrators", async () => {
    mocked.getTelegramById.mockResolvedValue({
      id: 7,
      status: "pending" as const,
      createdByUserId: 42,
    });
    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.telegrams.updateStatus({ id: 7, status: "in_progress" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocked.updateTelegramStatus).not.toHaveBeenCalled();
  });

  it("rejects a backward lifecycle transition", async () => {
    const adminContext = createContext();
    adminContext.user = { ...adminContext.user, role: "admin" };
    mocked.getTelegramById.mockResolvedValue({
      id: 7,
      status: "resolved" as const,
      createdByUserId: 42,
    });
    const caller = appRouter.createCaller(adminContext);

    await expect(
      caller.telegrams.updateStatus({ id: 7, status: "in_progress" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocked.updateTelegramStatus).not.toHaveBeenCalled();
  });

  it("audits attachment cleanup when telegram persistence fails", async () => {
    mocked.createTelegramWithAttachments.mockRejectedValueOnce(
      new Error("database unavailable")
    );
    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.telegrams.create({
        subject: "بلاغ مع مرفق",
        recipient: "غرفة العمليات",
        body: "يجب تسجيل المرفق اليتيم عند فشل الحفظ",
        classification: "normal",
        priority: "normal",
        category: "administrative",
        attachmentManifest: JSON.stringify([
          {
            fileKey: "telegrams/42/report.png",
            fileName: "report.png",
            contentType: "image/png",
            size: 16,
          },
        ]),
      })
    ).rejects.toThrow("database unavailable");

    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "attachment.orphaned",
        entityType: "telegram_attachment",
        metadata: expect.stringContaining("telegrams/42/report.png"),
      })
    );
  });
});
