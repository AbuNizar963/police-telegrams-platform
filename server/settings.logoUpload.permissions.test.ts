import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMembershipMock: vi.fn(),
  getOrganizationMock: vi.fn(),
  uploadLogoMock: vi.fn(),
}));

vi.mock("./organization", async importOriginal => {
  const actual = await importOriginal<typeof import("./organization")>();
  return {
    ...actual,
    getUserOrganizationMembership: mocks.getMembershipMock,
    getOrganizationByIdIncludingInactive: mocks.getOrganizationMock,
  };
});

vi.mock("./storage", async importOriginal => {
  const actual = await importOriginal<typeof import("./storage")>();
  return {
    ...actual,
    storagePutDepartmentLogo: mocks.uploadLogoMock,
  };
});

vi.mock("./fileSecurity", async importOriginal => {
  const actual = await importOriginal<typeof import("./fileSecurity")>();
  return {
    ...actual,
    validateUploadedFile: vi.fn(),
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const HOME_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000002";

function contextFor(): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 9,
      authUserId: "00000000-0000-4000-8000-000000000009",
      name: "Organization Administrator",
      badgeNumber: null,
      email: "admin@example.com",
      loginMethod: "password",
      username: "organization-admin",
      role: "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function membership() {
  const now = new Date();
  return {
    id: 1,
    organizationId: HOME_ORGANIZATION_ID,
    userId: 9,
    role: "organization_admin",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

function uploadInput(organizationId: string) {
  return {
    organizationId,
    fileName: "badge.png",
    contentType: "image/png" as const,
    // The file-validation helper is mocked here; this test focuses on the
    // tenant authorization boundary, not image decoding.
    base64: "aW1hZ2U=",
  };
}

describe("department logo upload tenant authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMembershipMock.mockResolvedValue(membership());
    mocks.getOrganizationMock.mockImplementation(async (id: string) => ({
      id,
      isActive: true,
    }));
    mocks.uploadLogoMock.mockResolvedValue({
      key: `department/logos/${HOME_ORGANIZATION_ID}/badge.png`,
      url: `/api/storage/department/logos/${HOME_ORGANIZATION_ID}/badge.png`,
    });
  });

  it("allows an admin to upload their organization logo", async () => {
    const caller = appRouter.createCaller(contextFor());

    await expect(
      caller.settings.uploadLogo(uploadInput(HOME_ORGANIZATION_ID))
    ).resolves.toMatchObject({
      url: expect.stringContaining(HOME_ORGANIZATION_ID),
    });

    expect(mocks.getOrganizationMock).toHaveBeenCalledWith(
      HOME_ORGANIZATION_ID
    );
    expect(mocks.uploadLogoMock).toHaveBeenCalledTimes(1);
    expect(mocks.uploadLogoMock).toHaveBeenCalledWith(
      HOME_ORGANIZATION_ID,
      "badge.png",
      expect.any(Buffer),
      "image/png"
    );
  });

  it("denies uploads to a different organization", async () => {
    const caller = appRouter.createCaller(contextFor());

    await expect(
      caller.settings.uploadLogo(uploadInput(OTHER_ORGANIZATION_ID))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.getOrganizationMock).toHaveBeenCalledWith(
      OTHER_ORGANIZATION_ID
    );
    expect(mocks.uploadLogoMock).not.toHaveBeenCalled();
  });

  it("rejects unknown organization IDs", async () => {
    mocks.getOrganizationMock.mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(contextFor());

    await expect(
      caller.settings.uploadLogo(uploadInput(OTHER_ORGANIZATION_ID))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mocks.uploadLogoMock).not.toHaveBeenCalled();
  });
});
