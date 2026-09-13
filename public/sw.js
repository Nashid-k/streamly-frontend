const CACHE_NAME = 'streamly-v10';

self.addEventListener('install', (event) => {
  // Pre-cache core shell so navigations always have index.html
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(['/', '/index.html']).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Delete OLD caches only, preserving the current CACHE_NAME
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
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
  const url = new URL(request.url);

  // 1. Cross-origin requests (TMDB API, fonts, CDN images) pass through untouched.
  if (url.origin !== self.location.origin) return;

  // 2. Pass through /api/ requests untouched!
  // TMDB proxy and same-origin API calls manage their own timeout and automatic
  // fallback to direct TMDB. Intercepting them causes the SW to swallow errors
  // and emit synthetic 502 responses that break client failover.
  if (url.pathname.startsWith('/api/')) return;

  // 3. HTML / SPA Navigations — network-first, with cached index.html shell fallback
  const isNavOrSpaRoute =
    request.mode === 'navigate' ||
    request.headers.get('accept')?.includes('text/html') ||
    (!url.pathname.includes('.') && request.method === 'GET');

  if (isNavOrSpaRoute) {
    const cacheKey = cacheKeyFor(request);

    const handle = async () => {
      try {
        const response = await fetch(request);
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(cacheKey, responseClone.clone());
            cache.put('/index.html', responseClone);
          });
        }
        return response;
      } catch {
        const cached =
          (await caches.match(cacheKey).catch(() => null)) ||
          (await caches.match('/index.html').catch(() => null)) ||
          (await caches.match('/').catch(() => null));
        if (cached) return cached; // offline — serve last-known-good shell

        // Never synthesize a 502 response. Return a clean offline fallback page.
        return new Response(
          '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Streamly — Offline</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0a0a0c;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}h1{font-size:1.75rem;margin:0 0 12px;font-weight:700}p{color:#a1a1aa;margin:0 0 24px;max-width:400px;line-height:1.5}button{background:#95ff50;color:#050505;border:none;padding:12px 28px;border-radius:999px;font-weight:600;font-size:0.95rem;cursor:pointer;transition:transform 0.2s}button:active{transform:scale(0.96)}</style></head><body><h1>Streamly is offline</h1><p>We couldn\'t load this page because your device appears to be offline. Reconnect and try again.</p><button onclick="window.location.reload()">Retry</button></body></html>',
          {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }
        );
      }
    };

    event.respondWith(handle());
    return;
  }

  // 4. Hashed JS/CSS assets — network-first. Files are immutable (hashed), so a
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
          return caches.match(event.request).then((cached) => cached || response);
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 5. Cache-first for images, fonts, and other assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      });
    })
  );
});