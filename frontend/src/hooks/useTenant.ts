import { useTenantStore } from "@/stores/tenantStore";

export function useTenant() {
  return useTenantStore();
}
