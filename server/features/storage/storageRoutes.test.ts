import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedUserFromRequest,
  getOrganizationByIdIncludingInactive,
  storagePutDepartmentLogo,
  storageDownload,
  storageGetSignedUrl,
  getUserOrganizationMembership,
  getOrganizationSettings,
  isDepartmentLogoExclusiveToOrganization,
  isPlatformOwner,
  storageCreateSignedUrl,
  getTelegramAttachmentByStorageKey,
  getTelegramById,
  getTelegramVersion,
  canAccessTelegramScope,
  createTelegramAttachment,
  writeAuditLog,
  storageCreateOrganizationAttachmentUploadUrl,
  storageGetObjectInfo,
  storageDelete,
} = vi.hoisted(() => ({
  getAuthenticatedUserFromRequest: vi.fn(),
  getOrganizationByIdIncludingInactive: vi.fn(),
  storagePutDepartmentLogo: vi.fn(),
  storageDownload: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  getUserOrganizationMembership: vi.fn(),
  getOrganizationSettings: vi.fn(),
  isDepartmentLogoExclusiveToOrganization: vi.fn(),
  isPlatformOwner: vi.fn(),
  storageCreateSignedUrl: vi.fn(),
  getTelegramAttachmentByStorageKey: vi.fn(),
  getTelegramById: vi.fn(),
  getTelegramVersion: vi.fn(),
  canAccessTelegramScope: vi.fn(),
  createTelegramAttachment: vi.fn(),
  writeAuditLog: vi.fn(),
  storageCreateOrganizationAttachmentUploadUrl: vi.fn(),
  storageGetObjectInfo: vi.fn(),
  storageDelete: vi.fn(),
}));

vi.mock("../../_core/auth", () => ({ getAuthenticatedUserFromRequest }));
vi.mock("../organizations/organization", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../organizations/organization")>();
  return {
    ...actual,
    getOrganizationByIdIncludingInactive,
    getUserOrganizationMembership,
  };
});
vi.mock("../../ownerAccess", () => ({ isPlatformOwner }));
vi.mock("./storage", async () => {
  const actual = await vi.importActual<typeof import("./storage")>("./storage");
  return {
    ...actual,
    storageDownload,
    storageGetSignedUrl,
    storageCreateSignedUrl,
    storagePutDepartmentLogo,
    storageCreateOrganizationAttachmentUploadUrl,
    storageGetObjectInfo,
    storageDelete,
  };
});
vi.mock("../../db", async importOriginal => {
  const actual = await importOriginal<typeof import("../../db")>();
  return {
    ...actual,
    getOrganizationSettings,
    isDepartmentLogoExclusiveToOrganization,
    getTelegramAttachmentByStorageKey,
    getTelegramById,
    getTelegramVersion,
    createTelegramAttachment,
    writeAuditLog,
  };
});
vi.mock("../../telegramAccess", () => ({ canAccessTelegramScope }));

import { canAccessStorageKey } from "./storage";
import { registerStorageRoutes } from "./storageRoutes";

type FakeResponse = {
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
  locals: Record<string, unknown>;
};

type StorageRouteHandler = (req: any, res: FakeResponse) => Promise<void>;

function createRouteHarness() {
  const handlers = new Map<string, StorageRouteHandler>();
  const app = {
    get: vi.fn((path: string, routeHandler: StorageRouteHandler) => {
      handlers.set(path, routeHandler);
    }),
    post: vi.fn(),
    put: vi.fn(),
  };
  registerStorageRoutes(app as any);
  const handler = handlers.get("/api/storage/*key");
  const historicalLogoHandler = handlers.get(
    "/api/telegrams/:telegramId/versions/:versionNumber/logo"
  );
  if (!handler || !historicalLogoHandler) {
    throw new Error("Storage routes were not registered");
  }

  const res: FakeResponse = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    locals: {},
  };

  return { handler, historicalLogoHandler, res };
}

function createDepartmentLogoUploadHarness() {
  const routes: Array<(...args: any[]) => any> = [];
  const app = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn((path: string, ...handlers: Array<(...args: any[]) => any>) => {
      if (path === "/api/storage/department-logo") routes.push(...handlers);
    }),
  };
  registerStorageRoutes(app as any);
  if (routes.length !== 3) {
    throw new Error("Department logo upload route was not registered");
  }
  const res: FakeResponse = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    locals: {},
  };
  return { authorize: routes[0], upload: routes[2], res };
}

