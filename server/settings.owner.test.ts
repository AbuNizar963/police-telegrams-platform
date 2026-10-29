import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

const mocks = vi.hoisted(() => ({
  getOrganizationByIdIncludingInactive: vi.fn(),
  getUserOrganizationMembership: vi.fn(),
  getOrganizationSettings: vi.fn(),
  isDepartmentLogoExclusiveToOrganization: vi.fn(),
  upsertOrganizationSettingsForOrganization: vi.fn(),
  writeAuditLog: vi.fn(),
  storageDownload: vi.fn(),
}));

vi.mock("./db", () => ({
  getOrganizationSettings: mocks.getOrganizationSettings,
  isDepartmentLogoExclusiveToOrganization:
    mocks.isDepartmentLogoExclusiveToOrganization,
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
    getUserOrganizationMembership: mocks.getUserOrganizationMembership,
  };
});

vi.mock("./storage", async importOriginal => {
  const actual = await importOriginal<typeof import("./storage")>();
  return { ...actual, storageDownload: mocks.storageDownload };
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

function memberContext(): TrpcContext {
  return {
    user: {
      id: 7,
      authUserId: "00000000-0000-4000-8000-000000000007",
      name: "مستخدم الجهة",
      badgeNumber: null,
      email: "member@example.com",
      loginMethod: "local",
      username: "member-test",
      role: "dispatcher",
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
    mocks.isDepartmentLogoExclusiveToOrganization.mockResolvedValue(false);
    mocks.getUserOrganizationMembership.mockResolvedValue({
      userId: 7,
      organizationId: organizationA.id,
      role: "dispatcher",
      isActive: true,
    });
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

  it("lets a member read only their own organization's logo", async () => {
    const logoUrl = "https://cdn.example.gov.sy/identity/police-logo.png";
    mocks.getOrganizationSettings.mockResolvedValue({
      organizationId: organizationA.id,
      logoUrl,
    });
    const caller = appRouter.createCaller(memberContext());

    await expect(
      caller.organizations.logo({ organizationId: organizationA.id })
    ).resolves.toEqual({
      organizationId: organizationA.id,
      logoUrl,
      settingsExists: true,
    });

    await expect(
      caller.organizations.logo({ organizationId: organizationB.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns a protected same-origin logo URL without serializing image bytes", async () => {
    const storageKey = `department/logos/${organizationA.id}/logo.png`;
    const logoBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01,
    ]);
    mocks.getOrganizationSettings.mockResolvedValue({
      organizationId: organizationA.id,
      logoUrl: `/api/storage/${storageKey}`,
      logoKey: storageKey,
    });
    mocks.storageDownload.mockResolvedValue({
      body: logoBytes,
      contentType: "application/octet-stream",
    });
    const caller = appRouter.createCaller(memberContext());

    await expect(
      caller.organizations.logoForExport({
        organizationId: organizationA.id,
      })
    ).resolves.toEqual({
      organizationId: organizationA.id,
      logoUrl: `/api/storage/${storageKey}`,
      logoDataUrl: null,
    });
    expect(mocks.storageDownload).toHaveBeenCalledWith(storageKey);

    await expect(
      caller.organizations.logoForExport({
        organizationId: organizationB.id,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an unscoped legacy logo only when it belongs exclusively to this organization", async () => {
    const storageKey = "department/logos/legacy-logo.png";
    mocks.getOrganizationSettings.mockResolvedValue({
      organizationId: organizationA.id,
      logoUrl: `/api/storage/${storageKey}`,
    });
    mocks.isDepartmentLogoExclusiveToOrganization.mockResolvedValue(true);
    mocks.storageDownload.mockResolvedValue({
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      contentType: "image/png",
    });
    const caller = appRouter.createCaller(memberContext());

    await expect(
      caller.organizations.logoForExport({
        organizationId: organizationA.id,
      })
    ).resolves.toEqual({
      organizationId: organizationA.id,
      logoUrl: `/api/storage/${storageKey}`,
      logoDataUrl: null,
    });
    expect(mocks.isDepartmentLogoExclusiveToOrganization).toHaveBeenCalledWith(
      storageKey,
      organizationA.id
    );
    expect(mocks.storageDownload).toHaveBeenCalledWith(storageKey);
  });

  it("rejects an unscoped legacy logo referenced by more than one organization", async () => {
    const storageKey = "department/logos/shared-legacy-logo.png";
    mocks.getOrganizationSettings.mockResolvedValue({
      organizationId: organizationA.id,
      logoUrl: `/api/storage/${storageKey}`,
    });
    mocks.isDepartmentLogoExclusiveToOrganization.mockResolvedValue(false);
    const caller = appRouter.createCaller(memberContext());

    await expect(
      caller.organizations.logoForExport({
        organizationId: organizationA.id,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.storageDownload).not.toHaveBeenCalled();
  });

  it("never treats a telegram attachment as an organization's official logo", async () => {
    mocks.getOrganizationSettings.mockResolvedValue({
      organizationId: organizationA.id,
      logoUrl:
        "https://example.test/api/storage/telegrams/1/attachment-image.png",
    });
    const caller = appRouter.createCaller(memberContext());

    await expect(
      caller.organizations.logoForExport({
        organizationId: organizationA.id,
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(
      mocks.isDepartmentLogoExclusiveToOrganization
    ).not.toHaveBeenCalled();
    expect(mocks.storageDownload).not.toHaveBeenCalled();
  });

  it("leaves approved external logo URLs for the browser fetch fallback", async () => {
    const logoUrl = "https://cdn.example.gov.sy/identity/police-logo.png";
    mocks.getOrganizationSettings.mockResolvedValue({
      organizationId: organizationA.id,
      logoUrl,
      logoKey: logoUrl,
    });
    const caller = appRouter.createCaller(memberContext());

    await expect(
      caller.organizations.logoForExport({
        organizationId: organizationA.id,
      })
    ).resolves.toEqual({
      organizationId: organizationA.id,
      logoUrl,
      logoDataUrl: null,
    });
    expect(mocks.storageDownload).not.toHaveBeenCalled();
  });

  it("rejects a stored logo key scoped to a different organization", async () => {
    const foreignStorageKey = `department/logos/${organizationB.id}/logo.png`;
    mocks.getOrganizationSettings.mockResolvedValue({
      organizationId: organizationA.id,
      logoUrl: `/api/storage/${foreignStorageKey}`,
      logoKey: foreignStorageKey,
    });
    const caller = appRouter.createCaller(memberContext());

    await expect(
      caller.organizations.logoForExport({
        organizationId: organizationA.id,
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(mocks.storageDownload).not.toHaveBeenCalled();
  });

  it("allows the platform owner to read a logo without an organization membership", async () => {
    const logoUrl = "https://cdn.example.gov.sy/identity/police-logo.png";
    mocks.getOrganizationSettings.mockResolvedValue({
      organizationId: organizationB.id,
      logoUrl,
    });
    const caller = appRouter.createCaller(ownerContext());

    await expect(
      caller.organizations.logo({ organizationId: organizationB.id })
    ).resolves.toMatchObject({ logoUrl, settingsExists: true });
  });

  it("rejects external URLs for new organization logos", async () => {
    const caller = appRouter.createCaller(ownerContext());
    const logoUrl = "https://cdn.example.gov.sy/identity/police-logo.png";

    await expect(
      caller.organizations.settings.update({
        ...settingsInput(organizationA.id),
        logoUrl,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(
      mocks.upsertOrganizationSettingsForOrganization
    ).not.toHaveBeenCalled();
  });
});
