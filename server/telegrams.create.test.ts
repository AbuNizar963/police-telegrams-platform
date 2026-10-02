import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocked = vi.hoisted(() => ({
  allocateSerialNumber: vi.fn(),
  createTelegram: vi.fn(),
  writeAuditLog: vi.fn(),
  getDashboardStats: vi.fn(),
  getOrCreateSettings: vi.fn(),
  getTelegramById: vi.fn(),
  getTelegramByIdempotencyKey: vi.fn(),
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
    mocked.createTelegram.mockImplementation(async input => ({
      id: 7,
      createdAt: new Date(),
      ...input,
    }));
    mocked.writeAuditLog.mockResolvedValue(undefined);
    mocked.getTelegramByIdempotencyKey.mockResolvedValue(undefined);
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
    expect(mocked.createTelegram).toHaveBeenCalledWith(
      expect.objectContaining({
        createdByUserId: 42,
        creatorName: "النقيب أحمد",
        creatorEmail: "ahmad@example.com",
        serialNumber: 1001,
        serialCode: expect.stringMatching(/^POL-\d{4}-\d{2}-\d{2}-\d{5}$/),
      })
    );
    expect(mocked.createTelegram.mock.calls[0]?.[0]).not.toHaveProperty(
      "creatorName",
      "مستخدم آخر"
    );
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
    expect(mocked.createTelegram).toHaveBeenCalledTimes(1);
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
});
