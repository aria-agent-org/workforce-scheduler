import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppLayout from "./components/layout/AppLayout";
import LoadingSpinner from "./components/common/LoadingSpinner";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { ToastProvider } from "./components/ui/toast";
import { useThemeStore } from "./stores/themeStore";
import { KeyboardShortcutsProvider } from "./components/common/KeyboardShortcuts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const SoldiersPage = lazy(() => import("./pages/soldiers/SoldiersPage"));
const SchedulingPage = lazy(() => import("./pages/scheduling/SchedulingPage"));
const AttendancePage = lazy(() => import("./pages/attendance/AttendancePage"));
const RulesPage = lazy(() => import("./pages/rules/RulesPage"));
const NotificationsPage = lazy(() => import("./pages/notifications/NotificationsPage"));
const ReportsPage = lazy(() => import("./pages/reports/ReportsPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const AuditLogPage = lazy(() => import("./pages/audit/AuditLogPage"));
const SwapRequestsPage = lazy(() => import("./pages/swaps/SwapRequestsPage"));
const AdminPage = lazy(() => import("./pages/admin/AdminPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const OnboardingWizard = lazy(() => import("./pages/onboarding/OnboardingWizard"));
const HelpPage = lazy(() => import("./pages/help/HelpPage"));

// Soldier self-service
const SoldierLayout = lazy(() => import("./pages/my/SoldierLayout"));
const MySchedulePage = lazy(() => import("./pages/my/MySchedulePage"));
const MySwapPage = lazy(() => import("./pages/my/MySwapPage"));
const MyNotificationsPage = lazy(() => import("./pages/my/MyNotificationsPage"));
const MyProfilePage = lazy(() => import("./pages/my/MyProfilePage"));

function App() {
  const { i18n } = useTranslation();
  const dir = i18n.language === "he" ? "rtl" : "ltr";
  const initTheme = useThemeStore(s => s.initialize);

  useEffect(() => { initTheme(); }, [initTheme]);

  document.documentElement.dir = dir;
  document.documentElement.lang = i18n.language;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <KeyboardShortcutsProvider>
        <BrowserRouter>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/onboarding" element={<OnboardingWizard />} />

                {/* Main admin/manager layout */}
                <Route path="/" element={<AppLayout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="soldiers" element={<SoldiersPage />} />
                  <Route path="employees" element={<Navigate to="/soldiers" replace />} />
                  <Route path="scheduling" element={<SchedulingPage />} />
                  <Route path="attendance" element={<AttendancePage />} />
                  <Route path="rules" element={<RulesPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="audit-log" element={<AuditLogPage />} />
                  <Route path="swaps" element={<SwapRequestsPage />} />
                  <Route path="admin" element={<AdminPage />} />
                  <Route path="help" element={<HelpPage />} />
                  <Route path="profile" element={<MyProfilePage />} />
                </Route>

                {/* Soldier self-service layout */}
                <Route path="/my" element={<SoldierLayout />}>
                  <Route index element={<Navigate to="/my/schedule" replace />} />
                  <Route path="schedule" element={<MySchedulePage />} />
                  <Route path="swap" element={<MySwapPage />} />
                  <Route path="notifications" element={<MyNotificationsPage />} />
                  <Route path="profile" element={<MyProfilePage />} />
                </Route>

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </KeyboardShortcutsProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
