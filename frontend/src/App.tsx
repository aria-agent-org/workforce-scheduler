import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppLayout from "./components/layout/AppLayout";
import LoadingSpinner from "./components/common/LoadingSpinner";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { ToastProvider } from "./components/ui/toast";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const EmployeesPage = lazy(() => import("./pages/employees/EmployeesPage"));
const SchedulingPage = lazy(() => import("./pages/scheduling/SchedulingPage"));
const AttendancePage = lazy(() => import("./pages/attendance/AttendancePage"));
const RulesPage = lazy(() => import("./pages/rules/RulesPage"));
const NotificationsPage = lazy(() => import("./pages/notifications/NotificationsPage"));
const ReportsPage = lazy(() => import("./pages/reports/ReportsPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const AuditLogPage = lazy(() => import("./pages/audit/AuditLogPage"));
const SwapRequestsPage = lazy(() => import("./pages/swaps/SwapRequestsPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function App() {
  const { i18n } = useTranslation();
  const dir = i18n.language === "he" ? "rtl" : "ltr";

  document.documentElement.dir = dir;
  document.documentElement.lang = i18n.language;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<AppLayout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="employees" element={<EmployeesPage />} />
                  <Route path="scheduling" element={<SchedulingPage />} />
                  <Route path="attendance" element={<AttendancePage />} />
                  <Route path="rules" element={<RulesPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="audit-log" element={<AuditLogPage />} />
                  <Route path="swaps" element={<SwapRequestsPage />} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
