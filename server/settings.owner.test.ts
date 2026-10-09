import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

const mocks = vi.hoisted(() => ({
  getOrganizationByIdIncludingInactive: vi.fn(),
  getOrganizationSettings: vi.fn(),
  upsertOrganizationSettingsForOrganization: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("./db", () => ({
  getOrganizationSettings: mocks.getOrganizationSettings,
  upsertOrganizationSettingsForOrganization:
    mocks.upsertOrganizationSettingsForOrganization,
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("./organization", async importOriginal => {
  const actual = await importOriginal<typeof import("./organization")>();
  return {
    ...actual,
    getOrganizationByIdIncludingInactive:
      mocks.getOrganizationByIdIncludingInactive,
  };
});

function ownerContext(): TrpcContext {
  return {
    user: {
      id: 1,
      authUserId: "00000000-0000-4000-8000-000000000001",
      name: "مالك المنصة",
      badgeNumber: null,
      email: "owner@example.com",
      loginMethod: "local",
      username: ENV.ownerUsername,
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const organizationA = {
  id: "00000000-0000-4000-8000-000000000101",
  code: "TEST-OWNER-A",
  name: "قيادة الاختبار الأولى",
};
const organizationB = {
  id: "00000000-0000-4000-8000-000000000102",
  code: "TEST-OWNER-B",
  name: "قيادة الاختبار الثانية",
};

function settingsInput(organizationId: string) {
  return {
    organizationId,
    departmentName: "قسم 718",
    unitName: "وحدة 2",
    unitChiefRank: "عقيد 3",
    unitChiefName: "رئيس 4",
    serialPrefix: "718",
    incomingSerialPrefix: "IN",
    serialStart: 700,
    incomingSerialStart: 900,
    timezone: "Asia/Damascus",
    dateFormat: "dd/MM/yyyy HH:mm:ss",
    numberSystem: "arabic" as const,
    logoUrl: null,
  };
}

describe("platform owner organization settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationByIdIncludingInactive.mockImplementation(
      async (organizationId: string) =>
        [organizationA, organizationB].find(item => item.id === organizationId)
    );
    mocks.getOrganizationSettings.mockResolvedValue(undefined);
    mocks.upsertOrganizationSettingsForOrganization.mockImplementation(
      async (organizationId: string, values: Record<string, unknown>) => ({
        id: organizationId === organizationA.id ? 11 : 12,
        organizationId,
        ...values,
      })
    );
    mocks.writeAuditLog.mockResolvedValue(undefined);
  });

  it("returns explicit unsaved defaults and saves separate settings by organization id", async () => {
    const caller = appRouter.createCaller(ownerContext());

    const defaults = await caller.organizations.settings.get({
      organizationId: organizationA.id,
    });
    expect(defaults).toMatchObject({
      organizationId: organizationA.id,
      departmentName: organizationA.name,
      serialPrefix: "POL",
      settingsExists: false,
    });

    await caller.organizations.settings.update(settingsInput(organizationA.id));
    await caller.organizations.settings.update(settingsInput(organizationB.id));

    expect(
      mocks.upsertOrganizationSettingsForOrganization.mock.calls.map(
        ([organizationId]) => organizationId
      )
    ).toEqual([organizationA.id, organizationB.id]);
    expect(
      mocks.upsertOrganizationSettingsForOrganization
    ).toHaveBeenNthCalledWith(
      1,
      organizationA.id,
      expect.objectContaining({
        serialPrefix: "718",
        serialStart: 718,
        nextOutgoingSerial: 718,
        incomingSerialPrefix: "IN",
        incomingSerialStart: 900,
        nextIncomingSerial: 900,
        departmentName: "قسم ٧١٨",
      })
    );
    expect(
      mocks.upsertOrganizationSettingsForOrganization
    ).toHaveBeenNthCalledWith(
      2,
      organizationB.id,
      expect.objectContaining({
        serialPrefix: "718",
        serialStart: 718,
        incomingSerialStart: 900,
        nextOutgoingSerial: 718,
        nextIncomingSerial: 900,
      })
    );
    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(2);
  });
});
