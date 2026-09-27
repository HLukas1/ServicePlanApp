// ServicePlan Service Worker

const CACHE_NAME = "serviceplan-shell-v7";

const SHELL_FILES = [
  "/",
  "/static/style.css",
  "/static/app.js",
  "/static/manifest.json",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_FILES);
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API niemals aus dem Cache bedienen
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Nur GET
  if (event.request.method !== "GET") {
    return;
  }

  // App-Navigation:
  // Erst Netzwerk versuchen, bei fehlendem Netz
  // die gecachte Startseite verwenden.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put("/", copy);
            });
          }

          return response;
        })
        .catch(() => {
          return caches.match("/");
        })
    );

    return;
  }

  // Statische Dateien:
  // Cache zuerst, Netzwerk als Fallback.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, copy);
            });
          }

          return response;
        })
        .catch(() => {
          return cached;
        });
    })
  );
});