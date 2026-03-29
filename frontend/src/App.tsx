import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import AppLayout from "./components/layout/AppLayout";
import LoadingSpinner from "./components/common/LoadingSpinner";
import ErrorBoundary from "./components/common/ErrorBoundary";

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const EmployeesPage = lazy(() => import("./pages/employees/EmployeesPage"));
const SchedulingPage = lazy(() => import("./pages/scheduling/SchedulingPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function App() {
  const { i18n } = useTranslation();
  const dir = i18n.language === "he" ? "rtl" : "ltr";

  // Set document direction
  document.documentElement.dir = dir;
  document.documentElement.lang = i18n.language;

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="employees" element={<EmployeesPage />} />
              <Route path="scheduling" element={<SchedulingPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
