import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  notifyMobileRelease: vi.fn(),
}));

vi.mock("./_core/supabase", () => ({
  getSupabaseAdmin: mocked.getSupabaseAdmin,
}));
vi.mock("./_core/notification", () => ({
  notifyMobileRelease: mocked.notifyMobileRelease,
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
import { ENV } from "./_core/env";

const releaseSecret = "test-release-notification-secret-which-is-long-enough";
const originalSecret = ENV.releaseNotificationSecret;

async function postRelease(input: {
  secret?: string;
  body?: Record<string, unknown>;
}) {
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
      `http://127.0.0.1:${address.port}/api/internal/mobile-release`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(input.secret
            ? { "x-release-notification-secret": input.secret }
            : {}),
        },
        body: JSON.stringify(input.body ?? {}),
      }
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

beforeEach(() => {
  ENV.releaseNotificationSecret = releaseSecret;
  mocked.notifyMobileRelease.mockResolvedValue({
    sent: 3,
    removed: 1,
    configured: true,
  });
});

afterEach(() => {
  ENV.releaseNotificationSecret = originalSecret;
  vi.clearAllMocks();
});

describe("POST /api/internal/mobile-release", () => {
  it("does not disclose or accept requests when the secret is missing", async () => {
    ENV.releaseNotificationSecret = "";
    const response = await postRelease({
      secret: releaseSecret,
      body: {
        version: "1.2.3",
        buildNumber: 42,
        releaseUrl:
          "https://github.com/AbuNizar963/police-telegrams-platform/releases/tag/v1.2.3",
      },
    });

    expect(response.status).toBe(404);
    expect(mocked.notifyMobileRelease).not.toHaveBeenCalled();
  });

  it("rejects an incorrect secret without dispatching a notification", async () => {
    const response = await postRelease({
      secret: "incorrect-secret",
      body: {
        version: "1.2.3",
        buildNumber: 42,
        releaseUrl:
          "https://github.com/AbuNizar963/police-telegrams-platform/releases/tag/v1.2.3",
      },
    });

    expect(response.status).toBe(404);
    expect(mocked.notifyMobileRelease).not.toHaveBeenCalled();
  });

  it("validates release metadata before dispatch", async () => {
    const response = await postRelease({
      secret: releaseSecret,
      body: {
        version: "not-a-version",
        buildNumber: -1,
        releaseUrl: "https://example.com/releases/latest",
      },
    });

    expect(response.status).toBe(400);
    expect(mocked.notifyMobileRelease).not.toHaveBeenCalled();
  });

  it("dispatches a validated GitHub release and reports delivery counts", async () => {
    const body = {
      version: "1.2.3",
      buildNumber: 42,
      releaseUrl:
        "https://github.com/AbuNizar963/police-telegrams-platform/releases/tag/v1.2.3",
      title: "تحديث جديد لتطبيق برقيات الشرطة",
      body: "الإصدار 1.2.3 متوفر الآن.",
    };
    const response = await postRelease({ secret: releaseSecret, body });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      sent: 3,
      removed: 1,
      configured: true,
    });
    expect(mocked.notifyMobileRelease).toHaveBeenCalledWith(body);
  });
});
