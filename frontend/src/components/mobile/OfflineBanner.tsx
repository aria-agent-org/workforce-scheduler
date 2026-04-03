import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { WifiOff, Wifi, RefreshCw } from "lucide-react";

export default function OfflineBanner() {
  const { i18n } = useTranslation();
  const lang = i18n.language as "he" | "en";
  const [online, setOnline] = useState(navigator.onLine);
  const [showReconnect, setShowReconnect] = useState(false);
  const [syncInfo, setSyncInfo] = useState<{ synced: number; remaining: number } | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);

  useEffect(() => {
    // Listen for custom online-change events
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setOnline(detail.online);
      if (detail.online) {
        setShowReconnect(true);
        setTimeout(() => setShowReconnect(false), 3000);
        // Notify SW that we're back online to trigger sync
        navigator.serviceWorker?.controller?.postMessage({ type: 'ONLINE_RESTORED' });
      }
    };
    document.addEventListener("shavtzak:online-change", handler);

    // Listen for native online/offline events
    const onOnline = () => {
      setOnline(true);
      setShowReconnect(true);
      setTimeout(() => setShowReconnect(false), 3000);
      navigator.serviceWorker?.controller?.postMessage({ type: 'ONLINE_RESTORED' });
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Listen for SW messages (sync complete, offline queued)
    const swHandler = (e: MessageEvent) => {
      if (e.data?.type === 'SYNC_COMPLETE') {
        setSyncInfo({ synced: e.data.synced, remaining: e.data.remaining });
        setQueuedCount(e.data.remaining);
        setTimeout(() => setSyncInfo(null), 4000);
      }
      if (e.data?.type === 'OFFLINE_QUEUED') {
        setQueuedCount(prev => prev + 1);
      }
    };
    navigator.serviceWorker?.addEventListener("message", swHandler);

    const syncHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.synced > 0) {
        setSyncInfo({ synced: detail.synced, remaining: detail.remaining });
        setTimeout(() => setSyncInfo(null), 4000);
      }
    };
    document.addEventListener("shavtzak:sync-complete", syncHandler);

    return () => {
      document.removeEventListener("shavtzak:online-change", handler);
      document.removeEventListener("shavtzak:sync-complete", syncHandler);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      navigator.serviceWorker?.removeEventListener("message", swHandler);
    };
  }, []);

  // Nothing to show
  if (online && !showReconnect && !syncInfo) return null;

  return (
    <div className={`fixed top-0 inset-x-0 z-[60] safe-area-top transition-all ${
      syncInfo ? "bg-primary-500" : online ? "bg-green-500" : "bg-red-500"
    }`}>
      <div className="flex items-center justify-center gap-2 py-1 text-white text-xs font-medium">
        {syncInfo ? (
          <><RefreshCw className="h-3 w-3 animate-spin" /> סונכרנו {syncInfo.synced} פעולות{syncInfo.remaining > 0 ? ` (${syncInfo.remaining} נותרו)` : ""}</>
        ) : online ? (
          <><Wifi className="h-3 w-3" /> {lang === "he" ? "חזרת לאינטרנט" : "Back online"}</>
        ) : (
          <>
            <WifiOff className="h-3 w-3" />
            <span>{lang === "he" ? "אתה במצב לא מקוון" : "You are offline"}</span>
            {queuedCount > 0 && (
              <span className="bg-white/20 rounded-full px-2 py-0.5">{queuedCount} פעולות ממתינות</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
