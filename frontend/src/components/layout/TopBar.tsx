import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "../ui/button";
import {
  LogOut, Globe, Menu, X, LayoutDashboard, Users, Calendar,
  ClipboardList, ShieldCheck, Bell, BarChart3, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const mobileNav = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "employees", path: "/employees", icon: Users },
  { key: "scheduling", path: "/scheduling", icon: Calendar },
  { key: "attendance", path: "/attendance", icon: ClipboardList },
  { key: "rules", path: "/rules", icon: ShieldCheck },
  { key: "notifications", path: "/notifications", icon: Bell },
  { key: "reports", path: "/reports", icon: BarChart3 },
  { key: "settings", path: "/settings", icon: Settings },
];

export default function TopBar() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleLanguage = () => {
    const newLang = i18n.language === "he" ? "en" : "he";
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === "he" ? "rtl" : "ltr";
    document.documentElement.lang = newLang;
  };

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b bg-card px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <span className="text-sm text-muted-foreground">{user?.email}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={toggleLanguage}>
            <Globe className="me-1 h-4 w-4" />
            {i18n.language === "he" ? "EN" : "עב"}
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="me-1 h-4 w-4" />
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
                        ? "bg-primary-50 text-primary-700"
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
