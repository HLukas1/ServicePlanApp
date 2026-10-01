// ServicePlan Service Worker

const CACHE_NAME = "serviceplan-shell-v8";

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

  // App-Navigation: die gespeicherte App sofort anzeigen. Das Netzwerk
  // aktualisiert den Cache im Hintergrund, ohne den Start aufzuhalten.
  if (event.request.mode === "navigate") {
    const networkUpdate = fetch(event.request).then((response) => {
      if (response.ok) {
        return caches.open(CACHE_NAME)
          .then((cache) => cache.put("/", response.clone()))
          .then(() => response);
      }
      return response;
    });

    // waitUntil wird synchron registriert, damit der Service Worker für
    // die Cache-Aktualisierung im Hintergrund aktiv bleibt.
    event.waitUntil(networkUpdate.then(() => undefined, () => undefined));
    event.respondWith(
      caches.match("/").then((cached) => cached || networkUpdate)
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
