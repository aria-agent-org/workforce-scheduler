/**
 * Web Push notification helpers for Shavtzak.
 * 
 * Each failure point throws/returns a SPECIFIC Hebrew error message for debugging.
 */
import api, { tenantApi } from "./api";

/** Last push error — readable by UI for debugging */
let _lastPushError: string | null = null;
export function getLastPushError(): string | null { return _lastPushError; }

/** Push debug log — visible in UI for diagnostics */
const MAX_DEBUG_ENTRIES = 10;
let _pushDebugLog: string[] = [];
export function getPushDebugLog(): string[] { return [..._pushDebugLog]; }
export function clearPushDebugLog(): void { _pushDebugLog = []; }
function pushLog(msg: string, ok: boolean = true): void {
  const time = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const entry = `[${time}] ${msg} ${ok ? '✅' : '❌'}`;
  _pushDebugLog.push(entry);
  if (_pushDebugLog.length > MAX_DEBUG_ENTRIES) _pushDebugLog.shift();
  console.log('[Push Debug]', entry);
}

/** iOS detection — push only works on iOS 16.4+ when installed to Home Screen */
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** Check if running as standalone PWA (installed to Home Screen) */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
}

/** 
 * Push status for clear UI display. 
 * Returns one of: 'active' | 'ios-not-installed' | 'prompt' | 'denied' | 'unsupported'
 */
export type PushStatus = 'active' | 'ios-not-installed' | 'prompt' | 'denied' | 'unsupported';

export async function getPushStatus(): Promise<PushStatus> {
  // Browser doesn't support push at all
  if (!isPushSupported()) return 'unsupported';
  
  // iOS but not installed to Home Screen
  if (isIOS() && !isStandalone()) return 'ios-not-installed';
  
  // Permission denied
  if (Notification.permission === 'denied') return 'denied';
  
  // Already subscribed and active
  if (Notification.permission === 'granted') {
    const subscribed = await isPushSubscribed();
    if (subscribed) return 'active';
  }
  
  // Permission not yet asked or granted but not subscribed
  return 'prompt';
}

/**
 * Convert a URL-safe base64 string to a Uint8Array (needed for PushManager.subscribe).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if push notifications are supported by the browser.
 */
export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Get the current push notification permission status.
 */
export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Get VAPID public key from the backend.
 */
export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const url = tenantApi("/push/vapid-public-key");
    console.log("[Push] Fetching VAPID key from:", url);
    const res = await api.get(url);
    const key = res.data?.public_key || res.data?.vapid_public_key || res.data?.key;
    if (!key) {
      console.error("[Push] VAPID response missing key field:", res.data);
      return null;
    }
    return key;
  } catch (err: any) {
    console.error("[Push] Failed to get VAPID public key:", err?.response?.status, err?.message);
    return null;
  }
}

/**
 * Ensure the service worker is registered and ready.
 * This resolves the common issue where navigator.serviceWorker.ready hangs
 * if the SW wasn't registered yet.
 */
async function ensureServiceWorkerReady(timeoutMs = 10000): Promise<ServiceWorkerRegistration> {
  // First check if SW is supported
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker לא נתמך בדפדפן זה");
  }

  // Check if there's already a registration
  let registration = await navigator.serviceWorker.getRegistration("/");
  
  if (!registration) {
    // Attempt to register the SW ourselves
    console.log("[Push] No SW found, registering /sw.js...");
    try {
      registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      console.log("[Push] SW registered, scope:", registration.scope);
    } catch (regErr: any) {
      console.error("[Push] SW registration failed:", regErr);
      throw new Error(`Service Worker לא מוכן — שגיאת רישום: ${regErr.message}`);
    }
  }

  // Wait for the SW to become active, with a timeout
  if (registration.active) {
    return registration;
  }

  // SW exists but isn't active yet — wait for it
  return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Service Worker לא מוכן — timeout אחרי " + (timeoutMs / 1000) + " שניות"));
    }, timeoutMs);

    // Check if installing or waiting
    const sw = registration!.installing || registration!.waiting || registration!.active;
    if (sw && sw.state === "activated") {
      clearTimeout(timer);
      resolve(registration!);
      return;
    }

    const onStateChange = () => {
      if (sw && (sw.state === "activated" || sw.state === "redundant")) {
        clearTimeout(timer);
        sw.removeEventListener("statechange", onStateChange);
        if (sw.state === "activated") {
          resolve(registration!);
        } else {
          reject(new Error("Service Worker הפך ל-redundant"));
        }
      }
    };

    if (sw) {
      sw.addEventListener("statechange", onStateChange);
    }

    // Also race with navigator.serviceWorker.ready
    navigator.serviceWorker.ready.then((readyReg) => {
      clearTimeout(timer);
      resolve(readyReg);
    }).catch(() => {});
  });
}

/**
 * Subscribe the browser to push notifications and register with backend.
 * Returns { success: true } or { success: false, error: "specific Hebrew error" }.
 */
