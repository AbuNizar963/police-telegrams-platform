import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedUserFromRequest, storageCreateSignedUrl, storageGetSignedUrl } =
  vi.hoisted(() => ({
    getAuthenticatedUserFromRequest: vi.fn(),
    storageCreateSignedUrl: vi.fn(),
    storageGetSignedUrl: vi.fn(),
  }));

vi.mock("./auth", () => ({ getAuthenticatedUserFromRequest }));
vi.mock("../storage", async () => {
  const actual = await vi.importActual<typeof import("../storage")>("../storage");
  return {
    ...actual,
    storageCreateSignedUrl,
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
    expect(canAccessStorageKey("telegrams/not-a-user/report.pdf", user)).toBe(false);
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
    storageCreateSignedUrl.mockResolvedValue("https://storage.example/logo");
    storageGetSignedUrl.mockResolvedValue("https://storage.example/file");
  });

  it("requires authentication", async () => {
    getAuthenticatedUserFromRequest.mockResolvedValueOnce(null);
    const { handler, res } = createRouteHarness();

    await handler(
      { params: { 0: "department/logos/123" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("serves a valid department logo only through a short-lived signed URL", async () => {
    const key =
      "department/logos/550e8400-e29b-41d4-a716-446655440000-badge.png";
    const { handler, res } = createRouteHarness();

    await handler({ params: { 0: key } }, res);

    expect(storageCreateSignedUrl).toHaveBeenCalledWith(key, 10 * 60);
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, max-age=300");
    expect(res.redirect).toHaveBeenCalledWith(307, "https://storage.example/logo");
  });

  it("rejects malformed department-logo keys before touching storage", async () => {
    const key = "department/logos/not-a-uuid-badge.png";
    const { handler, res } = createRouteHarness();

    await handler({ params: { 0: key } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageCreateSignedUrl).not.toHaveBeenCalled();
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("keeps telegram attachments behind their existing user authorization", async () => {
    const key = "telegrams/7/report.pdf";
    const user = { id: 7, role: "user" as const };
    getAuthenticatedUserFromRequest.mockResolvedValueOnce(user);
    const { handler, res } = createRouteHarness();

    await handler({ params: { 0: key } }, res);

    expect(storageGetSignedUrl).toHaveBeenCalledWith(key, user);
    expect(storageCreateSignedUrl).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(307, "https://storage.example/file");
  });
});
