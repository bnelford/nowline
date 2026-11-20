// NowLine service worker: makes the app installable and lets it open with no network.
// Registered by src/sw-register.js. All URLs are relative to this file, so it works at / and at a
// sub-path like https://bnelford.github.io/nowline/.
//
// - Navigations: network first, falling back to the cached index.html when offline.
// - Same-origin static files: stale-while-revalidate (answer from cache, refresh in the background).
// - Cross-origin requests (schedule feeds, the feed relay) are never touched or cached.
//
// VERSION names the cache. Bump it by hand when needed; scripts/site.js replaces it with a hash of the
// site's files when building the Pages artifact, so every deploy with changed files gets a fresh cache.
const VERSION = 'dev';
const CACHE = 'nowline-' + VERSION;

// Everything the app needs to start. test/unit/sw.test.js checks this against src/, vendor/ and the manifest.
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'src/agenda.js',
  'src/app.js',
  'src/demo.js',
  'src/ics.js',
  'src/samples.js',
  'src/schedule.js',
  'src/signs.js',
  'src/stars.js',
  'src/sw-register.js',
  'src/tz.js',
  'vendor/qrcode.js',
  'vendor/qrcode.LICENSE',
  'assets/brand/favicon.svg',
  'assets/brand/favicon-16.png',
  'assets/brand/favicon-32.png',
  'assets/brand/icon-192.png',
  'assets/brand/icon-512.png',
  'assets/brand/icon-maskable-512.png',
  'assets/brand/apple-touch-icon.png',
];

const scope = () => self.registration.scope;
const INDEX = () => new URL('index.html', scope()).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the HTTP cache, so a new version never precaches an old file
    await cache.addAll(PRECACHE.map((p) => new Request(new URL(p, scope()), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('nowline-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Only complete, same-origin 200s are safe to store (not opaque, redirected or partial/Range responses).
const cacheable = (res) => res && res.status === 200 && res.type === 'basic' && !res.redirected;

async function navigate(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    // keep the cached shell current: the app is one page, whatever query or hash a link carries
    const path = new URL(request.url).pathname;
    if (cacheable(res) && (path === new URL(scope()).pathname || path === new URL(INDEX()).pathname)) {
      await cache.put(INDEX(), res.clone());
    }
    return res;
  } catch (err) {
    const cached = await cache.match(INDEX());
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request).then(async (res) => {
    if (cacheable(res)) await cache.put(event.request, res.clone());
    return res;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => {}));   // offline or failed: the cached copy stands
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;            // feeds and the relay: straight to the network
  if (request.mode === 'navigate') { event.respondWith(navigate(request)); return; }
  if (request.headers.has('range')) return;                    // media seeking (tour audio): leave to the browser
  event.respondWith(staleWhileRevalidate(event));
});
