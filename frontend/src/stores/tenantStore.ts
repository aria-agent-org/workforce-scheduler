import { create } from "zustand";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

interface TenantState {
  tenant: Tenant | null;
  setTenant: (tenant: Tenant) => void;
  clearTenant: () => void;
}

export const useTenantStore = create<TenantState>((set) => ({
  tenant: null,

  setTenant: (tenant: Tenant) => set({ tenant }),

  clearTenant: () => set({ tenant: null }),
}));
