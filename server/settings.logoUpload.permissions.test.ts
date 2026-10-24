import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  getOrganization: vi.fn(),
  putLogo: vi.fn(),
}));

vi.mock("./organization", async importOriginal => {
  const actual = await importOriginal<typeof import("./organization")>();
  return {
    ...actual,
    getUserOrganizationMembership: mocks.getMembership,
    getOrganizationByIdIncludingInactive: mocks.getOrganization,
  };
});

vi.mock("./fileSecurity", () => ({ validateUploadedFile: vi.fn() }));

vi.mock("./storage", async importOriginal => {
  const actual = await importOriginal<typeof import("./storage")>();
  return { ...actual, storagePutDepartmentLogo: mocks.putLogo };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ownOrganizationId = "00000000-0000-4000-8000-000000000001";
const otherOrganizationId = "00000000-0000-4000-8000-000000000002";

function makeContext(): TrpcContext {
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

function makeMembership(organizationId = ownOrganizationId) {
  const now = new Date();
  return {
    id: 1,
    organizationId,
    userId: 9,
    role: "organization_admin",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeInput(organizationId: string) {
  return {
    organizationId,
    fileName: "badge.png",
    contentType: "image/png" as const,
    base64: "aW1hZ2U=",
  };
}

describe("settings.uploadLogo tenant authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMembership.mockResolvedValue(makeMembership());
    mocks.getOrganization.mockImplementation(async (id: string) => ({
      id,
      isActive: true,
    }));
    mocks.putLogo.mockResolvedValue({
      key: `department/logos/${ownOrganizationId}/badge.png`,
      url: `/api/storage/department/logos/${ownOrganizationId}/badge.png`,
    });
  });

  it("allows an organization administrator to upload to their own organization", async () => {
    const caller = appRouter.createCaller(makeContext());

    await expect(
      caller.settings.uploadLogo(makeInput(ownOrganizationId))
    ).resolves.toMatchObject({
      url: expect.stringContaining(ownOrganizationId),
    });

    expect(mocks.putLogo).toHaveBeenCalledTimes(1);
    expect(mocks.putLogo).toHaveBeenCalledWith(
      ownOrganizationId,
      "badge.png",
      expect.any(Buffer),
      "image/png"
    );
  });

  it("rejects an upload to another organization before writing storage", async () => {
    const caller = appRouter.createCaller(makeContext());

    await expect(
      caller.settings.uploadLogo(makeInput(otherOrganizationId))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.putLogo).not.toHaveBeenCalled();
  });

  it("rejects an unknown organization before writing storage", async () => {
    mocks.getOrganization.mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(makeContext());

    await expect(
      caller.settings.uploadLogo(makeInput(otherOrganizationId))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mocks.putLogo).not.toHaveBeenCalled();
  });
});