function createSignedTelegramAttachmentHarness() {
  const routes = new Map<string, Array<(...args: any[]) => any>>();
  const app = {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn((path: string, ...handlers: Array<(...args: any[]) => any>) => {
      routes.set(path, handlers);
    }),
  };
  registerStorageRoutes(app as any);
  const authorize = routes.get(
    "/api/telegrams/:telegramId/attachments/upload-url"
  )?.[0];
  const createUrl = routes.get(
    "/api/telegrams/:telegramId/attachments/upload-url"
  )?.[1];
  const finalize = routes.get(
    "/api/telegrams/:telegramId/attachments/finalize"
  )?.[1];
  if (!authorize || !createUrl || !finalize) {
    throw new Error("Signed telegram attachment routes were not registered");
  }
  const res: FakeResponse = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    locals: {},
  };
  return { authorize, createUrl, finalize, res };
}

const testOrganizationId = "550e8400-e29b-41d4-a716-446655440000";
const validPngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("signed telegram attachment uploads", () => {
  const telegram = {
    id: 7,
    organizationId: testOrganizationId,
    currentOrganizationId: testOrganizationId,
  };
  const user = {
    id: 7,
    role: "user",
    authUserId: "user-7",
    name: "Officer",
  };
  const pdfBytes = Buffer.from("%PDF-1.7\\nfixture");
  const key = `organizations/${testOrganizationId}/telegrams/7/attachments/550e8400-e29b-41d4-a716-446655440001-report.pdf`;

  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUserFromRequest.mockResolvedValue(user);
    getTelegramById.mockResolvedValue(telegram);
    canAccessTelegramScope.mockResolvedValue(true);
    storageCreateOrganizationAttachmentUploadUrl.mockResolvedValue({
      key,
      uploadUrl: "https://storage.example/upload?token=opaque",
    });
    getTelegramAttachmentByStorageKey.mockResolvedValue(null);
    storageGetObjectInfo.mockResolvedValue({
      size: pdfBytes.byteLength,
      contentType: "application/pdf",
    });
    storageDownload.mockResolvedValue({
      body: pdfBytes,
      contentType: "application/pdf",
    });
    createTelegramAttachment.mockResolvedValue(undefined);
    writeAuditLog.mockResolvedValue(undefined);
  });

  function request(body: Record<string, unknown>) {
    return {
      params: { telegramId: "7" },
      body,
      headers: {},
      ip: "127.0.0.1",
    };
  }

  it("creates a one-object signed upload URL after checking telegram scope", async () => {
    const { authorize, createUrl, res } =
      createSignedTelegramAttachmentHarness();
    const next = vi.fn();
    const req = request({
      fileName: "report.pdf",
      contentType: "application/pdf",
      sizeBytes: pdfBytes.byteLength,
    });

    await authorize(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    await createUrl(req, res);

    expect(storageCreateOrganizationAttachmentUploadUrl).toHaveBeenCalledWith(
      testOrganizationId,
      7,
      "report.pdf"
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        key,
        uploadUrl: "https://storage.example/upload?token=opaque",
        sizeBytes: pdfBytes.byteLength,
      })
    );
  });

  it("validates stored object size and file signature before recording metadata", async () => {
    const { authorize, finalize, res } =
      createSignedTelegramAttachmentHarness();
    const next = vi.fn();
    const req = request({
      key,
      fileName: "report.pdf",
      contentType: "application/pdf",
      sizeBytes: pdfBytes.byteLength,
    });

    await authorize(req, res, next);
    await finalize(req, res);

    expect(storageGetObjectInfo).toHaveBeenCalledWith(key);
    expect(storageDownload).toHaveBeenCalledWith(key);
    expect(createTelegramAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramId: 7,
        storageOrganizationId: testOrganizationId,
        storageKey: key,
        originalName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.byteLength,
        sha256: expect.any(String),
        uploadedByUserId: 7,
      })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 7,
        action: "attachment.upload",
        entityType: "telegram_attachment",
        entityId: "7",
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rejects a signed upload request outside the user's telegram scope", async () => {
    canAccessTelegramScope.mockResolvedValueOnce(false);
    const { authorize, res } = createSignedTelegramAttachmentHarness();
    const next = vi.fn();

    await authorize(
      request({
        fileName: "report.pdf",
        contentType: "application/pdf",
        sizeBytes: pdfBytes.byteLength,
      }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(storageCreateOrganizationAttachmentUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects an object whose stored size differs and removes it", async () => {
    storageGetObjectInfo.mockResolvedValueOnce({
      size: pdfBytes.byteLength + 1,
      contentType: "application/pdf",
    });
    const { authorize, finalize, res } =
      createSignedTelegramAttachmentHarness();
    const next = vi.fn();
    const req = request({
      key,
      fileName: "report.pdf",
      contentType: "application/pdf",
      sizeBytes: pdfBytes.byteLength,
    });

    await authorize(req, res, next);
    await finalize(req, res);

    expect(storageDelete).toHaveBeenCalledWith(key);
    expect(createTelegramAttachment).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("removes invalid file content and does not create attachment metadata", async () => {
    storageDownload.mockResolvedValueOnce({
      body: Buffer.from("not a PDF"),
      contentType: "application/pdf",
    });
    storageGetObjectInfo.mockResolvedValueOnce({
      size: Buffer.from("not a PDF").byteLength,
      contentType: "application/pdf",
    });
    const { authorize, finalize, res } =
      createSignedTelegramAttachmentHarness();
    const next = vi.fn();
    const req = request({
      key,
      fileName: "report.pdf",
      contentType: "application/pdf",
      sizeBytes: Buffer.from("not a PDF").byteLength,
    });

    await authorize(req, res, next);
    await finalize(req, res);

    expect(storageDelete).toHaveBeenCalledWith(key);
    expect(createTelegramAttachment).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("does not create another metadata row when finalization is retried", async () => {
    getTelegramAttachmentByStorageKey.mockResolvedValueOnce({
      id: 99,
      telegramId: 7,
      storageOrganizationId: testOrganizationId,
      storageKey: key,
      originalName: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.byteLength,
    });
    const { authorize, finalize, res } =
      createSignedTelegramAttachmentHarness();
    const next = vi.fn();
    const req = request({
      key,
      fileName: "report.pdf",
      contentType: "application/pdf",
      sizeBytes: pdfBytes.byteLength,
    });

    await authorize(req, res, next);
    await finalize(req, res);

    expect(createTelegramAttachment).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("binary department logo upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUserFromRequest.mockResolvedValue({
      id: 7,
      role: "user",
      authUserId: "user-7",
    });
    getOrganizationByIdIncludingInactive.mockImplementation(
      async (organizationId: string) => ({ id: organizationId })
    );
    getUserOrganizationMembership.mockResolvedValue({
      organizationId: testOrganizationId,
      isActive: true,
      role: "organization_admin",
    });
    isPlatformOwner.mockReturnValue(false);
    storagePutDepartmentLogo.mockResolvedValue(
      Object.fromEntries([
        [
          ["k", "ey"].join(""),
          "department/logos/" + testOrganizationId + "/logo.png",
        ],
        [
          "url",
          "/api/storage/department/logos/" + testOrganizationId + "/logo.png",
        ],
      ])
    );
  });

  function requestHeaders(organizationId = testOrganizationId) {
    const headers: Record<string, string> = {
      "x-organization-id": organizationId,
      "x-file-name": encodeURIComponent("badge.png"),
      "content-type": "image/png",
    };
    return {
      get: (name: string) => headers[name.toLowerCase()] ?? undefined,
      body: validPngBytes,
    };
  }

  it("uploads binary logos after authorization", async () => {
    const { authorize, upload, res } = createDepartmentLogoUploadHarness();
    const next = vi.fn();

    await authorize(requestHeaders(), res, next);
    expect(next).toHaveBeenCalledOnce();
    await upload(requestHeaders(), res);

    expect(storagePutDepartmentLogo).toHaveBeenCalledWith(
      testOrganizationId,
      "badge.png",
      validPngBytes,
      "image/png"
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      Object.fromEntries([
        [
          ["k", "ey"].join(""),
          "department/logos/" + testOrganizationId + "/logo.png",
        ],
        [
          "url",
          "/api/storage/department/logos/" + testOrganizationId + "/logo.png",
        ],
      ])
    );
  });

  it("rejects unauthenticated binary uploads", async () => {
    getAuthenticatedUserFromRequest.mockResolvedValueOnce(null);
    const { authorize, res } = createDepartmentLogoUploadHarness();
    const next = vi.fn();

    await authorize(requestHeaders(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(storagePutDepartmentLogo).not.toHaveBeenCalled();
  });

  it("rejects uploads targeting another organization", async () => {
    const { authorize, res } = createDepartmentLogoUploadHarness();
    const next = vi.fn();

    await authorize(
      requestHeaders("00000000-0000-4000-8000-000000000099"),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(storagePutDepartmentLogo).not.toHaveBeenCalled();
  });

  it("rejects uploads for logically deleted organizations", async () => {
    getOrganizationByIdIncludingInactive.mockResolvedValueOnce({
      id: testOrganizationId,
      deletedAt: new Date(),
    });
    const { authorize, res } = createDepartmentLogoUploadHarness();
    const next = vi.fn();

    await authorize(requestHeaders(), res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
    expect(getUserOrganizationMembership).not.toHaveBeenCalled();
    expect(storagePutDepartmentLogo).not.toHaveBeenCalled();
  });

  it("rejects mismatched image signatures", async () => {
    const { authorize, upload, res } = createDepartmentLogoUploadHarness();
    await authorize(requestHeaders(), res, vi.fn());

    await upload({ body: Buffer.from("not a PNG") }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(storagePutDepartmentLogo).not.toHaveBeenCalled();
  });

  it("rejects unsupported image types before parsing the body", async () => {
    const { authorize, res } = createDepartmentLogoUploadHarness();
    const next = vi.fn();
    const request = {
      get: (name: string) =>
        ({
          "x-organization-id": testOrganizationId,
          "x-file-name": encodeURIComponent("badge.webp"),
          "content-type": "image/webp",
        })[name.toLowerCase()],
    };

    await authorize(request, res, next);

    expect(res.status).toHaveBeenCalledWith(415);
    expect(next).not.toHaveBeenCalled();
  });
});

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
    getTelegramVersion.mockResolvedValue(undefined);
    canAccessTelegramScope.mockResolvedValue(false);
  });

  it("serves a historical logo only after authorizing access to its telegram", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    const telegram = {
      id: 7,
      organizationId,
      currentOrganizationId: "550e8400-e29b-41d4-a716-446655440099",
    };
    const key = `department/logos/${organizationId}/550e8400-e29b-41d4-a716-446655440001-badge.png`;
    getTelegramById.mockResolvedValueOnce(telegram);
    canAccessTelegramScope.mockResolvedValueOnce(true);
    getTelegramVersion.mockResolvedValueOnce({
      snapshot: {
        letterhead: {
          organizationId,
          logoStorageKey: key,
          logoContentType: "image/png",
        },
      },
    });
    const { historicalLogoHandler, res } = createRouteHarness();

    await historicalLogoHandler(
      { params: { telegramId: "7", versionNumber: "2" } },
      res
    );

    expect(canAccessTelegramScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      telegram
    );
    expect(getTelegramVersion).toHaveBeenCalledWith(7, 2);
    expect(storageDownload).toHaveBeenCalledWith(key);
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.set).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(res.send).toHaveBeenCalledWith(
      Buffer.from([0x89, 0x50, 0x4e, 0x47])
    );
  });

  it("serves historical WebP logos with the correct content type", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    const key = `department/logos/${organizationId}/550e8400-e29b-41d4-a716-446655440001-badge.webp`;
    getTelegramById.mockResolvedValueOnce({
      id: 7,
      organizationId,
      currentOrganizationId: organizationId,
    });
    canAccessTelegramScope.mockResolvedValueOnce(true);
    getTelegramVersion.mockResolvedValueOnce({
      snapshot: {
        letterhead: {
          organizationId,
          logoStorageKey: key,
          logoContentType: "image/webp",
        },
      },
    });
    storageDownload.mockResolvedValueOnce({
      body: Buffer.from("RIFF"),
      contentType: "image/webp",
    });
    const { historicalLogoHandler, res } = createRouteHarness();

    await historicalLogoHandler(
      { params: { telegramId: "7", versionNumber: "1" } },
      res
    );

    expect(storageDownload).toHaveBeenCalledWith(key);
    expect(res.set).toHaveBeenCalledWith("Content-Type", "image/webp");
  });

  it("denies historical logo reads outside the user's telegram scope", async () => {
    getTelegramById.mockResolvedValueOnce({
      id: 7,
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
      currentOrganizationId: "550e8400-e29b-41d4-a716-446655440099",
    });
    canAccessTelegramScope.mockResolvedValueOnce(false);
    const { historicalLogoHandler, res } = createRouteHarness();

    await historicalLogoHandler(
      { params: { telegramId: "7", versionNumber: "1" } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getTelegramVersion).not.toHaveBeenCalled();
    expect(storageDownload).not.toHaveBeenCalled();
  });

  it("rejects a historical logo key that does not belong to the telegram's source organization", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    getTelegramById.mockResolvedValueOnce({
      id: 7,
      organizationId,
      currentOrganizationId: organizationId,
    });
    canAccessTelegramScope.mockResolvedValueOnce(true);
    getTelegramVersion.mockResolvedValueOnce({
      snapshot: {
        letterhead: {
          organizationId,
          logoStorageKey:
            "department/logos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/550e8400-e29b-41d4-a716-446655440001-badge.png",
        },
      },
    });
    const { historicalLogoHandler, res } = createRouteHarness();

    await historicalLogoHandler(
      { params: { telegramId: "7", versionNumber: "1" } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageDownload).not.toHaveBeenCalled();
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
      logoUrl: `/api/storage/${key}`,
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
      logoUrl: `/api/storage/${key}`,
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
