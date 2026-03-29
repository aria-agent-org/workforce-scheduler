import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    if (store.isAuthenticated && !store.user) {
      store.fetchUser();
    }
  }, [store.isAuthenticated, store.user, store.fetchUser]);

  return store;
}
