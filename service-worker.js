// ServicePlan Service Worker
//
// Update-Strategie:
// - Die Startseite wird immer zuerst vom Server geholt (Netzwerk zuerst).
//   Nur wenn der Server nicht erreichbar ist, wird die gespeicherte Kopie
//   angezeigt. Dadurch kommen Updates ohne Löschen der Browserdaten an.
// - app.js und style.css werden mit einer Versionskennung (?v=...) geladen.
//   Neue Version = neue URL, alte Kopien werden automatisch aufgeräumt.

const CACHE_NAME = "serviceplan-shell-v14";
const NAVIGATION_TIMEOUT_MS = 4000;

const SHELL_FILES = [
  "/",
  "/static/manifest.json",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      (response) => { clearTimeout(timer); resolve(response); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Entfernt ältere Versionen derselben Datei (gleicher Pfad, andere ?v=...).
async function putAndPrune(cache, request, response) {
  const url = new URL(request.url);
  const keys = await cache.keys();
  await Promise.all(keys
    .filter((key) => {
      const keyUrl = new URL(key.url);
      return keyUrl.pathname === url.pathname && keyUrl.search !== url.search;
    })
    .map((key) => cache.delete(key)));
  await cache.put(request, response);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API niemals aus dem Cache bedienen, nur GET und nur eigene Seite.
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // App-Start: Netzwerk zuerst, bei Offline/Timeout die gespeicherte Seite.
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetchWithTimeout(event.request, NAVIGATION_TIMEOUT_MS);
        if (response.ok) await cache.put("/", response.clone());
        return response;
      } catch (err) {
        const cached = await cache.match("/");
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  // Statische Dateien: Cache zuerst (die URL enthält die Version),
  // sonst Netzwerk und für den Offline-Betrieb speichern.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (response.ok) event.waitUntil(putAndPrune(cache, event.request, response.clone()));
      return response;
    } catch (err) {
      // Offline-Fallback: irgendeine gespeicherte Version derselben Datei.
      const fallback = await cache.match(event.request, { ignoreSearch: true });
      if (fallback) return fallback;
      throw err;
    }
  })());
});
