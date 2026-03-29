import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  ShieldCheck,
  Bell,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "employees", path: "/employees", icon: Users },
  { key: "scheduling", path: "/scheduling", icon: Calendar },
  { key: "attendance", path: "/attendance", icon: ClipboardList },
  { key: "rules", path: "/rules", icon: ShieldCheck },
  { key: "notifications", path: "/notifications", icon: Bell },
  { key: "reports", path: "/reports", icon: BarChart3 },
  { key: "settings", path: "/settings", icon: Settings },
];

export default function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="hidden w-64 flex-shrink-0 border-e bg-card md:block">
      <div className="flex h-16 items-center justify-center border-b px-4">
        <h1 className="text-xl font-bold text-primary-500">
          {t("appName")}
        </h1>
      </div>
      <nav className="mt-4 space-y-1 px-3">
        {navItems.map(({ key, path, icon: Icon }) => (
          <NavLink
            key={key}
            to={path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span>{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
