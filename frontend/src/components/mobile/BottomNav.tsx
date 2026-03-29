import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Calendar, ClipboardList, Users, BarChart3, Settings, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const primaryNav = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "scheduling", path: "/scheduling", icon: Calendar },
  { key: "attendance", path: "/attendance", icon: ClipboardList },
  { key: "soldiers", path: "/soldiers", icon: Users },
];

const moreNav = [
  { key: "reports", path: "/reports", icon: BarChart3 },
  { key: "settings", path: "/settings", icon: Settings },
];

export default function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);

  const isMoreActive = moreNav.some(n => location.pathname.startsWith(n.path));

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setShowMore(false)}>
          <div
            className="absolute bottom-[72px] start-4 end-4 rounded-xl bg-card border shadow-xl p-2 safe-area-bottom animate-in slide-in-from-bottom-4"
            onClick={e => e.stopPropagation()}
          >
            {moreNav.map(({ key, path, icon: Icon }) => (
              <NavLink
                key={key}
                to={path}
                onClick={() => setShowMore(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                  isActive ? "bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400" : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{t(`nav.${key}`)}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-card/95 backdrop-blur-lg safe-area-bottom">
        <div className="flex items-center justify-around h-[68px] px-2">
          {primaryNav.map(({ key, path, icon: Icon }) => (
            <NavLink
              key={key}
              to={path}
              className={({ isActive }) => cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[56px] transition-all active:scale-95",
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
                  <span className="text-[10px] font-medium leading-tight">{t(`nav.${key}`)}</span>
                </>
              )}
            </NavLink>
          ))}
          {/* More button */}
          <button
            onClick={() => setShowMore(!showMore)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[56px] transition-all active:scale-95",
              isMoreActive ? "text-primary-600 dark:text-primary-400" : "text-muted-foreground"
            )}
          >
            <div className={cn(
              "flex items-center justify-center h-8 w-8 rounded-full transition-colors",
              isMoreActive ? "bg-primary-100 dark:bg-primary-900/40" : ""
            )}>
              <MoreHorizontal className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-medium leading-tight">{t("nav.more", "עוד")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
