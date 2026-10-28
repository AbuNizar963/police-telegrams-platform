import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedUserFromRequest,
  storageDownload,
  storageGetSignedUrl,
  getUserOrganizationMembership,
  getOrganizationSettings,
  isDepartmentLogoExclusiveToOrganization,
  isPlatformOwner,
  storageCreateSignedUrl,
  getTelegramAttachmentByStorageKey,
  getTelegramById,
  canAccessTelegramScope,
} = vi.hoisted(() => ({
  getAuthenticatedUserFromRequest: vi.fn(),
  storageDownload: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  getUserOrganizationMembership: vi.fn(),
  getOrganizationSettings: vi.fn(),
  isDepartmentLogoExclusiveToOrganization: vi.fn(),
  isPlatformOwner: vi.fn(),
  storageCreateSignedUrl: vi.fn(),
  getTelegramAttachmentByStorageKey: vi.fn(),
  getTelegramById: vi.fn(),
  canAccessTelegramScope: vi.fn(),
}));

vi.mock("./auth", () => ({ getAuthenticatedUserFromRequest }));
vi.mock("../organization", async importOriginal => {
  const actual = await importOriginal<typeof import("../organization")>();
  return {
    ...actual,
    getUserOrganizationMembership,
  };
});
vi.mock("../ownerAccess", () => ({ isPlatformOwner }));
vi.mock("../storage", async () => {
  const actual =
    await vi.importActual<typeof import("../storage")>("../storage");
  return {
    ...actual,
    storageDownload,
    storageGetSignedUrl,
    storageCreateSignedUrl,
  };
});
vi.mock("../db", async importOriginal => {
  const actual = await importOriginal<typeof import("../db")>();
  return {
    ...actual,
    getOrganizationSettings,
    isDepartmentLogoExclusiveToOrganization,
    getTelegramAttachmentByStorageKey,
    getTelegramById,
  };
});
vi.mock("../telegramAccess", () => ({ canAccessTelegramScope }));

import { canAccessStorageKey } from "../storage";
import { registerStorageRoutes } from "./storageRoutes";

type FakeResponse = {
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
};

function createRouteHarness() {
  let handler: ((req: any, res: FakeResponse) => Promise<void>) | undefined;
  const app = {
    get: vi.fn((_path: string, routeHandler: typeof handler) => {
      handler = routeHandler;
    }),
  };
  registerStorageRoutes(app as any);
  if (!handler) throw new Error("Storage route was not registered");

  const res: FakeResponse = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  };

  return { handler, res };
}

describe("storage key authorization", () => {
  it("allows an officer to access only their own attachment prefix", () => {
    const user = { id: 7, role: "user" as const };
    expect(canAccessStorageKey("telegrams/7/report.pdf", user)).toBe(true);
    expect(canAccessStorageKey("telegrams/8/report.pdf", user)).toBe(false);
  });

  it("allows administrators to access valid telegram attachment keys", () => {
    const admin = { id: 99, role: "admin" as const };
    expect(canAccessStorageKey("telegrams/7/report.pdf", admin)).toBe(true);
  });

  it("rejects malformed or traversal keys", () => {
    const user = { id: 7, role: "user" as const };
    expect(canAccessStorageKey("other/7/report.pdf", user)).toBe(false);
    expect(canAccessStorageKey("telegrams/7/../private.pdf", user)).toBe(false);
    expect(canAccessStorageKey("telegrams/not-a-user/report.pdf", user)).toBe(
      false
    );
  });
});

