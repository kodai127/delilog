const CACHE_NAME = "delilog-v14";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./app.html",
  "./landing.html",
  "./feedback.html",
  "./terms.html",
  "./privacy.html",
  "./contact.html",
  "./sitemap.xml",
  "./robots.txt",
  "./styles.css",
  "./script.js",
  "./feedback.js",
  "./supabase-config.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => caches.match("./index.html"));
    })
  );
});
