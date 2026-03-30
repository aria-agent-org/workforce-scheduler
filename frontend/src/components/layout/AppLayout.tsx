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

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const user = useAuthStore((s) => s.user);

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Soldiers/viewers/unauthenticated roles → redirect to soldier self-service portal
  const role = resolveRole(user?.role_name);
  if (role === "soldier" || role === "viewer" || role === "none") {
    return <Navigate to="/my/schedule" replace />;
  }

  return (
    <div className="flex h-[100dvh] bg-background">
      <OfflineBanner />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 scroll-smooth">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <InstallBanner />
    </div>
  );
}