describe("storage route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUserFromRequest.mockResolvedValue({
      id: 7,
      role: "user",
      authUserId: "user-7",
    });
    storageDownload.mockResolvedValue({
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contentType: "image/png",
    });
    storageGetSignedUrl.mockResolvedValue("https://storage.example/file");
    getUserOrganizationMembership.mockResolvedValue({
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
      isActive: true,
    });
    getOrganizationSettings.mockResolvedValue({
      logoKey: null,
      logoUrl: null,
    });
    isDepartmentLogoExclusiveToOrganization.mockResolvedValue(true);
    isPlatformOwner.mockReturnValue(false);
    storageCreateSignedUrl.mockResolvedValue(
      "https://storage.example/scoped-file"
    );
    getTelegramAttachmentByStorageKey.mockResolvedValue(null);
    getTelegramById.mockResolvedValue(null);
    canAccessTelegramScope.mockResolvedValue(false);
  });

  it("requires authentication", async () => {
    getAuthenticatedUserFromRequest.mockResolvedValueOnce(null);
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: ["department", "logos", "123"] } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("serves department logo bytes through the same-origin route", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440000-badge.png";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(storageDownload).toHaveBeenCalledWith(key);
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.set).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(res.send).toHaveBeenCalledWith(
      Buffer.from([0x89, 0x50, 0x4e, 0x47])
    );
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("denies logo reads for a different organization", async () => {
    getUserOrganizationMembership.mockResolvedValueOnce({
      userId: 7,
      organizationId: "00000000-0000-4000-8000-000000000099",
      isActive: true,
    });
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440000-badge.png";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageDownload).not.toHaveBeenCalled();
  });

  it("proxies logo bytes using the upstream content type", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001-badge.jpg";
    const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    storageDownload.mockResolvedValueOnce({
      body: imageBytes,
      contentType: "image/jpeg",
    });
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(storageDownload).toHaveBeenCalledWith(key);
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.set).toHaveBeenCalledWith("Vary", "Cookie");
    expect(res.set).toHaveBeenCalledWith("Content-Type", "image/jpeg");
    expect(res.send).toHaveBeenCalledWith(imageBytes);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("returns a clear payload limit for legacy logos above the Vercel ceiling", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000/large-badge.png";
    storageDownload.mockResolvedValueOnce({
      body: Buffer.alloc(4_000_001),
      contentType: "image/png",
    });
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.send).toHaveBeenCalledWith(
      "Logo exceeds the serverless image size limit"
    );
  });

  it("supports organization-scoped logo keys", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001-badge.png";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(storageDownload).toHaveBeenCalledWith(key);
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.send).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("supports legacy logo names through the byte proxy", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000/official-badge.webp";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(storageDownload).toHaveBeenCalledWith(key);
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("serves a uniquely configured unscoped legacy logo", async () => {
    const key = "department/logos/official-badge.png";
    getOrganizationSettings.mockResolvedValueOnce({
      logoKey: key,
      logoUrl: null,
    });
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(isDepartmentLogoExclusiveToOrganization).toHaveBeenCalledWith(
      key,
      "550e8400-e29b-41d4-a716-446655440000"
    );
    expect(storageDownload).toHaveBeenCalledWith(key);
    expect(res.send).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("denies access to a logo belonging to another organization", async () => {
    const key =
      "department/logos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/550e8400-e29b-41d4-a716-446655440001-badge.png";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageDownload).not.toHaveBeenCalled();
  });

  it("denies logo access when membership is inactive", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001-badge.png";
    getUserOrganizationMembership.mockResolvedValueOnce({
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
      isActive: false,
    });
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageDownload).not.toHaveBeenCalled();
  });

  it("denies access to an unconfigured legacy logo", async () => {
    const key = "department/logos/legacy-badge.png";
    getOrganizationSettings.mockResolvedValueOnce({
      logoKey: null,
      logoUrl: null,
    });
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageDownload).not.toHaveBeenCalled();
  });

  it("denies a legacy logo key configured for another organization", async () => {
    const key = "department/logos/legacy-badge.png";
    getOrganizationSettings.mockResolvedValueOnce({
      logoKey: key,
      logoUrl: null,
    });
    isDepartmentLogoExclusiveToOrganization.mockResolvedValueOnce(false);
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(isDepartmentLogoExclusiveToOrganization).toHaveBeenCalledWith(
      key,
      "550e8400-e29b-41d4-a716-446655440000"
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageDownload).not.toHaveBeenCalled();
  });

  it("rejects malformed department-logo keys", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000/nested/badge.png";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageDownload).not.toHaveBeenCalled();
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects a legacy attachment when its metadata row is missing", async () => {
    const key = "telegrams/7/report.pdf";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(getTelegramAttachmentByStorageKey).toHaveBeenCalledWith(key);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageCreateSignedUrl).not.toHaveBeenCalled();
    expect(storageDownload).not.toHaveBeenCalled();
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("keeps a legacy attachment readable through its metadata and current telegram scope", async () => {
    const key = "telegrams/42/report.pdf";
    const telegram = {
      id: 7,
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
      currentOrganizationId: "550e8400-e29b-41d4-a716-446655440099",
    };
    getTelegramAttachmentByStorageKey.mockResolvedValueOnce({
      telegramId: 7,
      storageOrganizationId: telegram.organizationId,
      storageKey: key,
    });
    getTelegramById.mockResolvedValueOnce(telegram);
    canAccessTelegramScope.mockResolvedValueOnce(true);
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(storageCreateSignedUrl).toHaveBeenCalledWith(key, 10 * 60);
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      307,
      "https://storage.example/scoped-file"
    );
  });

  it("resolves a legacy attachment owner from its telegram during rollout", async () => {
    const key = "telegrams/42/report.pdf";
    const telegram = {
      id: 7,
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
      currentOrganizationId: "550e8400-e29b-41d4-a716-446655440099",
    };
    getTelegramAttachmentByStorageKey.mockResolvedValueOnce({
      telegramId: 7,
      storageOrganizationId: null,
      storageKey: key,
    });
    getTelegramById.mockResolvedValueOnce(telegram);
    canAccessTelegramScope.mockResolvedValueOnce(true);
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(canAccessTelegramScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      telegram
    );
    expect(storageCreateSignedUrl).toHaveBeenCalledWith(key, 10 * 60);
    expect(res.redirect).toHaveBeenCalledWith(
      307,
      "https://storage.example/scoped-file"
    );
  });

  it("requires matching metadata and organization scope for a new attachment key", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    const currentOrganizationId = "550e8400-e29b-41d4-a716-446655440099";
    const key = `organizations/${organizationId}/telegrams/7/attachments/550e8400-e29b-41d4-a716-446655440001-report.pdf`;
    const attachment = {
      telegramId: 7,
      storageOrganizationId: organizationId,
      storageKey: key,
    };
    const telegram = {
      id: 7,
      organizationId,
      currentOrganizationId,
    };
    getTelegramAttachmentByStorageKey.mockResolvedValueOnce(attachment);
    getTelegramById.mockResolvedValueOnce(telegram);
    canAccessTelegramScope.mockResolvedValueOnce(true);
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(getTelegramAttachmentByStorageKey).toHaveBeenCalledWith(key);
    expect(getTelegramById).toHaveBeenCalledWith(7);
    expect(canAccessTelegramScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      telegram
    );
    expect(storageCreateSignedUrl).toHaveBeenCalledWith(key, 10 * 60);
    expect(res.redirect).toHaveBeenCalledWith(
      307,
      "https://storage.example/scoped-file"
    );
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects a scoped attachment request from an unrelated organization", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    const key = `organizations/${organizationId}/telegrams/7/attachments/550e8400-e29b-41d4-a716-446655440001-report.pdf`;
    getTelegramAttachmentByStorageKey.mockResolvedValueOnce({
      telegramId: 7,
      storageOrganizationId: organizationId,
      storageKey: key,
    });
    getTelegramById.mockResolvedValueOnce({
      id: 7,
      organizationId,
      currentOrganizationId: "550e8400-e29b-41d4-a716-446655440099",
    });
    canAccessTelegramScope.mockResolvedValueOnce(false);
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageCreateSignedUrl).not.toHaveBeenCalled();
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects a new scoped key when its metadata owner is missing", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    const key = `organizations/${organizationId}/telegrams/7/attachments/550e8400-e29b-41d4-a716-446655440001-report.pdf`;
    getTelegramAttachmentByStorageKey.mockResolvedValueOnce({
      telegramId: 7,
      storageOrganizationId: null,
      storageKey: key,
    });
    getTelegramById.mockResolvedValueOnce({
      id: 7,
      organizationId,
      currentOrganizationId: organizationId,
    });
    canAccessTelegramScope.mockResolvedValueOnce(true);
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageCreateSignedUrl).not.toHaveBeenCalled();
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects organization-scoped keys without an attachment metadata record", async () => {
    const key =
      "organizations/550e8400-e29b-41d4-a716-446655440000/telegrams/7/attachments/550e8400-e29b-41d4-a716-446655440001-report.pdf";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getTelegramById).not.toHaveBeenCalled();
    expect(storageCreateSignedUrl).not.toHaveBeenCalled();
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
  });
});
