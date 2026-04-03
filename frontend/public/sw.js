// Build: 2026-04-03T15:30:00Z — v10 force refresh for mobile compact UI
const BUILD_TS = '20260403-1530';
const CACHE_VERSION = `v10-${BUILD_TS}`;
const STATIC_CACHE = `shavtzak-static-${CACHE_VERSION}`;
const API_CACHE = `shavtzak-api-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/index.html';

// Static assets to pre-cache
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install: pre-cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches, claim clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(n => n !== STATIC_CACHE && n !== API_CACHE).map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API & admin requests: network-first, cache fallback for GET
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/admin/')) {
    if (event.request.method === 'GET') {
      event.respondWith(
        fetch(event.request)
          .then(response => {
            // Cache successful GET responses
            if (response.ok) {
              const clone = response.clone();
              caches.open(API_CACHE).then(cache => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => caches.match(event.request))
      );
    }
    // POST/PUT/DELETE: queue for background sync if offline
    return;
  }

  // Page navigations: network-first, fallback to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_PAGE))
    );
    return;
  }

  // Static assets: cache-first (JS, CSS, images)
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});

// Background sync for offline actions
self.addEventListener('sync', event => {
  if (event.tag === 'sync-actions') {
    event.waitUntil(syncOfflineActions());
  }
});

async function syncOfflineActions() {
  // Get queued actions from IndexedDB
  // TODO: implement IndexedDB queue for offline mutations
}

// Push notification handler
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'שבצק';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    dir: 'rtl',
    lang: 'he',
    tag: data.tag || 'shavtzak-notification',
    renotify: true,
    data: { url: data.url || '/' },
    actions: data.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  // Focus existing window or open new one
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        for (const client of clients) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

// Notification action click (e.g., "approve swap")
self.addEventListener('notificationclick', event => {
  if (event.action) {
    // Handle specific actions
    const data = event.notification.data || {};
    event.notification.close();
    event.waitUntil(self.clients.openWindow(data.url || '/'));
  }
});

// Periodic background sync (check for updates)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-schedule-updates') {
    event.waitUntil(checkForUpdates());
  }
});

async function checkForUpdates() {
  // Fetch latest schedule and show notification if changed
  try {
    const response = await fetch('/api/v1/health');
    if (response.ok) {
      // App is online — could check for schedule changes
    }
  } catch {
    // Still offline
  }
}
