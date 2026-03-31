import { useEffect } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/authStore";
import { resolveRole } from "@/lib/permissions";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import LoadingSpinner from "../common/LoadingSpinner";
import BottomNav from "../mobile/BottomNav";
import InstallBanner from "../mobile/InstallBanner";
import OfflineBanner from "../mobile/OfflineBanner";
import api, { tenantApi } from "@/lib/api";

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const user = useAuthStore((s) => s.user);

  // Load and apply tenant branding on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const { data } = await api.get(tenantApi("/settings/branding"));
        if (data?.primary_color) {
          document.documentElement.style.setProperty("--color-primary-500", data.primary_color);
        }
        if (data?.secondary_color) {
          document.documentElement.style.setProperty("--color-secondary-500", data.secondary_color);
        }
        if (data?.accent_color) {
          document.documentElement.style.setProperty("--color-accent-500", data.accent_color);
        }
        if (data?.favicon_url) {
          const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
          if (link) link.href = data.favicon_url;
        }
        if (data?.custom_css) {
          const style = document.createElement("style");
          style.id = "tenant-branding-css";
          style.textContent = data.custom_css;
          // Remove old one if exists
          document.getElementById("tenant-branding-css")?.remove();
          document.head.appendChild(style);
        }
      } catch {
        // Branding not configured — use defaults, no error needed
      }
    })();
  }, [isAuthenticated]);

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Soldiers/viewers/unauthenticated roles → redirect to soldier self-service portal
  // BUT only if they have an employee_id (otherwise they can't use /my/)
  const role = resolveRole(user?.role_name);
  if (role === "soldier" || role === "viewer" || role === "none") {
    if (user?.employee_id) {
      return <Navigate to="/my/schedule" replace />;
    }
    // User with no role AND no employee — show limited dashboard
    // Don't redirect, let them see what PermissionGuard allows
  }

  return (
    <div className="flex h-[100dvh] bg-background">
      {/* Accessibility: Skip to main content */}
      <a href="#main-content" className="skip-to-main" tabIndex={0}>
        דלג לתוכן הראשי
      </a>
      <OfflineBanner />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main id="main-content" className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 scroll-smooth" role="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <InstallBanner />
    </div>
  );
}
