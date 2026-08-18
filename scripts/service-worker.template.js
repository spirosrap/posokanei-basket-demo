const CACHE_PREFIX = "kalathi-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v__APP_VERSION__`;
const SHELL_KEY = new Request(self.registration.scope);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => fetch(SHELL_KEY, { cache: "reload" }).then((response) => {
        if (!response.ok) throw new Error(`shell_${response.status}`);
        return cache.put(SHELL_KEY, response);
      }))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const scopePath = new URL(self.registration.scope).pathname;
  const relativePath = url.pathname.slice(scopePath.length).replace(/^\/+/, "");
  if (relativePath && !/^(?:bargains|changes|health)\/?$/u.test(relativePath)) return;

  const networkResponse = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(SHELL_KEY, response.clone());
      }
      return response;
    });

  event.waitUntil(networkResponse.then(() => undefined).catch(() => undefined));
  event.respondWith(
    caches.match(SHELL_KEY).then((cached) => cached || networkResponse),
  );
});
