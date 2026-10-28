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

  it("falls back to the shell for offline navigations but ignores APIs and dynamic files", async () => {
    const listeners = new Map<string, (event: any) => void>();
    const selfScope = {
      addEventListener: vi.fn((name: string, handler: (event: any) => void) => {
        listeners.set(name, handler);
      }),
      location: { origin: "https://police.example.test" },
    };
    const shell = { offline: true };
    const cachesApi = { match: vi.fn(async () => shell) };
    const fetchNetwork = vi.fn(async () => {
      throw new Error("offline");
    });

    new Function("self", "caches", "fetch", serviceWorkerSource)(
      selfScope,
      cachesApi,
      fetchNetwork
    );

    const fetchHandler = listeners.get("fetch");
    expect(fetchHandler).toBeDefined();
    const navigation = {
      method: "GET",
      url: "https://police.example.test/telegrams/7",
      mode: "navigate",
    };
    const navigationRespondWith = vi.fn();
    fetchHandler?.({ request: navigation, respondWith: navigationRespondWith });
    await expect(navigationRespondWith.mock.calls[0][0]).resolves.toEqual(
      shell
    );
    expect(fetchNetwork).toHaveBeenCalledWith(navigation);
    expect(cachesApi.match).toHaveBeenCalledWith("/");

    for (const request of [
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

  it("keeps notification clicks on the application origin", async () => {
    const listeners = new Map<string, (event: any) => void>();
    const openWindow = vi.fn(async (url: string) => ({ url }));
    const selfScope = {
      addEventListener: vi.fn((name: string, handler: (event: any) => void) => {
        listeners.set(name, handler);
      }),
      location: { origin: "https://police.example.test" },
      clients: {
        matchAll: vi.fn(async () => []),
        openWindow,
      },
    };

    new Function("self", "caches", serviceWorkerSource)(selfScope, {});

    const close = vi.fn();
    let clickPromise: Promise<unknown> | undefined;
    listeners.get("notificationclick")?.({
      notification: {
        close,
        data: { url: "https://attacker.example/collect" },
      },
      waitUntil(promise: Promise<unknown>) {
        clickPromise = promise;
      },
    });
    await clickPromise;

    expect(close).toHaveBeenCalledOnce();
    expect(openWindow).toHaveBeenCalledWith("https://police.example.test/");
  });
});
