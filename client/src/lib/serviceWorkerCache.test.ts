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

    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledWith("police-telegrams-shell-v3");
    expect(deleteCache).toHaveBeenCalledWith("police-telegrams-shell-v4");
    expect(deleteCache).not.toHaveBeenCalledWith("transformers-cache");
    expect(deleteCache).not.toHaveBeenCalledWith("another-library-cache");
  });

  it("does not intercept navigations, API responses, or dynamic files", () => {
    const listeners = new Map<string, (event: any) => void>();
    const selfScope = {
      addEventListener: vi.fn((name: string, handler: (event: any) => void) => {
        listeners.set(name, handler);
      }),
      location: { origin: "https://police.example.test" },
    };

    new Function("self", "caches", "fetch", serviceWorkerSource)(
      selfScope,
      {},
      vi.fn()
    );

    const fetchHandler = listeners.get("fetch");
    expect(fetchHandler).toBeDefined();
    for (const request of [
      {
        method: "GET",
        url: "https://police.example.test/telegrams/7",
        mode: "navigate",
      },
      {
        method: "GET",
        url: "https://police.example.test/api/trpc/auth.me",
        mode: "cors",
      },
      {
        method: "GET",
        url: "https://police.example.test/reports/export.csv",
        mode: "cors",
      },
    ]) {
      const respondWith = vi.fn();
      fetchHandler?.({ request, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
  });

  it("does not store static responses marked private, no-store, or no-cache", async () => {
    const listeners = new Map<string, (event: any) => void>();
    const put = vi.fn(async () => undefined);
    const cache = { put };
    const cachesApi = {
      match: vi.fn(async () => undefined),
      open: vi.fn(async () => cache),
    };
    const response = {
      ok: true,
      type: "basic",
      headers: { get: () => "private, no-store" },
      clone: vi.fn(() => ({})),
    };
    const fetchAsset = vi.fn(async () => response);
    const selfScope = {
      addEventListener: vi.fn((name: string, handler: (event: any) => void) => {
        listeners.set(name, handler);
      }),
      location: { origin: "https://police.example.test" },
    };

    new Function("self", "caches", "fetch", serviceWorkerSource)(
      selfScope,
      cachesApi,
      fetchAsset
    );

    let responsePromise: Promise<unknown> | undefined;
    listeners.get("fetch")?.({
      request: {
        method: "GET",
        url: "https://police.example.test/assets/app.js",
        mode: "cors",
      },
      preloadResponse: Promise.resolve(undefined),
      respondWith(promise: Promise<unknown>) {
        responsePromise = promise;
      },
    });
    await responsePromise;

    expect(fetchAsset).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });
});
