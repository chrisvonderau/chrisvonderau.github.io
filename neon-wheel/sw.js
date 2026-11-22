'use strict';

const CACHE_NAME = 'neon-wheel-v4';
const CACHE_PREFIX = 'neon-wheel-';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './neon-sounds-v4.mp3'];
const SCOPE_URL = new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.map((path) => new Request(new URL(path, SCOPE_URL), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== SCOPE_URL.origin ||
      !url.pathname.startsWith(SCOPE_URL.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(request);
    if (hit) {
      const range = request.headers.get('range');
      if (range && url.pathname === new URL('./neon-sounds-v4.mp3', SCOPE_URL).pathname) {
        return fromMediaRange(hit, range);
      }
      return hit;
    }
    // Launches with a query string should also work after the initial online visit.
    if (request.mode === 'navigate' &&
        (url.pathname === SCOPE_URL.pathname || url.pathname === new URL('./index.html', SCOPE_URL).pathname)) {
      const shell = await cache.match(new URL('./index.html', SCOPE_URL).href);
      if (shell) return shell;
    }
    return fetch(request);
  })());
});

async function fromMediaRange(response, range) {
  const bytes = await response.arrayBuffer();
  const size = bytes.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(range);
  const bad = () => new Response(null, { status:416, headers:{'Content-Range': 'bytes */' + size} });
  if (!m || (!m[1] && !m[2])) return bad();
  const start = m[1] ? Number(m[1]) : Math.max(0,size-Number(m[2]));
  const end = m[1] && m[2] ? Math.min(size-1,Number(m[2])) : size-1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>=size || start>end) return bad();
  return new Response(bytes.slice(start,end+1), {status:206, headers:{
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(end-start+1),
    'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
    'Accept-Ranges': 'bytes'
  }});
}
