import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect, useState, useMemo } from "react";
import {
  LayoutDashboard, Users, Calendar, ClipboardList, ShieldCheck,
  Bell, BarChart3, Settings, ArrowLeftRight, History, Shield,
  HelpCircle, UserCircle, Building2, CreditCard, Activity, UserCog,
  MessageSquare, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { tenantApi } from "@/lib/api";
import api from "@/lib/api";
import { canAccessPage, isSuperAdmin } from "@/lib/permissions";

interface NavItem {
  key: string;
  /** The page-key used by the permissions system (defaults to `key`). */
  pageKey?: string;
  path: string;
  icon: any;
}

const allNavItems: NavItem[] = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "soldiers", path: "/soldiers", icon: Users },
  { key: "scheduling", path: "/scheduling", icon: Calendar },
  { key: "attendance", path: "/attendance", icon: ClipboardList },
  { key: "rules", path: "/rules", icon: ShieldCheck },
  { key: "notifications", path: "/notifications", icon: Bell },
  { key: "reports", path: "/reports", icon: BarChart3 },
  { key: "settings", path: "/settings", icon: Settings },
];

const allSecondaryItems: NavItem[] = [
  { key: "swaps", path: "/swaps", icon: ArrowLeftRight },
  { key: "auditLog", pageKey: "audit-log", path: "/audit-log", icon: History },
  { key: "chat", pageKey: "dashboard", path: "/chat", icon: MessageSquare },
  { key: "webhooks", pageKey: "settings", path: "/webhooks", icon: ExternalLink },
  { key: "help", path: "/help", icon: HelpCircle },
  { key: "profile", path: "/profile", icon: UserCog },
  { key: "myPortal", pageKey: "my", path: "/my/schedule", icon: UserCircle },
];

const adminNavItems = [
  { key: "adminTenants", path: "/admin", icon: Building2, label: "ניהול טננטים", hash: "tenants" },
  { key: "adminPlans", path: "/admin", icon: CreditCard, label: "ניהול מנויים", hash: "plans" },
  { key: "adminUsers", path: "/admin", icon: UserCog, label: "ניהול משתמשים", hash: "users" },
  { key: "adminHealth", path: "/admin", icon: Activity, label: "בריאות מערכת", hash: "health" },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
    "hover:bg-accent hover:text-accent-foreground",
    "active:scale-[0.98]",
    isActive
      ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 shadow-sm"
      : "text-muted-foreground"
  );

export default function Sidebar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const roleName = user?.role_name ?? null;
  const showAdmin = isSuperAdmin(roleName);

  // Filter nav items by user's role
  const navItems = useMemo(
    () => allNavItems.filter((n) => canAccessPage(roleName, n.pageKey ?? n.key)),
    [roleName]
  );
  const secondaryItems = useMemo(
    () => allSecondaryItems.filter((n) => canAccessPage(roleName, n.pageKey ?? n.key)),
    [roleName]
  );

  // Load counts for sidebar badges
  useEffect(() => {
    if (!user) return;
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
    loadCounts();
  }, [user]);

  return (
    <aside className="hidden w-[260px] flex-shrink-0 border-e glass-surface md:flex md:flex-col transition-all duration-300">
      <div className="flex h-16 items-center justify-center border-b px-4 bg-gradient-to-br from-primary-50/30 to-transparent dark:from-primary-900/10">
        <h1 className="text-xl font-bold gradient-text">
          🎯 {t("appName")}
        </h1>
      </div>
      <nav className="mt-2 flex-1 space-y-0.5 px-3 overflow-y-auto" aria-label="תפריט ראשי">
        {navItems.map(({ key, path, icon: Icon }) => (
          <NavLink key={key} to={path} className={linkClass} aria-label={t(`nav.${key}`)}>
            <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <span className="flex-1">{t(`nav.${key}`)}</span>
            {counts[key] != null && counts[key] > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary-500 px-1.5 text-[10px] font-bold text-white" aria-live="polite" aria-label={`${counts[key]} פריטים`}>
                {counts[key]}
              </span>
            )}
          </NavLink>
        ))}

        {secondaryItems.length > 0 && <div className="my-3 border-t" />}

        {secondaryItems.map(({ key, path, icon: Icon }) => (
          <NavLink key={key} to={path} className={linkClass} aria-label={t(`nav.${key}`)}>
            <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <span className="flex-1">{t(`nav.${key}`)}</span>
            {counts[key] != null && counts[key] > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white" aria-live="polite" aria-label={`${counts[key]} פריטים`}>
                {counts[key]}
              </span>
            )}
          </NavLink>
        ))}

        {/* Admin Section — super_admin only */}
        {showAdmin && (
          <>
            <div className="my-3 border-t" />
            <div className="px-3 py-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                ניהול מערכת
              </span>
            </div>
            {adminNavItems.map(({ key, path, icon: Icon, label, hash }) => (
              <NavLink
                key={key}
                to={`${path}?tab=${hash}`}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    "hover:bg-accent hover:text-accent-foreground",
                    "active:scale-[0.98]",
                    isActive
                      ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 shadow-sm"
                      : "text-muted-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>
      <div className="border-t p-3 bg-gradient-to-t from-muted/30 to-transparent space-y-2">
        <TelegramBanner />
        <p className="text-[10px] text-muted-foreground text-center opacity-60">שבצק v0.2.0</p>
      </div>
    </aside>
  );
}

function TelegramBanner() {
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("telegram_banner_dismissed") === "true";
  });

  useEffect(() => {
    if (dismissed) return;
    api.get(tenantApi("/channels/features")).then(res => {
      const features = res.data?.features || {};
      if (features.channel_telegram) {
        // Try to get telegram bot username
        api.get(tenantApi("/channels")).then(chRes => {
          const channels = Array.isArray(chRes.data) ? chRes.data : [];
          const tg = channels.find((c: any) => c.channel === "telegram" && c.is_enabled);
          if (tg?.config?.bot_username) {
            setBotUsername(tg.config.bot_username);
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [dismissed]);

  if (!botUsername || dismissed) return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    localStorage.setItem("telegram_banner_dismissed", "true");
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/30 px-2.5 py-1.5 text-xs text-primary-700 dark:text-primary-300">
      <a
        href={`https://t.me/${botUsername}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
      >
        <span className="text-base flex-shrink-0">📱</span>
        <div className="min-w-0">
          <p className="font-medium truncate">@{botUsername}</p>
          <p className="text-[10px] opacity-70">בוט Telegram — לחץ להתחברות</p>
        </div>
      </a>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity p-0.5 rounded"
        title="סגור"
        aria-label="סגור"
      >
        ✕
      </button>
    </div>
  );
}
