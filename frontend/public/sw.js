// Build: 2026-03-31T12:15:00Z — Sprint 4 deployed
const BUILD_TS = 1743422100000;
const CACHE_VERSION = `v5-${BUILD_TS}`;
const CACHE_NAME = `shavtzak-${CACHE_VERSION}`;
const API_CACHE = `shavtzak-api-${CACHE_VERSION}`;
const OFFLINE_QUEUE_KEY = 'shavtzak-offline-queue';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== API_CACHE).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Always network-first for API and HTML
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || 
      event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  
  // Cache-first for static assets (they have content hashes)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }
  
  // Network-first for everything else
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
