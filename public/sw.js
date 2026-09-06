const CACHE_NAME = 'streamly-v8';

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

  // Network-first for API calls and HTML navigations, with a soft timeout.
  // If the network is slow (Render cold start / sleeping backend) we serve the
  // last cached copy immediately and let the real request finish in the
  // background, refreshing the cache. This makes cold starts invisible for
  // repeat users without ever showing stale data on a fast network. The handler
  // ALWAYS resolves to a Response — never undefined.
  if (request.url.includes('/api/') || request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    const cacheKey = cacheKeyFor(request);

    const handle = async () => {
      // Start the network request right away; refresh the cache in the background
      // whenever it returns a real response, regardless of what we serve.
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

  // Network-first for JS/CSS assets (always fetch latest, fall back to cache)
  if (event.request.url.match(/\.(js|css)$/)) {
    event.respondWith(
      fetch(event.request).then((response) => {
        // Update cache with fresh version
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => caches.match(event.request))
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
