/* Cache-bucket version. Bump it whenever the SHELL (HTML + unhashed assets)
   changes in a way a returning viewer must not keep: the install/activate path
   deletes every other streamly-* bucket, and boot.js wipes the old ones on the
   matching `_sv` bump, so an update-skipped client cannot keep rendering a
   previous bundle. v19.8: the old player loader GIF, the pre-fix rail/search
   layout sheets and the resolve-time "Server X has no stream" note are gone. */
const CACHE_NAME = 'streamly-v19.8';
// Separate long-lived image cache — stale-while-revalidate so images load
// from disk in <10ms on repeat visits, then silently refresh in background.
const IMAGE_CACHE = 'streamly-images-v19.8';

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
  // Navigation preload: the browser starts fetching the next document in
  // parallel with SW startup instead of waiting for this worker to boot and
  // dispatch the fetch handler — that race is pure latency on first navigate.
  // Not every context exposes it (or accepts enable()), so never let it reject
  // the whole activate.
  const preload =
    self.registration && self.registration.navigationPreload
      ? self.registration.navigationPreload.enable().catch(() => {})
      : Promise.resolve();
  // Delete OLD caches only, preserving the current CACHE_NAME and IMAGE_CACHE
  event.waitUntil(
    Promise.all([
      preload,
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k !== CACHE_NAME && k !== IMAGE_CACHE)
              .map((k) => caches.delete(k))
          )
        ),
    ])
      .then(() =>
        Promise.all([
          trimCache(CACHE_NAME, SHELL_CACHE_MAX, SHELL_PROTECTED),
          trimCache(IMAGE_CACHE, IMAGE_CACHE_MAX, []),
        ])
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

// A 404 on an immutable hashed asset can only mean the served index.html
// shell is from an old deploy (Vercel purges old hashes). Wipe the SW buckets
// and ask every open tab to reload so the next boot starts from the fresh
// shell instead of retrying dead bundles forever.
async function cleanStaleShell() {
  try {
    await Promise.all([caches.delete(CACHE_NAME), caches.delete(IMAGE_CACHE)]);
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      client.postMessage({ type: 'STALE_SHELL_RECOVERY' });
    }
  } catch {
    // Best effort — the next version bump also purges everything on activate.
  }
}

// CacheStorage has no built-in eviction: every wsrv image, every visited SPA
// route and every deploy's hashed assets pile into these buckets until the
// browser decides the origin is out of disk space — months of browsing can
// quietly grow them to hundreds of MB. Keep them bounded: when a write pushes
// past the cap, drop the oldest entries first. The offline shell keys are
// untouchable, and a skipped run self-corrects on the next put or SW boot.
const IMAGE_CACHE_MAX = 600;
const SHELL_CACHE_MAX = 150;
const SHELL_PROTECTED = ['/', '/index.html'];

