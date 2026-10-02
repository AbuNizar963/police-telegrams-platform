import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocked = vi.hoisted(() => ({
  allocateSerialNumber: vi.fn(),
  createTelegram: vi.fn(),
  writeAuditLog: vi.fn(),
  getDashboardStats: vi.fn(),
  getMaxSerialNumber: vi.fn(),
  getOrCreateSettings: vi.fn(),
  getTelegramById: vi.fn(),
  listTelegrams: vi.fn(),
  updateDepartmentSettings: vi.fn(),
  getUserOrganizationId: vi.fn(),
  getTelegramByIdempotencyKey: vi.fn(),
  recordTelegramAction: vi.fn(),
  recordTelegramVersion: vi.fn(),
  getConfiguredTelegramDestination: vi.fn(),
  routeTelegram: vi.fn(),
}));

vi.mock("./db", () => mocked);
vi.mock("./organization", async importOriginal => {
  const actual = await importOriginal<typeof import("./organization")>();
  return {
    ...actual,
    getConfiguredTelegramDestination: mocked.getConfiguredTelegramDestination,
    routeTelegram: mocked.routeTelegram,
  };
});

function createContext(): TrpcContext {
  return {
    user: {
      id: 42,
      authUserId: "00000000-0000-4000-8000-000000000042",
      name: "النقيب أحمد",
      badgeNumber: null,
      email: "ahmad@example.com",
      loginMethod: "google",
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
    mocked.getUserOrganizationId.mockResolvedValue(
      "00000000-0000-0000-0000-000000000001"
    );
    mocked.getOrCreateSettings.mockResolvedValue({
      serialPrefix: "POL",
      timezone: "Asia/Riyadh",
    });
    mocked.createTelegram.mockImplementation(async input => ({
      id: 7,
      createdAt: new Date(),
      ...input,
    }));
    mocked.writeAuditLog.mockResolvedValue(undefined);
    mocked.getTelegramByIdempotencyKey.mockResolvedValue(undefined);
    mocked.recordTelegramAction.mockResolvedValue(undefined);
    mocked.recordTelegramVersion.mockResolvedValue(undefined);
    mocked.getConfiguredTelegramDestination.mockResolvedValue(null);
    mocked.routeTelegram.mockResolvedValue(undefined);
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
        organizationId: "00000000-0000-0000-0000-000000000001",
        currentOrganizationId: "00000000-0000-0000-0000-000000000001",
        creatorName: "النقيب أحمد",
        creatorEmail: "ahmad@example.com",
        creatorFingerprint: "00000000-0000-4000-8000-000000000042",
        serialNumber: 1001,
        serialCode: expect.stringMatching(/^POL-\d{4}-\d{2}-\d{2}-\d{5}$/),
        verificationToken: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      })
    );
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 42,
        actorName: "النقيب أحمد",
        action: "telegram.create",
        entityType: "telegram",
      })
    );
    expect(mocked.routeTelegram).not.toHaveBeenCalled();
  });

  it("returns the persisted telegram when a concurrent retry wins the idempotency race", async () => {
    const caller = appRouter.createCaller(createContext());
    const persistedTelegram = {
      id: 88,
      serialNumber: 1002,
      serialCode: "POL-2026-10-02-01002",
      status: "draft",
    };
    mocked.createTelegram.mockRejectedValueOnce(
      new Error("duplicate key value violates unique constraint")
    );
    mocked.getTelegramByIdempotencyKey
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(persistedTelegram);

    await expect(
      caller.telegrams.create({
        subject: "تنبيه أمني",
        recipient: "غرفة العمليات",
        body: "محتوى البرقية للاختبار",
        classification: "normal",
        priority: "urgent",
        category: "security",
        idempotencyKey: "create-telegram-race-0001",
      })
    ).resolves.toEqual(persistedTelegram);

    expect(mocked.writeAuditLog).not.toHaveBeenCalled();
    expect(mocked.recordTelegramAction).not.toHaveBeenCalled();
    expect(mocked.recordTelegramVersion).not.toHaveBeenCalled();
  });

  it("routes a new telegram to the organization configured for the source unit", async () => {
    const destination = {
      id: "00000000-0000-0000-0000-000000000002",
      name: "قيادة المنطقة",
    };
    const routedTelegram = {
      id: 7,
      serialNumber: 1001,
      serialCode: "POL-2026-10-02-01001",
      status: "forwarded",
      currentOrganizationId: destination.id,
    };
    mocked.getConfiguredTelegramDestination.mockResolvedValue(destination);
    mocked.getTelegramById.mockResolvedValue(routedTelegram);

    const caller = appRouter.createCaller(createContext());
    await expect(
      caller.telegrams.create({
        subject: "إحالة اختبارية",
        recipient: "قيادة المنطقة",
        body: "محتوى البرقية للاختبار",
        classification: "normal",
        priority: "normal",
        category: "administrative",
      })
    ).resolves.toEqual(routedTelegram);

    expect(mocked.routeTelegram).toHaveBeenCalledWith({
      telegramId: 7,
      toOrganizationId: destination.id,
      forwardedByUserId: 42,
      note: "إحالة تلقائية إلى الجهة المحددة للقسم أو المخفر",
    });
  });
});
