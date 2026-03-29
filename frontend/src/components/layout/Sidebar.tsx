import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Calendar, ClipboardList, ShieldCheck,
  Bell, BarChart3, Settings, ArrowLeftRight, History, Shield,
  HelpCircle, UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import api, { tenantApi } from "@/lib/api";

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
  { key: "help", path: "/help", icon: HelpCircle },
  { key: "myPortal", path: "/my/schedule", icon: UserCircle },
];

const adminItems = [
  { key: "admin", path: "/admin", icon: Shield },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [isAdmin, setIsAdmin] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // Check if user is admin by trying to load admin endpoint
    // Also check by role name from user data
    const checkAdmin = async () => {
      try {
        // Try fetching tenants — if it works, user is admin
        await api.get("/admin/tenants");
        setIsAdmin(true);
      } catch {
        // User is not admin — that's fine
        setIsAdmin(false);
      }
    };
    if (user) checkAdmin();
  }, [user]);

  // Load counts for sidebar badges
  useEffect(() => {
    const loadCounts = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const [missionsRes, swapsRes] = await Promise.all([
          api.get(tenantApi("/missions"), { params: { date_from: today, date_to: today } }).catch(() => ({ data: [] })),
          api.get(tenantApi("/swap-requests"), { params: { status_filter: "pending" } }).catch(() => ({ data: [] })),
        ]);
        setCounts({
          scheduling: Array.isArray(missionsRes.data) ? missionsRes.data.length : 0,
          swaps: Array.isArray(swapsRes.data) ? swapsRes.data.length : 0,
        });
      } catch { /* ignore */ }
    };
    if (user) loadCounts();
  }, [user]);

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
            <span className="flex-1">{t(`nav.${key}`)}</span>
            {counts[key] != null && counts[key] > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary-500 px-1.5 text-[10px] font-bold text-white">
                {counts[key]}
              </span>
            )}
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
            <span className="flex-1">{t(`nav.${key}`)}</span>
            {counts[key] != null && counts[key] > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                {counts[key]}
              </span>
            )}
          </NavLink>
        ))}
        {isAdmin && (
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
      <div className="border-t p-3">
        <p className="text-[10px] text-muted-foreground text-center">שבצק v0.2.0</p>
      </div>
    </aside>
  );
}
