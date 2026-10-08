import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocked = vi.hoisted(() => ({
  getOrCreateSettings: vi.fn(),
  getMaxSerialNumber: vi.fn(),
  updateDepartmentSettings: vi.fn(),
  writeAuditLog: vi.fn(),
  getUserOrganizationMembership: vi.fn(),
}));

vi.mock("./db", () => mocked);
vi.mock("./organization", async importOriginal => {
  const actual = await importOriginal<typeof import("./organization")>();
  return {
    ...actual,
    getUserOrganizationMembership: mocked.getUserOrganizationMembership,
  };
});

function adminContext(): TrpcContext {
  return {
    user: {
      id: 9,
      authUserId: "00000000-0000-4000-8000-000000000009",
      name: "مدير الجهة",
      badgeNumber: null,
      email: "admin@example.com",
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const settings = {
  id: 3,
  departmentName: "قسم الاختبار",
  unitName: "وحدة العمليات",
  unitChiefRank: "العقيد",
  unitChiefName: "رئيس الوحدة",
  serialPrefix: "OUT",
  incomingSerialPrefix: "IN",
  serialStart: 1,
  incomingSerialStart: 1,
  nextSerial: 1,
  nextOutgoingSerial: 1,
  nextIncomingSerial: 1,
  timezone: "Asia/Riyadh",
  dateFormat: "dd/MM/yyyy HH:mm:ss",
  numberSystem: "latin" as const,
  logoUrl: null,
};

describe("department telegram serial prefixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getOrCreateSettings.mockResolvedValue(settings);
    mocked.getMaxSerialNumber.mockResolvedValue(0);
    mocked.updateDepartmentSettings.mockResolvedValue(settings);
    mocked.writeAuditLog.mockResolvedValue(undefined);
    mocked.getUserOrganizationMembership.mockResolvedValue({
      organizationId: "00000000-0000-0000-0000-000000000003",
      userId: 9,
      role: "organization_admin",
      isActive: true,
    });
  });

  it("stores separate outgoing and incoming prefixes", async () => {
    const caller = appRouter.createCaller(adminContext());

    await caller.settings.update({
      departmentName: "قسم الاختبار",
      unitName: "وحدة العمليات",
      unitChiefRank: "العقيد",
      unitChiefName: "رئيس الوحدة",
      serialPrefix: "OUT",
      incomingSerialPrefix: "IN",
      serialStart: 50,
      incomingSerialStart: 900,
      timezone: "Asia/Riyadh",
      dateFormat: "dd/MM/yyyy HH:mm:ss",
      numberSystem: "latin",
      logoUrl: null,
    });

    expect(mocked.updateDepartmentSettings).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        serialPrefix: "OUT",
        incomingSerialPrefix: "IN",
        serialStart: 50,
        incomingSerialStart: 900,
      })
    );
  });
});
