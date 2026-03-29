import { create } from "zustand";
import api from "@/lib/api";
import { setTokens, clearTokens, isAuthenticated } from "@/lib/auth";

interface User {
  id: string;
  email: string;
  tenant_id: string | null;
  tenant_slug: string | null;
  role_name: string | null;
  employee_id: string | null;
  preferred_language: string;
  is_active: boolean;
  two_factor_enabled: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: isAuthenticated(),
  isLoading: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setTokens(data.access_token, data.refresh_token);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore — clear tokens anyway
    }
    clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  fetchUser: async () => {
    if (!isAuthenticated()) return;
    set({ isLoading: true });
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data, isAuthenticated: true, isLoading: false });
    } catch {
      clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  isAdmin: () => {
    const user = get().user;
    if (!user) return false;
    return user.role_name === "super_admin" || user.role_name === "tenant_admin";
  },
}));
