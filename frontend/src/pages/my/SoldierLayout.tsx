import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { Calendar, ArrowLeftRight, Bell, UserCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";

const navItems = [
  { path: "/my/schedule", label: "שיבוץ", icon: Calendar },
  { path: "/my/swap", label: "החלפות", icon: ArrowLeftRight },
  { path: "/my/notifications", label: "התראות", icon: Bell },
  { path: "/my/profile", label: "פרופיל", icon: UserCircle },
  { path: "/my/settings", label: "הגדרות", icon: Settings },
];

export default function SoldierLayout() {
  const { isAuthenticated, fetchUser, user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) navigate("/login");
    else if (!user) fetchUser();
  }, [isAuthenticated]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b glass-surface px-4 py-3 shadow-elevation-1 safe-area-pt">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-lg font-bold gradient-text flex items-center gap-2">
            🎯 שבצק
          </h1>
          <span className="text-xs text-muted-foreground">
            {/* Soldier portal — no admin link */}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto px-3 sm:px-4 pt-4 pb-24 max-w-lg mx-auto w-full">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 z-50 border-t glass-surface shadow-elevation-3 safe-area-pb">
        <div className="flex items-center justify-around py-1.5 max-w-lg mx-auto">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition-all min-w-[64px] rounded-xl",
                  isActive
                    ? "text-primary-600 font-semibold"
                    : "text-muted-foreground active:scale-95"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    "flex items-center justify-center h-7 w-7 rounded-lg transition-all duration-200",
                    isActive ? "bg-primary-100 dark:bg-primary-900/30 scale-110" : ""
                  )}>
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.8} />
                  </div>
                  <span>{label}</span>
                  {isActive && <div className="h-0.5 w-4 rounded-full bg-primary-500 mt-0.5" />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
