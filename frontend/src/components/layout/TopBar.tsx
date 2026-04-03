import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useThemeStore } from "@/stores/themeStore";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  LogOut, Globe, Menu, X, LayoutDashboard, Users, Calendar,
  ClipboardList, ShieldCheck, Bell, BarChart3, Settings, Sun, Moon, Monitor,
  HelpCircle, BellRing,
} from "lucide-react";
import { cn } from "@/lib/utils";
import GlobalSearch from "../common/GlobalSearch";
import api, { tenantApi } from "@/lib/api";
import { subscribeToPush, isPushSupported, getPushPermission, isPushSubscribed, getLastPushError } from "@/lib/push";

const mobileNav = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "soldiers", path: "/soldiers", icon: Users },
  { key: "scheduling", path: "/scheduling", icon: Calendar },
  { key: "attendance", path: "/attendance", icon: ClipboardList },
  { key: "rules", path: "/rules", icon: ShieldCheck },
  { key: "notifications", path: "/notifications", icon: Bell },
  { key: "reports", path: "/reports", icon: BarChart3 },
  { key: "settings", path: "/settings", icon: Settings },
  { key: "profile", path: "/profile", icon: HelpCircle },
];

export default function TopBar() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useThemeStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  // Load in-app notifications with proper unread count
  const loadNotifications = useCallback(async () => {
    try {
      // Try the self-service endpoint first for accurate unread count
      let items: any[] = [];
      let unread = 0;

      try {
        const myRes = await api.get(tenantApi("/my/notifications"), {
          params: { page_size: 10 },
        });
        items = myRes.data.items || myRes.data || [];
        unread = items.filter((n: any) => !n.read_at && n.status !== "read").length;
      } catch {
        // Fallback to notifications/logs
        const res = await api.get(tenantApi("/notifications/logs"), {
          params: { page_size: 10, channel: "in_app" },
        });
        items = res.data.items || res.data || [];
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        unread = items.filter((n: any) => n.sent_at > oneDayAgo && n.status === "sent").length;
      }

      setNotifications(items.slice(0, 10));
      setUnreadCount(unread);
    } catch {
      // Silent fail for notifications
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Auto-subscribe to push on first load for existing sessions
  useEffect(() => {
    const autoSubscribe = async () => {
      if (!isPushSupported()) return;
      const perm = getPushPermission();
      // If already granted but not subscribed — subscribe silently
      if (perm === "granted") {
        const subscribed = await isPushSubscribed();
        if (!subscribed) {
          const ok = await subscribeToPush();
          if (!ok) {
            console.warn("[TopBar] Silent push re-subscribe failed:", getLastPushError());
          }
        }
      }
    };
    // Delay to not block initial render
    const timer = setTimeout(autoSubscribe, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Listen for push subscribe event from login flow
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail?.message;
      if (msg) {
        loadNotifications();
      }
    };
    document.addEventListener("shavtzak:push-subscribed", handler);
    return () => document.removeEventListener("shavtzak:push-subscribed", handler);
  }, [loadNotifications]);

  // Listen for real-time WebSocket notification events
  useEffect(() => {
    const handler = () => {
      // Immediately increment badge, then refresh from server
      setUnreadCount(prev => prev + 1);
      loadNotifications();
    };
    document.addEventListener("shavtzak:notification-received", handler);
    return () => document.removeEventListener("shavtzak:notification-received", handler);
  }, [loadNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleLanguage = () => {
    const newLang = i18n.language === "he" ? "en" : "he";
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === "he" ? "rtl" : "ltr";
    document.documentElement.lang = newLang;
  };

  const cycleTheme = () => {
    const order: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  };

  const themeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const ThemeIcon = themeIcon;

  return (
    <>
      <header className="sticky top-0 z-30 flex h-12 sm:h-14 items-center justify-between border-b border-border/30 px-3 md:px-6 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? "סגור תפריט" : "פתח תפריט"} aria-expanded={mobileOpen}>
            {mobileOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
          </button>
          <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
        </div>
        <div className="flex items-center gap-2">
          <GlobalSearch />
          {/* Notifications Bell */}
          <div className="relative" ref={notifRef}>
            <Button variant="ghost" size="sm" onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) loadNotifications(); }} className="relative" aria-label="התראות" aria-expanded={notifOpen}>
              {unreadCount > 0 ? <BellRing className="h-4 w-4 text-primary-500" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 h-4 min-w-[16px] flex items-center justify-center rounded-full bg-amber-500 text-[10px] text-black font-bold px-1" aria-live="polite" aria-label={`${unreadCount} התראות חדשות`}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
            {notifOpen && (
              <div className="absolute end-0 top-full mt-2 w-80 rounded-xl border bg-card shadow-elevation-4 z-50 overflow-hidden animate-scale-in">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                  <h3 className="text-sm font-bold">התראות</h3>
                  {unreadCount > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 text-xs">{unreadCount} חדשות</Badge>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                      אין התראות
                    </div>
                  ) : notifications.map((n: any, i: number) => (
                    <div key={n.id || i} className="px-4 py-3 border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <p className="text-sm">{n.body_sent || n.event_type_code}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">
                          {n.sent_at ? new Date(n.sent_at).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : ""}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{n.channel}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2 border-t bg-muted/20">
                  <a href="/notifications" className="text-xs text-primary-500 hover:underline">הצג הכל →</a>
                </div>
              </div>
            )}
          </div>
          {/* Dark Mode Toggle */}
          <Button variant="ghost" size="sm" onClick={cycleTheme} title={`Theme: ${theme}`} aria-label="החלף ערכת נושא">
            <ThemeIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleLanguage} aria-label="החלף שפה">
            <Globe className="me-1 h-4 w-4" aria-hidden="true" />
            {i18n.language === "he" ? "EN" : "עב"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.location.href = "/profile"} aria-label="הפרופיל שלי">
            <Users className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={logout} aria-label="יציאה">
            <LogOut className="me-1 h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("logout")}</span>
          </Button>
        </div>
      </header>

      {/* Mobile Navigation */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)}>
          <nav className="w-64 h-full bg-card border-e overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex h-16 items-center justify-center border-b">
              <h1 className="text-xl font-bold text-primary-500">{t("appName")}</h1>
            </div>
            <div className="mt-4 space-y-1 px-3">
              {mobileNav.map(({ key, path, icon: Icon }) => (
                <NavLink
                  key={key}
                  to={path}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                        : "text-muted-foreground hover:bg-accent"
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span>{t(`nav.${key}`)}</span>
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
