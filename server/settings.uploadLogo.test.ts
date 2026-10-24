import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getOrganizationByIdIncludingInactive: vi.fn(),
  getUserOrganizationMembership: vi.fn(),
  storagePutDepartmentLogo: vi.fn(),
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
  return {
    ...actual,
    storagePutDepartmentLogo: mocks.storagePutDepartmentLogo,
  };
});

function context(): TrpcContext {
  return {
    user: {
      id: 27,
      authUserId: "00000000-0000-4000-8000-000000000027",
      name: "مدير جهة الاختبار",
      badgeNumber: null,
      email: "logo-admin@example.com",
      loginMethod: "local",
      username: "logo-upload-test-admin",
      role: "user",
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
  code: "LOGO-TEST-A",
  name: "جهة الاختبار الأولى",
};
const organizationB = {
  id: "00000000-0000-4000-8000-000000000102",
  code: "LOGO-TEST-B",
  name: "جهة الاختبار الثانية",
};

const validPng = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]).toString("base64");

function uploadInput(organizationId: string, base64 = validPng) {
  return {
    organizationId,
    fileName: "badge.png",
    contentType: "image/png" as const,
    base64,
  };
}

describe("organization-scoped logo upload authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationByIdIncludingInactive.mockImplementation(
      async (organizationId: string) =>
        [organizationA, organizationB].find(
          organization => organization.id === organizationId
        ),
    );
    mocks.getUserOrganizationMembership.mockResolvedValue({
      userId: 27,
      organizationId: organizationA.id,
      role: "organization_admin",
      isActive: true,
    });
    mocks.storagePutDepartmentLogo.mockImplementation(
      async (organizationId: string, fileName: string) => ({
        key: `department/logos/${organizationId}/generated-${fileName}`,
        url: "/api/storage/department/logos/generated-logo.png",
      }),
    );
  });

  it("allows an active organization administrator to upload to their own organization", async () => {
    const caller = appRouter.createCaller(context());

    await expect(
      caller.settings.uploadLogo(uploadInput(organizationA.id)),
    ).resolves.toMatchObject({
      key: `department/logos/${organizationA.id}/generated-badge.png`,
      url: "/api/storage/department/logos/generated-logo.png",
    });

    expect(mocks.storagePutDepartmentLogo).toHaveBeenCalledWith(
      organizationA.id,
      "badge.png",
      expect.any(Buffer),
      "image/png",
    );
  });

  it("rejects cross-organization uploads before writing to storage", async () => {
    const caller = appRouter.createCaller(context());

    await expect(
      caller.settings.uploadLogo(uploadInput(organizationB.id)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.storagePutDepartmentLogo).not.toHaveBeenCalled();
  });

  it("rejects unknown organizations before writing to storage", async () => {
    const caller = appRouter.createCaller(context());
    const unknownOrganizationId = "00000000-0000-4000-8000-000000000199";

    await expect(
      caller.settings.uploadLogo(uploadInput(unknownOrganizationId)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mocks.storagePutDepartmentLogo).not.toHaveBeenCalled();
  });

  it("rejects inactive memberships before writing to storage", async () => {
    mocks.getUserOrganizationMembership.mockResolvedValueOnce({
      userId: 27,
      organizationId: organizationA.id,
      role: "organization_admin",
      isActive: false,
    });
    const caller = appRouter.createCaller(context());

    await expect(
      caller.settings.uploadLogo(uploadInput(organizationA.id)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.storagePutDepartmentLogo).not.toHaveBeenCalled();
  });

  it(
    "rejects bytes that do not match the declared image type before organization lookup",
    async () => {
    const caller = appRouter.createCaller(context());

    await expect(
      caller.settings.uploadLogo(
        uploadInput(
          organizationA.id,
          Buffer.from("not an image").toString("base64"),
        ),
      ),
    ).rejects.toThrow("نوع الملف لا يطابق محتواه الحقيقي");

    expect(mocks.getOrganizationByIdIncludingInactive).not.toHaveBeenCalled();
    expect(mocks.storagePutDepartmentLogo).not.toHaveBeenCalled();
  });
});
