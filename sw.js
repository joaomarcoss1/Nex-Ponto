const CACHE_NAME = "nexponto-v5.5.6-static";
const STATIC_ASSETS = ["/nexponto-mark.svg", "/nexponto-logo.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
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

function isApiOrDownload(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/platform") ||
    url.pathname.includes("/download") ||
    url.pathname.endsWith(".pdf") ||
    url.pathname.endsWith(".xlsx") ||
    request.headers.get("accept")?.includes("application/json");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (isApiOrDownload(request)) return;

  const url = new URL(request.url);
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
      )
    );
    return;
  }

  // Páginas e respostas autenticadas sempre usam a rede. Somente assets
  // estáticos versionados acima entram no cache da PWA.
  event.respondWith(fetch(request));
});
