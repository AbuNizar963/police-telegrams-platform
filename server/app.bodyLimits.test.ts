import { describe, expect, it } from "vitest";
import { createApp, getJsonBodyLimit } from "./app";

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
    const response = await fetch(
      `http://127.0.0.1:${address.port}${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Invalid JSON proves the auth gate runs before the JSON parser.
        body: "{",
      }
    );
    return response.status;
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
    expect(getJsonBodyLimit("/api/trpc/settings.uploadLogo")).toBe("8mb");
    expect(getJsonBodyLimit("/api/trpc/telegrams.importRows")).toBe("50mb");
    expect(
      getJsonBodyLimit(
        "/api/trpc/telegrams.importRows,telegrams.uploadAttachment"
      )
    ).toBe("50mb");
  });

  it("allows the HTML export limit plus JSON overhead without applying it globally", () => {
    expect(getJsonBodyLimit("/api/telegram-render")).toBe("3mb");
  });

  it("rejects unauthenticated large-payload requests before parsing their bodies", async () => {
    await expect(
      postUnauthenticated("/api/trpc/telegrams.uploadAttachment")
    ).resolves.toBe(401);
  });
});
