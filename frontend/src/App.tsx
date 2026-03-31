import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppLayout from "./components/layout/AppLayout";
import LoadingSpinner from "./components/common/LoadingSpinner";
import ErrorBoundary from "./components/common/ErrorBoundary";
import PermissionGuard from "./components/common/PermissionGuard";
import { ToastProvider } from "./components/ui/toast";
import { useThemeStore } from "./stores/themeStore";
import { KeyboardShortcutsProvider } from "./components/common/KeyboardShortcuts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const AcceptInvitationPage = lazy(() => import("./pages/auth/AcceptInvitationPage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const SoldiersPage = lazy(() => import("./pages/soldiers/SoldiersPage"));
const SchedulingPage = lazy(() => import("./pages/scheduling/SchedulingPage"));
const MissionDetailPage = lazy(() => import("./pages/scheduling/MissionDetailPage"));
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
const MySettingsPage = lazy(() => import("./pages/my/MySettingsPage"));

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
                <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
                <Route path="/join/:token" element={<AcceptInvitationPage />} />
                <Route path="/onboarding" element={<OnboardingWizard />} />

                {/* Main admin/manager layout — all guarded */}
                <Route path="/" element={<AppLayout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />

                  {/* Dashboard — everyone can see */}
                  <Route path="dashboard" element={
                    <PermissionGuard page="dashboard"><DashboardPage /></PermissionGuard>
                  } />

                  {/* Soldiers — scheduler+ */}
                  <Route path="soldiers" element={
                    <PermissionGuard page="soldiers"><SoldiersPage /></PermissionGuard>
                  } />
                  <Route path="employees" element={<Navigate to="/soldiers" replace />} />

                  {/* Scheduling — scheduler+ */}
                  <Route path="scheduling" element={
                    <PermissionGuard page="scheduling"><SchedulingPage /></PermissionGuard>
                  } />
                  <Route path="missions/:id" element={
                    <PermissionGuard page="my"><MissionDetailPage /></PermissionGuard>
                  } />

                  {/* Attendance — scheduler+ */}
                  <Route path="attendance" element={
                    <PermissionGuard page="attendance"><AttendancePage /></PermissionGuard>
                  } />

                  {/* Rules — scheduler+ */}
                  <Route path="rules" element={
                    <PermissionGuard page="rules"><RulesPage /></PermissionGuard>
                  } />

                  {/* Notifications — commander+ */}
                  <Route path="notifications" element={
                    <PermissionGuard page="notifications"><NotificationsPage /></PermissionGuard>
                  } />

                  {/* Reports — commander+ */}
                  <Route path="reports" element={
                    <PermissionGuard page="reports"><ReportsPage /></PermissionGuard>
                  } />

                  {/* Settings — tenant_admin+ */}
                  <Route path="settings" element={
                    <PermissionGuard page="settings"><SettingsPage /></PermissionGuard>
                  } />

                  {/* Audit log — tenant_admin+ */}
                  <Route path="audit-log" element={
                    <PermissionGuard page="audit-log"><AuditLogPage /></PermissionGuard>
                  } />

                  {/* Swaps — commander+ */}
                  <Route path="swaps" element={
                    <PermissionGuard page="swaps"><SwapRequestsPage /></PermissionGuard>
                  } />

                  {/* Admin panel — super_admin ONLY */}
                  <Route path="admin" element={
                    <PermissionGuard roles={["super_admin"]}><AdminPage /></PermissionGuard>
                  } />

                  {/* Help / profile — everyone */}
                  <Route path="help" element={
                    <PermissionGuard page="help"><HelpPage /></PermissionGuard>
                  } />
                  <Route path="profile" element={
                    <PermissionGuard page="profile"><MyProfilePage /></PermissionGuard>
                  } />
                </Route>

                {/* Soldier self-service layout — any authenticated user */}
                <Route path="/my" element={<SoldierLayout />}>
                  <Route index element={<Navigate to="/my/schedule" replace />} />
                  <Route path="schedule" element={<MySchedulePage />} />
                  <Route path="swap" element={<MySwapPage />} />
                  <Route path="notifications" element={<MyNotificationsPage />} />
                  <Route path="profile" element={<MyProfilePage />} />
                  <Route path="settings" element={<MySettingsPage />} />
                  <Route path="mission/:id" element={<MissionDetailPage />} />
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
