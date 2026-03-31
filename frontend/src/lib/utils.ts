import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get the tenant timezone from localStorage, defaulting to Asia/Jerusalem.
 */
export function getTenantTimezone(): string {
  return localStorage.getItem("tenant_timezone") || "Asia/Jerusalem";
}

/**
 * Format a date string in the tenant timezone.
 */
export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("he-IL", {
      timeZone: getTenantTimezone(),
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...options,
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format a time string in the tenant timezone.
 */
export function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("he-IL", {
      timeZone: getTenantTimezone(),
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format a datetime string in the tenant timezone.
 */
export function formatDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString("he-IL", {
      timeZone: getTenantTimezone(),
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}
