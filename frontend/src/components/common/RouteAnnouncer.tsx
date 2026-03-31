import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const routeLabels: Record<string, string> = {
  "/dashboard": "לוח בקרה",
  "/soldiers": "חיילים",
  "/scheduling": "שיבוצים",
  "/attendance": "נוכחות",
  "/rules": "חוקים",
  "/notifications": "התראות",
  "/reports": "דוחות",
  "/settings": "הגדרות",
  "/swaps": "בקשות החלפה",
  "/audit-log": "יומן ביקורת",
  "/admin": "ניהול מערכת",
  "/help": "עזרה",
  "/profile": "פרופיל",
  "/my/schedule": "השיבוץ שלי",
  "/my/swap": "בקשות ההחלפה שלי",
  "/my/notifications": "ההתראות שלי",
  "/my/profile": "הפרופיל שלי",
  "/my/settings": "הגדרות אישיות",
  "/login": "כניסה",
  "/onboarding": "הגדרה ראשונית",
};

/**
 * Announces route changes to screen readers via a live region.
 * Also manages focus by moving it to the main content area.
 */
export default function RouteAnnouncer() {
  const location = useLocation();
  const announcerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Find the best label for the current route
    const path = location.pathname;
    let label = routeLabels[path];
    
    if (!label) {
      // Try matching partial paths
      for (const [route, routeLabel] of Object.entries(routeLabels)) {
        if (path.startsWith(route)) {
          label = routeLabel;
          break;
        }
      }
    }

    if (label && announcerRef.current) {
      announcerRef.current.textContent = `ניווט ל${label}`;
    }

    // Move focus to main content
    const main = document.getElementById("main-content");
    if (main) {
      main.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  return (
    <div
      ref={announcerRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  );
}
