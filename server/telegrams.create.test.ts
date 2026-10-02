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
}));

vi.mock("./db", () => mocked);

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
      "00000000-0000-0000-0000-000000000001",
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
    expect(mocked.createTelegram).toHaveBeenCalledWith(expect.objectContaining({
      createdByUserId: 42,
      organizationId: "00000000-0000-0000-0000-000000000001",
      currentOrganizationId: "00000000-0000-0000-0000-000000000001",
      creatorName: "النقيب أحمد",
      creatorEmail: "ahmad@example.com",
      creatorFingerprint: "00000000-0000-4000-8000-000000000042",
      serialNumber: 1001,
      serialCode: expect.stringMatching(/^POL-\d{4}-\d{2}-\d{2}-\d{5}$/),
      verificationToken: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    }));
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 42,
      actorName: "النقيب أحمد",
      action: "telegram.create",
      entityType: "telegram",
    }));
  });
});
