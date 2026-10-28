const CACHE_NAME = "police-telegrams-shell-v9";
const SHELL = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/notification-icon.png",
  "/notification-badge.png",
];

function getSameOriginTarget(value) {
  try {
    const target = new URL(
      typeof value === "string" && value ? value : "/",
      self.location.origin
    );
    return target.origin === self.location.origin
      ? target.href
      : new URL("/", self.location.origin).href;
  } catch {
    return new URL("/", self.location.origin).href;
  }
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await Promise.allSettled(
        SHELL.map(async url => {
          try {
            await cache.add(url);
          } catch {
            // A missing optional asset must not block the service worker install.
          }
        })
      );
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(
              key =>
                key.startsWith("police-telegrams-shell-") && key !== CACHE_NAME
            )
            .map(key => caches.delete(key))
        )
      )
      .then(async () => {
        if ("navigationPreload" in self.registration) {
          await self.registration.navigationPreload.enable();
        }
        await self.clients.claim();
      })
  );
});

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {
      title: "تنبيه برقيات الشرطة",
      body: event.data?.text() ?? "لديك إشعار جديد في نظام البرقيات",
    };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "تنبيه برقيات الشرطة", {
      body: payload.body || "لديك إشعار جديد في نظام البرقيات",
      icon: "/notification-icon.png",
      badge: "/notification-badge.png",
      dir: "rtl",
      lang: "ar",
      tag: payload.tag || "police-telegram",
      renotify: true,
      silent: false,
      data: { url: payload.url || "/", ...payload.data },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = getSameOriginTarget(event.notification.data?.url);
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(clients => {
        const existing = clients.find(client => "focus" in client);
        if (existing) {
          existing.navigate(targetUrl);
          return existing.focus();
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await caches.match("/")) || Response.error();
        }
      })()
    );
    return;
  }
  if (
    !/\.(?:css|js|mjs|png|jpe?g|webp|avif|svg|ico|woff2?|ttf|otf)$/i.test(
      url.pathname
    )
  ) {
    return;
  }
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const preload = await event.preloadResponse;
      try {
        const response = preload || (await fetch(request));
        const cacheControl = response.headers.get("cache-control") || "";
        if (
          response.ok &&
          response.type === "basic" &&
          !/(?:private|no-store|no-cache)/i.test(cacheControl)
        ) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        if (cached) return cached;
        if (request.mode === "navigate") {
          return (await caches.match("/")) || Response.error();
        }
        return Response.error();
      }
    })()
  );
});
