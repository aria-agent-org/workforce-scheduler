import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { WifiOff, Wifi } from "lucide-react";

export default function OfflineBanner() {
  const { i18n } = useTranslation();
  const lang = i18n.language as "he" | "en";
  const [online, setOnline] = useState(navigator.onLine);
  const [showReconnect, setShowReconnect] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setOnline(detail.online);
      if (detail.online) {
        setShowReconnect(true);
        setTimeout(() => setShowReconnect(false), 3000);
      }
    };
    document.addEventListener("shavtzak:online-change", handler);

    const syncHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.synced > 0) {
        // Show sync complete notification
      }
    };
    document.addEventListener("shavtzak:sync-complete", syncHandler);

    return () => {
      document.removeEventListener("shavtzak:online-change", handler);
      document.removeEventListener("shavtzak:sync-complete", syncHandler);
    };
  }, []);

  if (online && !showReconnect) return null;

  return (
    <div className={`fixed top-0 inset-x-0 z-[60] safe-area-top transition-all ${
      online ? "bg-green-500" : "bg-red-500"
    }`}>
      <div className="flex items-center justify-center gap-2 py-1 text-white text-xs font-medium">
        {online ? (
          <><Wifi className="h-3 w-3" /> {lang === "he" ? "חזרת לאינטרנט" : "Back online"}</>
        ) : (
          <><WifiOff className="h-3 w-3" /> {lang === "he" ? "אין חיבור — עובד במצב לא מקוון" : "Offline — working in offline mode"}</>
        )}
      </div>
    </div>
  );
}
