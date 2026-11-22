'use strict';

const CACHE_NAME = 'neon-wheel-v1';
const CACHE_PREFIX = 'neon-wheel-';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
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
    if (hit) return hit;
    // Launches with a query string should also work after the initial online visit.
    if (request.mode === 'navigate' &&
        (url.pathname === SCOPE_URL.pathname || url.pathname === new URL('./index.html', SCOPE_URL).pathname)) {
      const shell = await cache.match(new URL('./index.html', SCOPE_URL).href);
      if (shell) return shell;
    }
    return fetch(request);
  })());
});
