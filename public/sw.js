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

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Network-first for API calls and HTML navigations, with a soft timeout.
  // If the network is slow (Render cold start / sleeping backend) we serve the
  // last cached copy immediately and let the real request finish in the
  // background, refreshing the cache. This makes cold starts invisible for
  // repeat users without ever showing stale data on a fast network.
  if (request.url.includes('/api/') || request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    const refreshCache = (response) => {
      if (response && response.status === 200) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
      }
    };
    const slowNetwork = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('slow network')), 1500)
    );
    const fetchFresh = fetch(request)
      .then((response) => {
        refreshCache(response);
        return response;
      })
      .catch(() => {
        // Real network failure — fall back to cache immediately.
        return caches.match(request);
      });
    event.respondWith(
      Promise.race([fetchFresh, slowNetwork])
        .catch(() => caches.match(request))
        .then((cached) => cached || fetchFresh)
    );
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
