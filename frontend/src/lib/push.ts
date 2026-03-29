/**
 * Web Push notification helpers for Shavtzak.
 */
import api, { tenantApi } from "./api";

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
    const res = await api.get(tenantApi("/push/vapid-public-key"));
    return res.data.public_key;
  } catch {
    console.error("[Push] Failed to get VAPID public key");
    return null;
  }
}

/**
 * Subscribe the browser to push notifications and register with backend.
 * Returns true on success.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) {
    console.warn("[Push] Not supported in this browser");
    return false;
  }

  try {
    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[Push] Permission denied");
      return false;
    }

    // Get VAPID public key
    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) {
      console.error("[Push] No VAPID key available");
      return false;
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    // Send subscription to backend
    const subJSON = subscription.toJSON();
    await api.post(tenantApi("/push/subscribe"), {
      endpoint: subJSON.endpoint,
      keys: subJSON.keys,
    });

    console.log("[Push] Subscribed successfully");
    return true;
  } catch (error) {
    console.error("[Push] Subscribe failed:", error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
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
    const registration = await navigator.serviceWorker.ready;
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
