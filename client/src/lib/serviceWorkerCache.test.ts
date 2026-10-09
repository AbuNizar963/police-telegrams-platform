import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const serviceWorkerSource = readFileSync(
  new URL("../../public/sw.js", import.meta.url),
  "utf8"
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("service worker cache cleanup", () => {
  it("preserves Transformers model caches when activating a new app shell", async () => {
    const listeners = new Map<string, (event: any) => void>();
    const deleteCache = vi.fn(async () => true);
    const selfScope = {
      addEventListener: vi.fn((name: string, handler: (event: any) => void) => {
        listeners.set(name, handler);
      }),
      registration: {},
      clients: { claim: vi.fn(async () => undefined) },
      skipWaiting: vi.fn(async () => undefined),
    };
    const cacheStorage = {
      keys: vi.fn(async () => [
        "police-telegrams-shell-v3",
        "police-telegrams-shell-v4",
        "transformers-cache",
        "another-library-cache",
      ]),
      delete: deleteCache,
    };

    new Function("self", "caches", serviceWorkerSource)(
      selfScope,
      cacheStorage
    );

    let activation: Promise<unknown> | undefined;
    listeners.get("activate")?.({
      waitUntil(promise: Promise<unknown>) {
        activation = promise;
      },
    });
    await activation;

    expect(deleteCache).toHaveBeenCalledTimes(1);
    expect(deleteCache).toHaveBeenCalledWith("police-telegrams-shell-v3");
    expect(deleteCache).not.toHaveBeenCalledWith("transformers-cache");
    expect(deleteCache).not.toHaveBeenCalledWith("another-library-cache");
  });
});
