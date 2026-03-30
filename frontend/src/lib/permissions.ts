/**
 * Centralized permission/role checking for the frontend.
 *
 * Role hierarchy (highest → lowest):
 *   super_admin → tenant_admin → scheduler/commander → viewer → soldier → (no role)
 *
 * Users with no role_name get "none" — they can only see /my/* and dashboard.
 */

export type RoleName =
  | "super_admin"
  | "tenant_admin"
  | "admin"
  | "scheduler"
  | "commander"
  | "viewer"
  | "soldier"
  | "none";

/** Normalise whatever comes from the API into a known role key. */
export function resolveRole(roleName: string | null | undefined): RoleName {
  if (!roleName) return "none";
  const r = roleName.toLowerCase().replace(/\s+/g, "_");
  if (r === "super_admin") return "super_admin";
  if (r === "tenant_admin") return "tenant_admin";
  if (r === "admin") return "tenant_admin"; // alias
  if (r === "scheduler" || r === "משבץ") return "scheduler";
  if (r === "commander" || r === "מפקד") return "commander";
  if (r === "viewer" || r === "צופה") return "viewer";
  if (r === "soldier" || r === "חייל") return "soldier";
  return "none";
}

/**
 * Which abstract pages / features each role can access.
 * "all" is a shorthand for every resource.
 */
const ROLE_PAGES: Record<RoleName, Set<string>> = {
  super_admin: new Set(["all"]),
  tenant_admin: new Set([
    "dashboard", "soldiers", "scheduling", "attendance",
    "rules", "notifications", "reports", "settings",
    "swaps", "audit-log", "help", "profile", "my",
  ]),
  scheduler: new Set([
    "dashboard", "soldiers", "scheduling", "attendance",
    "rules", "reports", "swaps", "notifications",
    "help", "profile", "my",
  ]),
  commander: new Set([
    "dashboard", "soldiers", "scheduling", "attendance",
    "reports", "swaps", "notifications",
    "help", "profile", "my",
  ]),
  viewer: new Set([
    "help", "profile", "my",
  ]),
  soldier: new Set([
    "help", "profile", "my",
  ]),
  none: new Set([
    "help", "profile", "my",
  ]),
};

/** Check whether a role can access a specific page key. */
export function canAccessPage(roleName: string | null | undefined, pageKey: string): boolean {
  const role = resolveRole(roleName);
  const allowed = ROLE_PAGES[role];
  return allowed.has("all") || allowed.has(pageKey);
}

/** Check whether a role is at least as powerful as another. */
export function hasMinRole(roleName: string | null | undefined, minRole: RoleName): boolean {
  const hierarchy: RoleName[] = [
    "super_admin",
    "tenant_admin",
    "scheduler",
    "commander",
    "viewer",
    "soldier",
    "none",
  ];
  const userIdx = hierarchy.indexOf(resolveRole(roleName));
  const minIdx = hierarchy.indexOf(minRole);
  return userIdx <= minIdx; // lower index = more powerful
}

/** Convenience: is user a super_admin? */
export function isSuperAdmin(roleName: string | null | undefined): boolean {
  return resolveRole(roleName) === "super_admin";
}

/** Convenience: is user at least tenant_admin? */
export function isAtLeastAdmin(roleName: string | null | undefined): boolean {
  return hasMinRole(roleName, "tenant_admin");
}

/** Convenience: is user at least scheduler? */
export function isAtLeastScheduler(roleName: string | null | undefined): boolean {
  return hasMinRole(roleName, "scheduler");
}
