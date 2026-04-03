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

/**
 * Safely extract a displayable string from a value that might be:
 * - A plain string → return as-is
 * - A JSONB object with {he, en} keys → extract by language
 * - An object → JSON.stringify to prevent React error #300
 * - null/undefined → return fallback
 */
export function safeStr(value: any, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    // JSONB bilingual name pattern
    if (value.he || value.en) {
      const lang = localStorage.getItem("i18nextLng") || "he";
      return value[lang] || value.he || value.en || fallback;
    }
    // Other object — stringify to prevent React crash
    try { return JSON.stringify(value); } catch { return fallback; }
  }
  return String(value) || fallback;
}