async function trimCache(name, maxEntries, protectedPaths) {
  try {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    // keys() is insertion-ordered on every current engine: oldest first.
    const victims = keys
      .filter((k) => !protectedPaths.includes(new URL(k.url).pathname))
      .slice(0, keys.length - maxEntries);
    await Promise.all(victims.map((k) => cache.delete(k)));
  } catch {
    // Housekeeping must never be able to fail the request that scheduled it.
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 0a. A non-GET request is never intercepted. Cache.put() accepts GET only, so
  //     a POST that reached any caching branch threw "Request method 'POST' is
  //     unsupported" as an unhandled promise rejection — which is what every
  //     /api/stream resolve/save POST did. Nothing below may assume more
  //     than a GET from here on.
  if (request.method !== 'GET') return;

  // 0. wsrv.nl CDN images — stale-while-revalidate, 7-day freshness.
  //    Serve from cache instantly; refresh in the background so the next
  //    visit gets the latest version. Enables offline poster viewing.
  if (url.origin === 'https://wsrv.nl' && request.method === 'GET') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((res) => {
            if (res && res.ok) {
              // The put must swallow its own quota failures — a floating
              // rejection here was one unhandled promise per bad write — and
              // each write is the moment to trim the bucket back to its cap.
              cache
                .put(request, res.clone())
                .then(() => trimCache(IMAGE_CACHE, IMAGE_CACHE_MAX, []))
                .catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        // Return cached immediately (stale-while-revalidate)
        return cached ?? fetchPromise;
      })
    );
    return;
  }

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
        // Prefer the preloaded response (starts before this worker was even
        // woken); fall back to a plain fetch if the preload failed or was
        // never offered. A rejected preload must not cost the navigation.
        let response = null;
        if (event.preloadResponse) {
          try {
            response = await event.preloadResponse;
          } catch {
            response = null;
          }
        }
        if (!response) response = await fetch(request);
        if (response && response.status === 200) {
          const responseClone = response.clone();
          // Best effort: a full disk quota must not surface as an unhandled
          // rejection, and must never cost the visitor the response itself.
          caches
            .open(CACHE_NAME)
            .then((cache) =>
              Promise.all([
                cache.put(cacheKey, responseClone.clone()),
                cache.put('/index.html', responseClone),
              ])
            )
            .then(() => trimCache(CACHE_NAME, SHELL_CACHE_MAX, SHELL_PROTECTED))
            .catch(() => {});
        }
        return response;
      } catch {
        const cached =
          (await caches.match(cacheKey).catch(() => null)) ||
          (await caches.match('/index.html').catch(() => null)) ||
          (await caches.match('/').catch(() => null));
        if (cached) return cached; // offline — serve last-known-good shell

        // Never synthesize a 502 response. Return a clean offline fallback page.
        // (CSP-safe: no inline scripts/handlers at all — Retry is a plain link.)
        return new Response(
          '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Streamly — Offline</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0a0a0c;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}h1{font-size:1.75rem;margin:0 0 12px;font-weight:700}p{color:#a1a1aa;margin:0 0 24px;max-width:400px;line-height:1.5}a{display:inline-block;background:#95ff50;color:#050505;padding:12px 28px;border-radius:999px;font-weight:600;font-size:0.95rem;text-decoration:none;transition:transform 0.2s}a:active{transform:scale(0.96)}</style></head><body><h1>Streamly is offline</h1><p>We couldn\'t load this page because your device appears to be offline. Reconnect and try again.</p><a href="/" >Retry</a></body></html>',
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

  // 4a. Content-hashed Vite output (/assets/*, served `immutable` for a year) —
  //     CACHE-FIRST. The filename changes whenever the bytes change, so a hit can
  //     never be stale: it is the same file the CDN would return. Network-first
  //     here used to re-download the entire critical path (~800KB of chunks) on
  //     every single visit, which is most of a repeat visit's load time.
  if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response && response.status === 200) {
          // A cache write must not be able to fail the delivery it was
          // opportunistically copying.
          await cache.put(event.request, response.clone()).catch(() => {});
          await trimCache(CACHE_NAME, SHELL_CACHE_MAX, SHELL_PROTECTED);
        } else if (response && response.status === 404) {
          // Only a stale index.html explains a 404 on a hash nobody else requests.
          await cleanStaleShell();
        }
        return response;
      })()
    );
    return;
  }

  // 4b. Unhashed same-origin JS/CSS (sw.js, boot.js) — network-first,
  // so a deploy is always picked up. A 404 means the served shell is stale: fall
  // back to a cached copy and self-heal so it can't keep 404ing later.
  if (event.request.url.match(/\.(js|css)$/)) {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseClone))
              .then(() => trimCache(CACHE_NAME, SHELL_CACHE_MAX, SHELL_PROTECTED))
              .catch(() => {});
            return response;
          }
          const cached = await caches.match(event.request);
          if (response && response.status === 404) {
            await cleanStaleShell();
          }
          return cached || response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 5. Cache-first for images, fonts, and other assets. Only ever reached by a
  //    same-origin GET: non-GET returned at 0a, cross-origin at 1, /api/ at 2.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, responseClone))
            .then(() => trimCache(CACHE_NAME, SHELL_CACHE_MAX, SHELL_PROTECTED))
            .catch(() => {});
        }
        return response;
      });
    })
  );
});