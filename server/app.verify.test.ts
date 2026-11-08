import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("./_core/supabase", () => ({
  getSupabaseAdmin: mocked.getSupabaseAdmin,
}));
vi.mock("./_core/env", () => ({
  ENV: {
    authSessionSecret: "test-auth-session-secret-0123456789abcdef",
    isProduction: false,
    releaseNotificationSecret: "",
  },
  assertProductionEnvironment: vi.fn(),
}));
vi.mock("./features/storage/storageRoutes", () => ({
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
  originalSerial?: string | null;
  telegramDate?: string | null;
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
      telegramDate: input.telegramDate ?? null,
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

  mocked.from.mockImplementation((table: string) =>
    table === "telegrams" ? telegramQuery : organizationQuery
  );
  mocked.getSupabaseAdmin.mockReturnValue({
    from: mocked.from,
    rpc: mocked.rpc,
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
      rateLimit: response.headers.get("ratelimit-limit"),
      retryAfter: response.headers.get("retry-after"),
      contentTypeOptions: response.headers.get("x-content-type-options"),
      frameOptions: response.headers.get("x-frame-options"),
      referrerPolicy: response.headers.get("referrer-policy"),
      body: await response.json(),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

beforeEach(() => {
  mocked.rpc.mockResolvedValue({
    data: [{ allowed: true, retry_after_seconds: 0 }],
    error: null,
  });
  mocked.from.mockReset();
  mocked.getSupabaseAdmin.mockReturnValue({
    from: mocked.from,
    rpc: mocked.rpc,
  });
});

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
    expect(response.contentTypeOptions).toBe("nosniff");
    expect(response.frameOptions).toBe("DENY");
    expect(response.referrerPolicy).toBe("no-referrer");
    expect(response.body).toEqual(
      expect.objectContaining({
        valid: true,
        displaySerialCode: "POL-2026-10-08-00713",
        serialNumber: 714,
      })
    );
  });

  it("prefers the original Excel serial and imported telegram date", async () => {
    mockVerificationRows({
      serialNumber: 714,
      serialCode: "POL-2026-10-08-00714",
      organizationSerialCode: "POL-2026-10-08-00713",
      originalSerial: "ب و ٠٠٦",
      telegramDate: "2024-03-04T05:06:00.000Z",
    });

    const response = await requestVerification();

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        valid: true,
        displaySerialCode: "ب و ٠٠٦",
        createdAt: "2024-03-04T05:06:00.000Z",
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

  it("rejects malformed tokens without querying telegram records", async () => {
    const response = await requestVerification("not-a-uuid");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ valid: false });
    expect(mocked.rpc).toHaveBeenCalledWith(
      "consume_auth_login_rate_limit",
      expect.objectContaining({
        p_max_attempts: 60,
        p_window_seconds: 60,
        p_block_seconds: 60,
        p_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
    expect(mocked.from).not.toHaveBeenCalled();
  });

  it("returns 429 when the shared limiter blocks the client", async () => {
    mocked.rpc.mockResolvedValueOnce({
      data: [{ allowed: false, retry_after_seconds: 37 }],
      error: null,
    });

    const response = await requestVerification();

    expect(response.status).toBe(429);
    expect(response.rateLimit).toBe("60");
    expect(response.retryAfter).toBe("37");
    expect(response.body).toEqual({
      valid: false,
      error: "محاولات تحقق كثيرة؛ أعد المحاولة لاحقًا",
    });
    expect(mocked.from).not.toHaveBeenCalled();
  });

  it("fails closed when shared rate-limit storage is unavailable", async () => {
    mocked.rpc.mockResolvedValueOnce({
      data: null,
      error: new Error("private test database error"),
    });

    const response = await requestVerification();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "تعذر التحقق من حد الطلبات حاليًا",
    });
    expect(mocked.from).not.toHaveBeenCalled();
  });
});
