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
  listTelegrams: vi.fn(),
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
    mocked.createTelegram.mockImplementation(async input => ({ id: 7, createdAt: new Date(), ...input }));
    mocked.writeAuditLog.mockResolvedValue(undefined);
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
      creatorName: "النقيب أحمد",
      creatorEmail: "ahmad@example.com",
      serialNumber: 1001,
      serialCode: expect.stringMatching(/^POL-\d{4}-\d{2}-\d{2}-\d{5}$/),
    }));
    expect(mocked.createTelegram.mock.calls[0]?.[0]).not.toHaveProperty("creatorName", "مستخدم آخر");
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 42,
      actorName: "النقيب أحمد",
      action: "telegram.create",
      entityType: "telegram",
    }));
  });
});
