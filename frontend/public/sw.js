// Auto-bump: cache version derived from build timestamp injected by build tool,
// or falls back to a date-based version. When new JS files are deployed, the SW
// will detect changed files and update the cache automatically.
const BUILD_TS = self.__BUILD_TIMESTAMP || Date.now();
const CACHE_VERSION = `v4-${BUILD_TS}`;
const CACHE_NAME = `shavtzak-${CACHE_VERSION}`;
const API_CACHE = `shavtzak-api-${CACHE_VERSION}`;
const OFFLINE_QUEUE_KEY = 'shavtzak-offline-queue';

// App shell files to precache
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches (any cache not matching current version)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests: Network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    // Non-GET mutations: queue when offline and sync when back online
    if (event.request.method !== 'GET') {
      event.respondWith(
        fetch(event.request).catch(() => {
          // Queue for later sync
          return queueOfflineAction(event.request).then(() => {
            // Notify clients about the queued action
            notifyClients({ type: 'OFFLINE_QUEUED', url: event.request.url, method: event.request.method });
            return new Response(JSON.stringify({ queued: true, message: 'פעולה תבוצע כשתחזור לאינטרנט' }), {
              headers: { 'Content-Type': 'application/json' },
              status: 202,
            });
          });
        })
      );
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful GET responses
          if (response.ok) {
            const cloned = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => {
          // Serve from cache when offline
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return new Response(JSON.stringify({ offline: true, message: 'אין חיבור לאינטרנט' }), {
              headers: { 'Content-Type': 'application/json' },
              status: 503,
            });
          });
        })
    );
    return;
  }

  // Static assets: Network first with cache update (ensures new deploys are picked up)
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|woff2?|ttf|ico)$/)) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      }).catch(() => {
        // Fallback to cache only when offline — show last cached version
        return caches.match(event.request);
      })
    );
    return;
  }

  // Navigation: Network first, fallback to cached index.html (SPA)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', cloned));
          return response;
        })
        .catch(() => {
          // Show last cached version when offline
          return caches.match('/index.html').then(r => r || caches.match('/'));
        })
    );
    return;
  }

  // Default: network first with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Queue offline mutations for sync when back online
async function queueOfflineAction(request) {
  try {
    const body = await request.clone().text();
    const queue = JSON.parse((await getFromIDB(OFFLINE_QUEUE_KEY)) || '[]');
    queue.push({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      timestamp: Date.now(),
    });
    await putToIDB(OFFLINE_QUEUE_KEY, JSON.stringify(queue));

    // Register for background sync if available
    if (self.registration.sync) {
      await self.registration.sync.register('shavtzak-sync');
    }
  } catch (e) {
    console.error('Failed to queue offline action:', e);
  }
}

// Background sync — process queued form submissions when back online
self.addEventListener('sync', (event) => {
  if (event.tag === 'shavtzak-sync') {
    event.waitUntil(processOfflineQueue());
  }
});

// Also process queue when connectivity is restored (fallback for browsers without sync API)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ONLINE_RESTORED') {
    processOfflineQueue();
  }
});

async function processOfflineQueue() {
  const queueStr = await getFromIDB(OFFLINE_QUEUE_KEY);
  if (!queueStr) return;

  const queue = JSON.parse(queueStr);
  if (queue.length === 0) return;

  const remaining = [];

  for (const item of queue) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
    } catch {
      remaining.push(item);
    }
  }

  await putToIDB(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));

  // Notify all clients about sync completion
  notifyClients({
    type: 'SYNC_COMPLETE',
    synced: queue.length - remaining.length,
    remaining: remaining.length,
  });
}

// Helper to notify all clients
async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage(message);
  }
}

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'שבצק';
  const options = {
    body: data.body || 'התראה חדשה',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    dir: 'rtl',
    lang: 'he',
    data: data.url || '/',
    actions: data.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// Simple IDB helpers for offline queue
function getIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('shavtzak-sw', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getFromIDB(key) {
  const db = await getIDB();
  return new Promise((resolve) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function putToIDB(key, value) {
  const db = await getIDB();
  return new Promise((resolve) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
  });
}
