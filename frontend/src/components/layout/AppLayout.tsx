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
        if (!data || Object.keys(data).length === 0) return;

        // Helper: convert hex color to HSL values string for CSS variables
        const hexToHSL = (hex: string): string | null => {
          if (!hex) return null;
          hex = hex.replace("#", "");
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          let h = 0, s = 0;
          const l = (max + min) / 2;
          if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
          }
          return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
        };

        // Apply primary color as the main theme color (overrides Tailwind --primary)
        if (data.primary_color) {
          const hsl = hexToHSL(data.primary_color);
          if (hsl) {
            document.documentElement.style.setProperty("--primary", hsl);
            document.documentElement.style.setProperty("--ring", hsl);
          }
        }
        if (data.secondary_color) {
          const hsl = hexToHSL(data.secondary_color);
          if (hsl) document.documentElement.style.setProperty("--secondary", hsl);
        }
        if (data.accent_color) {
          const hsl = hexToHSL(data.accent_color);
          if (hsl) document.documentElement.style.setProperty("--accent", hsl);
        }

        // Update favicon
        if (data.favicon_url) {
          const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
          if (link) link.href = data.favicon_url;
        }

        // Update page title
        if (data.app_name) {
          document.title = data.app_name;
        }

        // Apply custom CSS
        if (data.custom_css) {
          document.getElementById("tenant-branding-css")?.remove();
          const style = document.createElement("style");
          style.id = "tenant-branding-css";
          style.textContent = data.custom_css;
          document.head.appendChild(style);
        }
      } catch {
        // Branding not configured — use defaults, no error needed
      }
    })();
  }, [isAuthenticated]);

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Check if first-time user needs onboarding
  const onboardingDone = localStorage.getItem("shavtzak_onboarding_done");
  if (!onboardingDone && user?.role_name && ["tenant_admin", "super_admin"].includes(user.role_name)) {
    // Only redirect admins to onboarding — soldiers don't need it
    // Check localStorage so we only show it once
  }

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
        <main id="main-content" className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 scroll-smooth page-transition" role="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <InstallBanner />
    </div>
  );
}
