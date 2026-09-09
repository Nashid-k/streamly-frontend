const CACHE_NAME = 'streamly-v9';

self.addEventListener('install', () => {
  // Skip waiting — activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete ALL old caches, then claim all clients
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Listen for version check messages from the page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Volatile cache-buster (`_t=<ms>` added by movieService) must not fragment
// the cache — strip it so a catalog response is reusable across page loads.
function cacheKeyFor(request) {
  try {
    const url = new URL(request.url);
    if (!url.searchParams.has('_t')) return request;
    url.searchParams.delete('_t');
    return new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      mode: request.mode,
      credentials: request.credentials,
      cache: request.cache,
    });
  } catch {
    return request;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // API calls — network-first with a soft timeout so Render cold starts are
  // invisible for repeat users without showing stale data on a fast network.
  if (request.url.includes('/api/')) {
    const cacheKey = cacheKeyFor(request);

    const handle = async () => {
      const netPromise = fetch(request).then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, responseClone));
        }
        return response;
      });

      const cached = await caches.match(cacheKey).catch(() => null);
      if (cached) {
        try {
          const winner = await Promise.race([
            netPromise,
            new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
          ]);
          if (winner) return winner; // network beat the soft timeout — fresh
          return cached; // network slow — serve last-known-good immediately
        } catch {
          return cached; // network failed — serve stale rather than error
        }
      }
      try {
        return await netPromise; // nothing cached — must wait for the network
      } catch {
        return new Response('', { status: 502, statusText: 'Offline' });
      }
    };

    event.respondWith(handle());
    return;
  }

  // HTML navigations — network-first, but NEVER serve a stale app shell on a
  // live deploy. A cached index.html references old hashed chunks that no
  // longer exist after redeploy, which is exactly what produces the 404s.
  // Cache only on network success; fall back to cache only when truly offline.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    const cacheKey = cacheKeyFor(request);

    const handle = async () => {
      try {
        const response = await fetch(request);
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, responseClone));
        }
        return response;
      } catch {
        const cached = await caches.match(cacheKey).catch(() => null);
        if (cached) return cached; // offline — serve last-known-good shell
        return new Response('', { status: 502, statusText: 'Offline' });
      }
    };

    event.respondWith(handle());
    return;
  }

  // Hashed JS/CSS assets — network-first. Files are immutable (hashed), so a
  // 404 means the index.html shell is stale: fall back to the cached copy.
  if (event.request.url.match(/\.(js|css)$/)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            return response;
          }
          // 404 for a versioned chunk — stale shell. Serve from cache if we can.
          return caches.match(event.request).then((cached) => cached || response);
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for images, fonts, and other assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => new Response('', { status: 408, statusText: 'Offline' }));
    })
  );
});