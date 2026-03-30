/**
 * Route-level permission guard.
 *
 * Usage:
 *   <PermissionGuard page="settings">
 *     <SettingsPage />
 *   </PermissionGuard>
 *
 *   <PermissionGuard roles={["super_admin"]}>
 *     <AdminPage />
 *   </PermissionGuard>
 */

import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { canAccessPage, resolveRole, type RoleName } from "@/lib/permissions";
import { useEffect, useRef } from "react";

interface Props {
  /** Page key to check against the role→pages map. */
  page?: string;
  /** Explicit allow-list of role names (takes precedence over `page`). */
  roles?: RoleName[];
  children: React.ReactNode;
}

export default function PermissionGuard({ page, roles, children }: Props) {
  const user = useAuthStore((s) => s.user);
  const toastedRef = useRef(false);

  const roleName = user?.role_name;

  let allowed = false;

  if (roles && roles.length > 0) {
    // Explicit role list
    const resolved = resolveRole(roleName);
    allowed = roles.includes(resolved);
  } else if (page) {
    allowed = canAccessPage(roleName, page);
  } else {
    // No constraint specified → allow (developer mistake is not a security hole
    // because backend still enforces, but let's be safe)
    allowed = true;
  }

  // Fire a toast once when blocked (avoid re-firing on re-renders)
  useEffect(() => {
    if (!allowed && !toastedRef.current) {
      toastedRef.current = true;
      // Dispatch custom event — picked up by ToastProvider or a global listener
      document.dispatchEvent(
        new CustomEvent("shavtzak:permission-denied", {
          detail: { message: "אין לך הרשאה לדף זה" },
        })
      );
    }
  }, [allowed]);

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
