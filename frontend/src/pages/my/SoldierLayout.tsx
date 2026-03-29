import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { Calendar, ArrowLeftRight, Bell, UserCircle, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";

const navItems = [
  { path: "/my/schedule", label: "השיבוץ שלי", icon: Calendar },
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
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-primary-500">🎯 שבצק</h1>
          <NavLink to="/dashboard" className="text-sm text-muted-foreground hover:text-primary-500">
            <Home className="h-5 w-5" />
          </NavLink>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-4 pb-20">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 z-50 border-t bg-card safe-area-pb">
        <div className="flex items-center justify-around py-2">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs transition-colors min-w-[64px]",
                  isActive
                    ? "text-primary-600 font-semibold"
                    : "text-muted-foreground"
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
