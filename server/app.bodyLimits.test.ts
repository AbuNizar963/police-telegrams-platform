import { describe, expect, it } from "vitest";
import { createApp, getJsonBodyLimit } from "./app";
import { ENV } from "./_core/env";

async function postUnauthenticated(path: string): Promise<number> {
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
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Invalid JSON proves the auth gate runs before the JSON parser.
      body: "{",
    });
    return response.status;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

async function postUnauthenticatedAttempts(
  path: string,
  count: number
): Promise<number[]> {
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
    const statuses: number[] = [];
    for (let attempt = 0; attempt < count; attempt += 1) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      });
      statuses.push(response.status);
    }
    return statuses;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

describe("request body limits", () => {
  it("keeps ordinary API requests small", () => {
    expect(getJsonBodyLimit("/api/trpc/auth.login")).toBe("1mb");
    expect(getJsonBodyLimit("/api/trpc/telegrams.create")).toBe("1mb");
  });

  it("allows only the payload sizes required by file operations", () => {
    expect(getJsonBodyLimit("/api/trpc/telegrams.uploadAttachment")).toBe(
      "16mb"
    );
    expect(getJsonBodyLimit("/api/trpc/settings.uploadLogo")).toBe("4mb");
    expect(getJsonBodyLimit("/api/trpc/telegrams.importRows")).toBe("50mb");
    expect(getJsonBodyLimit("/api/trpc/telegrams.importWorkbookPreview")).toBe(
      "22mb"
    );
    expect(
      getJsonBodyLimit(
        "/api/trpc/telegrams.importRows,telegrams.uploadAttachment"
      )
    ).toBe("50mb");
  });

  it("keeps the HTML export request below the Vercel payload ceiling", () => {
    expect(getJsonBodyLimit("/api/telegram-render")).toBe("4mb");
  });

  it("rejects unauthenticated uploads before parsing JSON", async () => {
    await expect(
      postUnauthenticated("/api/trpc/telegrams.uploadAttachment")
    ).resolves.toBe(401);
    await expect(
      postUnauthenticated("/api/trpc/telegrams.importWorkbookPreview")
    ).resolves.toBe(401);
  });

  it("rate limits repeated large-payload authorization checks", async () => {
    const statuses = await postUnauthenticatedAttempts(
      "/api/trpc/telegrams.uploadAttachment",
      61
    );

    expect(statuses.slice(0, 60)).toEqual(Array(60).fill(401));
    expect(statuses[60]).toBe(429);
  });
});

describe("proxy trust configuration", () => {
  it("configures one trusted proxy hop only in production", () => {
    expect(createApp().get("trust proxy")).toBe(ENV.isProduction ? 1 : false);
  });
});
