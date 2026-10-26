import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedUserFromRequest,
  storageDownload,
  storageGetSignedUrl,
  getUserOrganizationMembership,
  getOrganizationSettings,
  isPlatformOwner,
} = vi.hoisted(() => ({
  getAuthenticatedUserFromRequest: vi.fn(),
  storageDownload: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  getUserOrganizationMembership: vi.fn(),
  getOrganizationSettings: vi.fn(),
  isPlatformOwner: vi.fn(),
}));

vi.mock("./auth", () => ({ getAuthenticatedUserFromRequest }));
vi.mock("../organization", () => ({ getUserOrganizationMembership }));
vi.mock("../db", () => ({ getOrganizationSettings }));
vi.mock("../ownerAccess", () => ({ isPlatformOwner }));
vi.mock("../storage", async () => {
  const actual =
    await vi.importActual<typeof import("../storage")>("../storage");
  return {
    ...actual,
    storageDownload,
    storageGetSignedUrl,
  };
});

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
    getOrganizationSettings.mockResolvedValue({ logoKey: null, logoUrl: null });
    isPlatformOwner.mockReturnValue(false);
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
      "department/logos/550e8400-e29b-41d4-a716-446655440000-badge.png";
    getOrganizationSettings.mockResolvedValueOnce({
      logoKey: key,
      logoUrl: null,
    });
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

  it("proxies logo bytes with the upstream content type when storage is reachable", async () => {
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

  it("supports legacy organization logo file names through the byte proxy", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000/official-badge.webp";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(storageDownload).toHaveBeenCalledWith(key);
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("denies access to a logo belonging to another organization", async () => {
    const key =
      "department/logos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/550e8400-e29b-41d4-a716-446655440001-badge.png";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageDownload).not.toHaveBeenCalled();
  });

  it("denies access to an unscoped legacy logo unless configured for the user's organization", async () => {
    const key = "department/logos/legacy-badge.png";
    getOrganizationSettings.mockResolvedValueOnce({ logoKey: null, logoUrl: null });
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageDownload).not.toHaveBeenCalled();
  });

  it("rejects malformed department-logo keys before touching storage", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000/nested/badge.png";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageDownload).not.toHaveBeenCalled();
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("keeps telegram attachments behind their existing user authorization", async () => {
    const key = "telegrams/7/report.pdf";
    const user = { id: 7, role: "user" as const };
    getAuthenticatedUserFromRequest.mockResolvedValueOnce(user);
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(storageGetSignedUrl).toHaveBeenCalledWith(key, user);
    expect(storageDownload).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      307,
      "https://storage.example/file"
    );
  });
});
