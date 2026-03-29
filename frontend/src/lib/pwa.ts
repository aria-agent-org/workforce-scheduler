// PWA Registration, Install Prompt, and Offline handling

let deferredPrompt: any = null;
let installPromptShown = false;

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[SW] Registered:', reg.scope);

        // Listen for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                // New version available
                if (navigator.serviceWorker.controller) {
                  document.dispatchEvent(new CustomEvent('shavtzak:sw-update'));
                }
              }
            });
          }
        });

        // Background sync registration
        if ('sync' in reg) {
          await (reg as any).sync.register('shavtzak-sync').catch(() => {});
        }
      } catch (err) {
        console.error('[SW] Registration failed:', err);
      }
    });

    // Listen for sync messages from SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        document.dispatchEvent(new CustomEvent('shavtzak:sync-complete', {
          detail: event.data,
        }));
      }
    });
  }
}

// Install prompt handling
export function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    deferredPrompt = e;

    // Check visit count for "show after 2 visits" requirement
    const visits = parseInt(localStorage.getItem('shavtzak-visits') || '0') + 1;
    localStorage.setItem('shavtzak-visits', String(visits));

    if (visits >= 2 && !installPromptShown && !isInstalled()) {
      installPromptShown = true;
      document.dispatchEvent(new CustomEvent('shavtzak:install-prompt'));
    }
  });

  // Track visits
  const visits = parseInt(localStorage.getItem('shavtzak-visits') || '0') + 1;
  localStorage.setItem('shavtzak-visits', String(visits));
}

export async function showInstallPrompt(): Promise<boolean> {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

export function canInstall(): boolean {
  return !!deferredPrompt;
}

export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
}

// Online/offline tracking
export function setupOfflineTracking() {
  const update = () => {
    document.dispatchEvent(new CustomEvent('shavtzak:online-change', {
      detail: { online: navigator.onLine },
    }));
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
}

// Badge API for notification count
export async function setBadgeCount(count: number) {
  try {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        await (navigator as any).setAppBadge(count);
      } else {
        await (navigator as any).clearAppBadge();
      }
    }
  } catch (e) {
    // Badge API not supported
  }
}
