import { afterEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("./_core/supabase", () => ({
  getSupabaseAdmin: mocked.getSupabaseAdmin,
}));
vi.mock("./_core/storageRoutes", () => ({
  registerStorageRoutes: vi.fn(),
}));
vi.mock("./telegramExport", () => ({
  registerTelegramExportRoutes: vi.fn(),
}));
vi.mock("./_core/static", () => ({ serveStatic: vi.fn() }));
vi.mock("./_core/context", () => ({ createContext: vi.fn() }));
vi.mock("./routers", () => ({ appRouter: {} }));
vi.mock("@trpc/server/adapters/express", () => ({
  createExpressMiddleware:
    () =>
    (_request: unknown, _response: unknown, next: (error?: Error) => void) =>
      next(),
}));

import { createApp } from "./app";

const verificationToken = "00000000-0000-4000-8000-000000000001";

function mockVerificationRows(input: {
  serialNumber: number;
  serialCode: string;
  organizationSerialCode: string | null;
}) {
  const telegramQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  telegramQuery.select.mockReturnValue(telegramQuery);
  telegramQuery.eq.mockReturnValue(telegramQuery);
  telegramQuery.maybeSingle.mockResolvedValue({
    data: {
      ...input,
      creatorName: "موظف الاختبار",
      createdAt: "2026-10-08T10:00:00.000Z",
      organizationId: "00000000-0000-4000-8000-000000000010",
      archivedAt: null,
      status: "draft",
    },
    error: null,
  });

  const organizationQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  organizationQuery.select.mockReturnValue(organizationQuery);
  organizationQuery.eq.mockReturnValue(organizationQuery);
  organizationQuery.maybeSingle.mockResolvedValue({
    data: { name: "وحدة الاختبار" },
    error: null,
  });

  mocked.getSupabaseAdmin.mockReturnValue({
    from: vi.fn((table: string) =>
      table === "telegrams" ? telegramQuery : organizationQuery
    ),
  });
}

async function requestVerification(token = verificationToken) {
  const server = createApp().listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>(resolve => server.close(() => resolve()));
    throw new Error("Test server did not bind to a TCP port");
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/verify/${encodeURIComponent(token)}`
    );
    return {
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
      poweredBy: response.headers.get("x-powered-by"),
      body: await response.json(),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/verify/:token", () => {
  it("returns the same organization serial printed on the telegram, not the global counter", async () => {
    mockVerificationRows({
      serialNumber: 714,
      serialCode: "POL-2026-10-08-00714",
      organizationSerialCode: "POL-2026-10-08-00713",
    });

    const response = await requestVerification();

    expect(response.status).toBe(200);
    expect(response.cacheControl).toBe("no-store");
    expect(response.poweredBy).toBeNull();
    expect(response.body).toEqual(
      expect.objectContaining({
        valid: true,
        displaySerialCode: "POL-2026-10-08-00713",
        serialNumber: 714,
      })
    );
  });

  it("falls back to the legacy serial code when the organization code is missing", async () => {
    mockVerificationRows({
      serialNumber: 714,
      serialCode: "POL-2026-10-08-00714",
      organizationSerialCode: null,
    });

    const response = await requestVerification();

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        valid: true,
        displaySerialCode: "POL-2026-10-08-00714",
      })
    );
  });

  it("rejects malformed verification tokens without querying the database", async () => {
    const response = await requestVerification("not-a-uuid");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ valid: false });
    expect(mocked.getSupabaseAdmin).not.toHaveBeenCalled();
  });
});
