import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Users, Calendar, ClipboardList, ShieldCheck,
  Bell, BarChart3, Settings, ArrowLeftRight, History, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

const navItems = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "soldiers", path: "/soldiers", icon: Users },
  { key: "scheduling", path: "/scheduling", icon: Calendar },
  { key: "attendance", path: "/attendance", icon: ClipboardList },
  { key: "rules", path: "/rules", icon: ShieldCheck },
  { key: "notifications", path: "/notifications", icon: Bell },
  { key: "reports", path: "/reports", icon: BarChart3 },
  { key: "settings", path: "/settings", icon: Settings },
];

const secondaryItems = [
  { key: "swaps", path: "/swaps", icon: ArrowLeftRight },
  { key: "auditLog", path: "/audit-log", icon: History },
];

const adminItems = [
  { key: "admin", path: "/admin", icon: Shield },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = !user?.tenant_id;

  return (
    <aside className="hidden w-64 flex-shrink-0 border-e bg-card md:flex md:flex-col">
      <div className="flex h-16 items-center justify-center border-b px-4">
        <h1 className="text-xl font-bold text-primary-500">
          🎯 {t("appName")}
        </h1>
      </div>
      <nav className="mt-2 flex-1 space-y-0.5 px-3 overflow-y-auto">
        {navItems.map(({ key, path, icon: Icon }) => (
          <NavLink
            key={key}
            to={path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                "hover:bg-accent hover:text-accent-foreground",
                "active:scale-[0.98]",
                isActive
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 shadow-sm"
                  : "text-muted-foreground"
              )
            }
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            <span>{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
        <div className="my-3 border-t" />
        {secondaryItems.map(({ key, path, icon: Icon }) => (
          <NavLink
            key={key}
            to={path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                "hover:bg-accent hover:text-accent-foreground",
                "active:scale-[0.98]",
                isActive
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 shadow-sm"
                  : "text-muted-foreground"
              )
            }
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            <span>{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
        {isSuperAdmin && (
          <>
            <div className="my-3 border-t" />
            {adminItems.map(({ key, path, icon: Icon }) => (
              <NavLink
                key={key}
                to={path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                    "hover:bg-accent hover:text-accent-foreground",
                    isActive
                      ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 shadow-sm"
                      : "text-muted-foreground"
                  )
                }
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span>{t(`nav.${key}`)}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
