import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { Calendar, ArrowLeftRight, Bell, UserCircle, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";

const navItems = [
  { path: "/my/schedule", label: "שיבוץ", icon: Calendar },
  { path: "/my/swap", label: "החלפות", icon: ArrowLeftRight },
  { path: "/my/notifications", label: "התראות", icon: Bell },
  { path: "/my/profile", label: "פרופיל", icon: UserCircle },
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
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur-sm px-4 py-3 shadow-sm safe-area-pt">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-lg font-bold text-primary-500 flex items-center gap-2">
            🎯 שבצק
          </h1>
          <NavLink to="/dashboard" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary-500 transition-colors px-2 py-1 rounded-lg hover:bg-muted">
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">מסך ראשי</span>
          </NavLink>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto px-3 sm:px-4 pt-4 pb-24 max-w-lg mx-auto w-full">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 z-50 border-t bg-card/95 backdrop-blur-sm safe-area-pb">
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
                    "flex items-center justify-center h-7 w-7 rounded-lg transition-colors",
                    isActive ? "bg-primary-100 dark:bg-primary-900/30" : ""
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
