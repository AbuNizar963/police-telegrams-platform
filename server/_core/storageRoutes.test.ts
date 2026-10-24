import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedUserFromRequest,
  storageCreateSignedUrl,
  storageDownload,
  storageGetSignedUrl,
} = vi.hoisted(() => ({
  getAuthenticatedUserFromRequest: vi.fn(),
  storageCreateSignedUrl: vi.fn(),
  storageDownload: vi.fn(),
  storageGetSignedUrl: vi.fn(),
}));

vi.mock("./auth", () => ({ getAuthenticatedUserFromRequest }));
vi.mock("../storage", async () => {
  const actual =
    await vi.importActual<typeof import("../storage")>("../storage");
  return {
    ...actual,
    storageCreateSignedUrl,
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
    storageDownload.mockResolvedValue({ body: Buffer.from([1, 2, 3]), contentType: "image/png" });
    getAuthenticatedUserFromRequest.mockResolvedValue({
      id: 7,
      role: "user",
      authUserId: "user-7",
    });
    storageCreateSignedUrl.mockResolvedValue("https://storage.example/logo");
    storageGetSignedUrl.mockResolvedValue("https://storage.example/file");
  });

  it("requires authentication", async () => {
    getAuthenticatedUserFromRequest.mockResolvedValueOnce(null);
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: ["department", "logos", "123"] } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("serves a valid department logo from storage bytes without a cross-origin redirect", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000-badge.png";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(storageDownload).toHaveBeenCalledWith(key);
    expect(storageCreateSignedUrl).not.toHaveBeenCalled();
    expect(storageDownload).not.toHaveBeenCalled();
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.set).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(res.send).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
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
    expect(storageCreateSignedUrl).not.toHaveBeenCalled();
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.send).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("rejects malformed department-logo keys before touching storage", async () => {
    const key = "department/logos/not-a-uuid-badge.png";
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageCreateSignedUrl).not.toHaveBeenCalled();
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("keeps telegram attachments behind their existing user authorization", async () => {
    const key = "telegrams/7/report.pdf";
    const user = { id: 7, role: "user" as const };
    getAuthenticatedUserFromRequest.mockResolvedValueOnce(user);
    const { handler, res } = createRouteHarness();

    await handler({ params: { key: key.split("/") } }, res);

    expect(storageGetSignedUrl).toHaveBeenCalledWith(key, user);
    expect(storageCreateSignedUrl).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      307,
      "https://storage.example/file"
    );
  });
});
