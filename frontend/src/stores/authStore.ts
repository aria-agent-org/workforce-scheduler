import { create } from "zustand";
import api from "@/lib/api";
import { setTokens, clearTokens, isAuthenticated } from "@/lib/auth";

interface User {
  id: string;
  email: string;
  tenant_id: string | null;
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
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: isAuthenticated(),
  isLoading: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setTokens(data.access_token, data.refresh_token);
      const userRes = await api.get("/auth/me");
      set({ user: userRes.data, isAuthenticated: true, isLoading: false });
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
}));
