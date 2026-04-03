import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { X, CheckCircle, AlertTriangle, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  duration?: number;
}

interface ToastContextType {
  toast: (type: Toast["type"], message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colors = {
  success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/40 dark:border-green-700 dark:text-green-200",
  error: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/40 dark:border-red-700 dark:text-red-200",
  warning: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-200",
  info: "bg-primary-50 border-primary-200 text-primary-800 dark:bg-primary-900/40 dark:border-primary-700 dark:text-primary-200",
};

const progressColors = {
  success: "bg-green-500",
  error: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-primary-500",
};

const iconColors = {
  success: "text-green-500 dark:text-green-400",
  error: "text-red-500 dark:text-red-400",
  warning: "text-amber-500 dark:text-amber-400",
  info: "text-primary-500 dark:text-primary-400",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: Toast["type"], message: string, duration = 5000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message, duration }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Listen for global permission-denied events from PermissionGuard
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      addToast("error", detail?.message || "אין לך הרשאה לדף זה", 5000);
    };
    document.addEventListener("shavtzak:permission-denied", handler);
    return () => document.removeEventListener("shavtzak:permission-denied", handler);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container — top-right on desktop, top-center on mobile */}
      <div className="fixed top-4 end-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none max-sm:end-auto max-sm:start-1/2 max-sm:-translate-x-1/2 rtl:max-sm:translate-x-1/2 max-sm:w-[calc(100vw-2rem)]" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div
              key={t.id}
              role="alert"
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3.5 shadow-elevation-3 pointer-events-auto overflow-hidden relative",
                colors[t.type]
              )}
              style={{ animation: "slideInFromRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }}
            >
              <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", iconColors[t.type])} aria-hidden="true" />
              <span className="text-sm font-medium flex-1 leading-relaxed">{t.message}</span>
              <button 
                onClick={() => removeToast(t.id)} 
                className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity p-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5" 
                aria-label="סגור התראה"
              >
                <X className="h-4 w-4" />
              </button>
              {/* Progress bar */}
              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-black/5 dark:bg-white/5">
                <div 
                  className={cn("h-full rounded-full", progressColors[t.type])}
                  style={{ 
                    animation: `progressShrink ${(t.duration || 5000) / 1000}s linear forwards`,
                  }} 
                />
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
