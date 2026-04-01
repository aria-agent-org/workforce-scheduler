/**
 * Date/time utilities — defaults to Asia/Jerusalem timezone (Israel Standard Time)
 * Use these helpers for all date/time formatting to ensure consistent timezone handling.
 */

export const DEFAULT_TIMEZONE = "Asia/Jerusalem";
export const DEFAULT_LOCALE = "he-IL";

/**
 * Get the effective tenant timezone.
 * In the future, this can be read from tenant settings.
 * For now it defaults to Asia/Jerusalem.
 */
export function getTenantTimezone(): string {
  // Could be stored in localStorage from tenant settings
  return localStorage.getItem("tenant_timezone") || DEFAULT_TIMEZONE;
}

/**
 * Format a date string or Date object to display in Israel timezone.
 */
export function formatDate(
  date: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions
): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(DEFAULT_LOCALE, {
      timeZone: getTenantTimezone(),
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...opts,
    });
  } catch {
    return String(date);
  }
}

/**
 * Format a date-time string or Date object to display in Israel timezone.
 */
export function formatDateTime(
  date: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions
): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(DEFAULT_LOCALE, {
      timeZone: getTenantTimezone(),
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      ...opts,
    });
  } catch {
    return String(date);
  }
}

/**
 * Format time only (HH:MM) in Israel timezone.
 */
export function formatTime(
  date: string | Date | null | undefined
): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString(DEFAULT_LOCALE, {
      timeZone: getTenantTimezone(),
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(date);
  }
}

/**
 * Get today's date in YYYY-MM-DD format in Israel timezone.
 */
export function todayIL(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: getTenantTimezone() });
}

/**
 * Format a Hebrew relative date (today/tomorrow/yesterday/date).
 */
export function formatRelativeDate(dateStr: string): string {
  const today = todayIL();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  if (dateStr === today) return "היום";
  if (dateStr === tomorrowStr) return "מחר";
  if (dateStr === yesterdayStr) return "אתמול";
  return formatDate(dateStr);
}

/**
 * Convert a date to start of day in Israel timezone (UTC equivalent).
 */
export function startOfDayIL(dateStr: string): Date {
  // Create date at midnight Israel time
  const dt = new Date(`${dateStr}T00:00:00`);
  return dt;
}
