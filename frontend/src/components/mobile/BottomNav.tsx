import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Calendar, ClipboardList, Settings, MoreHorizontal,
  Users, ShieldCheck, Bell, BarChart3, ArrowLeftRight, History,
  HelpCircle, Shield, UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useMemo } from "react";
import { useAuthStore } from "@/stores/authStore";
import { canAccessPage, isSuperAdmin } from "@/lib/permissions";

interface MobileNavItem {
  key: string;
  pageKey?: string;
  path: string;
  icon: any;
  label: string;
}

const allPrimaryNav: MobileNavItem[] = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard, label: "בית" },
  { key: "scheduling", path: "/scheduling", icon: Calendar, label: "שיבוץ" },
  { key: "attendance", path: "/attendance", icon: ClipboardList, label: "נוכחות" },
  { key: "settings", path: "/settings", icon: Settings, label: "הגדרות" },
];

/** Fallback primary nav for low-permission users (viewer/soldier/none). */
const minimalPrimaryNav: MobileNavItem[] = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard, label: "בית" },
  { key: "myPortal", pageKey: "my", path: "/my/schedule", icon: UserCircle, label: "הלוח שלי" },
  { key: "help", path: "/help", icon: HelpCircle, label: "עזרה" },
];

const allMoreNav: MobileNavItem[] = [
  { key: "soldiers", path: "/soldiers", icon: Users, label: "חיילים" },
  { key: "rules", path: "/rules", icon: ShieldCheck, label: "חוקים" },
  { key: "notifications", path: "/notifications", icon: Bell, label: "התראות" },
  { key: "reports", path: "/reports", icon: BarChart3, label: "דוחות" },
  { key: "swaps", path: "/swaps", icon: ArrowLeftRight, label: "החלפות" },
  { key: "auditLog", pageKey: "audit-log", path: "/audit-log", icon: History, label: "יומן" },
  { key: "admin", path: "/admin", icon: Shield, label: "ניהול" },
];

export default function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const roleName = user?.role_name ?? null;

  // Filter items by permissions
  const filteredPrimary = useMemo(() => {
    const allowed = allPrimaryNav.filter(n => canAccessPage(roleName, n.pageKey ?? n.key));
    // If very few items, use minimal nav
    return allowed.length >= 3 ? allowed : minimalPrimaryNav.filter(n => canAccessPage(roleName, n.pageKey ?? n.key));
  }, [roleName]);

  const filteredMoreNav = useMemo(
    () => allMoreNav.filter(n => canAccessPage(roleName, n.pageKey ?? n.key)),
    [roleName]
  );

  const isMoreActive = filteredMoreNav.some(n => location.pathname.startsWith(n.path));
  const hasMoreItems = filteredMoreNav.length > 0;

  // Close overlay on route change
  useEffect(() => {
    setShowMore(false);
  }, [location.pathname]);

  return (
    <>
      {/* More menu overlay */}
      {showMore && hasMoreItems && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setShowMore(false)}
        >
          <div
            ref={overlayRef}
            className="absolute bottom-[72px] start-3 end-3 rounded-2xl bg-card border shadow-2xl p-3 safe-area-bottom animate-in slide-in-from-bottom-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="grid grid-cols-4 gap-1">
              {filteredMoreNav.map(({ key, path, icon: Icon, label }) => (
                <NavLink
                  key={key}
                  to={path}
                  onClick={() => setShowMore(false)}
                  className={({ isActive }) => cn(
                    "flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="leading-tight">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-card/95 backdrop-blur-lg safe-area-bottom">
        <div className="flex items-center justify-around h-[68px] px-1">
          {filteredPrimary.map(({ key, path, icon: Icon, label }) => (
            <NavLink
              key={key}
              to={path}
              className={({ isActive }) => cn(
                "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[52px] transition-all active:scale-95",
                isActive
                  ? "text-primary-600 dark:text-primary-400"
                  : "text-muted-foreground"
              )}
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    "flex items-center justify-center h-8 w-8 rounded-full transition-colors",
                    isActive ? "bg-primary-100 dark:bg-primary-900/40" : ""
                  )}>
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className="text-[10px] font-medium leading-tight">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* More button — only if there are extra items */}
          {hasMoreItems && (
            <button
              onClick={() => setShowMore(!showMore)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[52px] transition-all active:scale-95",
                showMore || isMoreActive ? "text-primary-600 dark:text-primary-400" : "text-muted-foreground"
              )}
            >
              <div className={cn(
                "flex items-center justify-center h-8 w-8 rounded-full transition-colors",
                showMore || isMoreActive ? "bg-primary-100 dark:bg-primary-900/40" : ""
              )}>
                <MoreHorizontal className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium leading-tight">עוד</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
