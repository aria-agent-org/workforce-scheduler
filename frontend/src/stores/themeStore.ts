import { create } from "zustand";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  initialize: () => void;
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem("shavtzak-theme") as Theme) || "system",
  resolvedTheme: "light",

  setTheme: (theme: Theme) => {
    localStorage.setItem("shavtzak-theme", theme);
    const resolved = theme === "system" ? getSystemTheme() : theme;
    applyTheme(resolved);
    set({ theme, resolvedTheme: resolved });
  },

  initialize: () => {
    const stored = (localStorage.getItem("shavtzak-theme") as Theme) || "system";
    const resolved = stored === "system" ? getSystemTheme() : stored;
    applyTheme(resolved);
    set({ theme: stored, resolvedTheme: resolved });

    // Listen for system theme changes
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", (e) => {
      const current = get().theme;
      if (current === "system") {
        const newResolved = e.matches ? "dark" : "light";
        applyTheme(newResolved);
        set({ resolvedTheme: newResolved });
      }
    });
  },
}));