export async function subscribeToPush(): Promise<boolean> {
  _lastPushError = null;
  pushLog("מתחיל תהליך הרשמה ל-Push...");

  // Step 1: Check browser support
  if (!isPushSupported()) {
    _lastPushError = "PushManager לא נתמך בדפדפן זה — נסה Chrome, Edge או Firefox";
    pushLog("דפדפן לא תומך ב-PushManager", false);
    return false;
  }
  pushLog("דפדפן תומך ב-Push");

  // iOS-specific checks
  if (isIOS()) {
    pushLog(`iOS זוהה — standalone: ${isStandalone()}`);
    if (!isStandalone()) {
      _lastPushError = "באייפון יש להוסיף למסך הבית לפני הפעלת התראות";
      pushLog("iOS: לא מותקן כ-PWA", false);
      return false;
    }
  }

  try {
    // Step 2: Request notification permission
    pushLog("מבקש הרשאת התראות...");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      _lastPushError = permission === "denied"
        ? "ההרשאה נדחתה — אפשר התראות בהגדרות הדפדפן (לחץ על 🔒 ליד שורת הכתובת)"
        : "ההרשאה לא אושרה (dismissed) — נסה שוב";
      pushLog(`הרשאה: ${permission}`, false);
      return false;
    }
    pushLog(`הרשאה: ${permission}`);

    // Step 3: Get VAPID public key
    pushLog("מביא מפתח VAPID מהשרת...");
    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) {
      _lastPushError = "שגיאה בקבלת מפתח VAPID מהשרת — בדוק שה-backend פועל ומחזיר vapid-public-key";
      pushLog("VAPID key — נכשל", false);
      return false;
    }
    pushLog(`VAPID key התקבל (${vapidKey.length} תווים)`);

    // Step 4: Ensure service worker is ready
    pushLog("ממתין ל-Service Worker...");
    let registration: ServiceWorkerRegistration;
    try {
      registration = await ensureServiceWorkerReady(15000);
    } catch (swErr: any) {
      _lastPushError = swErr.message || "Service Worker לא מוכן";
      pushLog(`SW: ${swErr.message}`, false);
      return false;
    }
    pushLog(`SW מוכן — scope: ${registration.scope}`);

    // Step 5: Subscribe to push via PushManager
    pushLog("נרשם ל-PushManager...");
    let subscription: PushSubscription;
    try {
      const appServerKey = urlBase64ToUint8Array(vapidKey);
      // IMPORTANT: Safari/iOS requires Uint8Array directly, NOT .buffer (ArrayBuffer)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    } catch (subErr: any) {
      // Specific handling for common errors
      if (subErr.name === "NotAllowedError") {
        _lastPushError = "NotAllowedError — יש להפעיל מתוך לחיצת כפתור (user gesture)";
      } else if (subErr.name === "AbortError") {
        _lastPushError = "AbortError — ייתכן שמפתח VAPID שגוי";
      } else {
        _lastPushError = `שגיאת הרשמה ל-PushManager: ${subErr.name} — ${subErr.message}`;
      }
      pushLog(`PushManager.subscribe: ${subErr.name}: ${subErr.message}`, false);
      return false;
    }
    pushLog(`מנוי Push נוצר — endpoint: ${subscription.endpoint.slice(0, 50)}...`);

    // Step 6: Send subscription to backend
    pushLog("שולח מנוי לשרת...");
    const subJSON = subscription.toJSON();
    try {
      const url = tenantApi("/push/subscribe");
      await api.post(url, {
        endpoint: subJSON.endpoint,
        keys: subJSON.keys,
      });
    } catch (apiErr: any) {
      _lastPushError = `שגיאה בשמירת המנוי בשרת: ${apiErr.response?.status || ""} ${apiErr.response?.data?.detail || apiErr.message}`;
      pushLog(`שמירה בשרת נכשלה: ${apiErr.response?.status || apiErr.message}`, false);
      return false;
    }

    pushLog("הרשמה הושלמה בהצלחה! 🎉");
    _lastPushError = null;
    return true;
  } catch (error: any) {
    _lastPushError = `שגיאה לא צפויה: ${error.message}`;
    pushLog(`שגיאה לא צפויה: ${error.message}`, false);
    return false;
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return true;
    
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      // Notify backend
      await api.post(tenantApi("/push/unsubscribe"), {
        endpoint: subscription.endpoint,
      }).catch(() => {});

      // Unsubscribe locally
      await subscription.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the user is currently subscribed to push.
 */
export async function isPushSubscribed(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

/**
 * Send a test push notification via the backend.
 */
export async function sendTestPush(): Promise<{ sent: number; failed: number }> {
  const res = await api.post(tenantApi("/push/test"), {
    title: "שבצק — בדיקה",
    body: "התראות Push עובדות! 🎉",
  });
  return res.data;
}

/**
 * Auto-subscribe to push after login.
 * Call this after successful authentication.
 * - If permission not asked → requests it
 * - If already granted → subscribes silently
 * - If denied → does nothing (no blocking modal)
 * Returns a message string for a subtle toast, or null if nothing happened.
 */
export async function autoSubscribeAfterLogin(): Promise<string | null> {
  if (!isPushSupported()) return null;

  // On iOS, NEVER auto-subscribe — must be user gesture from button click
  if (isIOS()) {
    console.log("[Push] Auto-subscribe skipped on iOS — requires user gesture");
    return null;
  }

  const perm = Notification.permission;

  // If already denied, don't bother
  if (perm === "denied") {
    console.log("[Push] Auto-subscribe skipped — permission denied");
    return null;
  }

  // Check if already subscribed
  const alreadySubscribed = await isPushSubscribed();
  if (alreadySubscribed) {
    console.log("[Push] Already subscribed, skipping auto-subscribe");
    return null;
  }

  // If permission is "default" (not asked yet), request it
  // If "granted", subscribe directly
  const ok = await subscribeToPush();
  if (ok) {
    return "🔔 התראות Push הופעלו";
  }
  
  // Log the specific error but don't show blocking UI
  if (_lastPushError) {
    console.warn("[Push] Auto-subscribe failed:", _lastPushError);
  }
  return null;
}
