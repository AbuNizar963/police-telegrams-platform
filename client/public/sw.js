const CACHE_NAME = "police-telegrams-shell-v2";
const SHELL = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {
      title: "تنبيه برقيات الشرطة",
      body: event.data?.text() ?? "لديك إشعار جديد",
    };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "تنبيه برقيات الشرطة", {
      body: payload.body || "لديك إشعار جديد في مركز البرقيات",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      dir: "rtl",
      lang: "ar",
      tag: payload.tag || "police-telegram",
      renotify: true,
      data: { url: payload.url || "/", ...payload.data },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;
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
    url.pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then(response => response || caches.match("/"))
    )
  );
});
