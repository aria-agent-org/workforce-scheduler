/**
 * Extract a human-readable error message from an API error response.
 * Prioritizes Hebrew messages when available.
 */
export const getErrorMessage = (e: any, fallback: string): string => {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message?.he) return detail.message.he;
  if (detail?.message) return typeof detail.message === 'string' ? detail.message : fallback;
  if (Array.isArray(detail)) return detail.map((d: any) => d.msg || d.message || '').join(', ') || fallback;
  return fallback;
};
