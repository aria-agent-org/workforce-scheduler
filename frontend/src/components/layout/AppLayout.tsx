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
        // Try channels branding first (set via TenantFeaturesPage), fallback to settings branding
        let data: Record<string, any> = {};
        try {
          const res = await api.get(tenantApi("/channels/branding"));
          data = res.data?.branding || {};
        } catch { /* ignore */ }
        // Also merge settings branding (for backwards compatibility)
        try {
          const res2 = await api.get(tenantApi("/settings/branding"));
          if (res2.data && Object.keys(res2.data).length > 0) {
            data = { ...res2.data, ...data }; // channels branding takes priority
          }
        } catch { /* ignore */ }
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

        // Store timezone preference for date utilities
        if (data.timezone) {
          localStorage.setItem("tenant_timezone", data.timezone);
        } else if (!localStorage.getItem("tenant_timezone")) {
          // Default to Israel timezone
          localStorage.setItem("tenant_timezone", "Asia/Jerusalem");
        }

        // Update manifest link to point to backend dynamic manifest
        const existingManifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement;
        if (existingManifestLink && data.app_name) {
          // The static manifest is served by nginx; we patch meta tags dynamically
          const metaTheme = document.querySelector("meta[name='theme-color']") as HTMLMetaElement;
          if (metaTheme && data.primary_color) metaTheme.content = data.primary_color;
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

  // Check if first-time admin needs onboarding
  // Priority: if localStorage says completed/skipped → trust it (fast path, avoids API call)
  // Otherwise: check API for DB status
  const onboardingCompleted = localStorage.getItem("shavtzak_onboarding_completed");
  const onboardingStarted = localStorage.getItem("shavtzak_onboarding");
  const isAdmin = user?.role_name && ["tenant_admin", "super_admin"].includes(user.role_name);

  // Only redirect to onboarding if:
  // 1. User is admin
  // 2. localStorage says NOT completed
  // 3. No in-progress state in localStorage (first visit)
  const isFirstTimeAdmin =
    !onboardingCompleted &&
    !onboardingStarted &&
    isAdmin;

  if (isFirstTimeAdmin) {
    // Mark as started so we don't redirect again on next render (they can complete later)
    localStorage.setItem("shavtzak_onboarding", JSON.stringify({ currentStep: 0, completed: {}, fromAutoRedirect: true }));
    return <Navigate to="/onboarding" replace />;
  }

  // If admin has in-progress state (started but not completed), redirect to resume
  const isAdminWithInProgress =
    !onboardingCompleted &&
    onboardingStarted &&
    isAdmin;

  if (isAdminWithInProgress) {
    try {
      const parsed = JSON.parse(onboardingStarted);
      // Only redirect if they were auto-redirected (not manually navigated away)
      if (parsed?.fromAutoRedirect && window.location.pathname !== "/onboarding") {
        // Don't redirect again — let them use the app normally
        // They can access /onboarding manually if needed
      }
    } catch {
      // ignore parse errors
    }
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
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* TopBar: sticky at top, full width */}
        <div className="sticky top-0 z-40 flex-shrink-0">
          <TopBar />
        </div>
        <main
          id="main-content"
          className="flex-1 overflow-y-auto p-3 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6 scroll-smooth page-transition"
          role="main"
          tabIndex={-1}
        >
          <Outlet />
        </main>
      </div>
      {/* BottomNav: fixed at bottom, above safe area */}
      <BottomNav />
      <InstallBanner />
    </div>
  );
}
