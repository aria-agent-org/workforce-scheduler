import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: attach auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 with token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          });
          localStorage.setItem("access_token", data.access_token);
          localStorage.setItem("refresh_token", data.refresh_token);
          original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original);
        } catch {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        }
      } else {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

// Helper to get tenant slug
export function getTenantSlug(): string {
  return "demo"; // For now, hardcoded to demo tenant
}

// API helpers
export function tenantApi(path: string) {
  return `/api/v1/${getTenantSlug()}${path}`;
}

export default api;
