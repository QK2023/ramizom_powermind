'use strict';
// Ramizom PowerMind offline shell.
//
// An installed copy has to keep itself current without the user uninstalling or clearing
// anything, so everything this worker stores is served *network-first*: while online every
// launch revalidates against the server and picks up new files, and the cache is consulted
// only when the network fails. Nothing is ever pinned to an older release.
//
// The manifest and the icons are deliberately left alone. Chrome re-reads them in the
// background to refresh an installed app; a cached copy would freeze its name, colours and
// its launcher / splash artwork.
const SHELL_CACHE = 'powermind-shell-v4';
const SHELL_ASSETS = ['./index.html', './style.css', './app.js', './i18n.js'];
const BROWSER_OWNED = /(?:^|\/)(?:manifest\.webmanifest|icon[\w.-]*\.(?:svg|png)|apple-touch-icon(?:-\d+)?\.png|favicon\.ico)$/;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_ASSETS.map(asset => cache
      .add(new Request(new URL(asset, self.location).href, { cache: 'reload' }))
      .catch(() => { /* The offline copy is best effort; a miss only costs offline support. */ })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys().catch(() => []);
    await Promise.all(names
      .filter(name => name.startsWith('powermind-') && name !== SHELL_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  let url;
  try { url = new URL(request.url); } catch (error) { return; }
  if (url.origin !== self.location.origin) return;
  if (BROWSER_OWNED.test(url.pathname)) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const key = request.mode === 'navigate' ? new URL('./index.html', self.location).href : request;
  try {
    // 'no-cache' revalidates with the server instead of trusting a heuristic HTTP cache
    // entry, which is what let a stale style.css/app.js survive a plain reload before.
    const response = await fetch(request, { cache: 'no-cache' });
    if (response && response.ok && response.type === 'basic') {
      cache.put(key, response.clone()).catch(() => { /* Offline copy only. */ });
    }
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}
