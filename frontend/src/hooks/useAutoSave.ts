import { useRef, useCallback, useState, useEffect } from "react";

type SaveFn = () => Promise<void>;

interface UseAutoSaveOptions {
  /** Debounce delay in ms (default 2000) */
  delay?: number;
  /** Called on save success */
  onSuccess?: () => void;
  /** Called on save error */
  onError?: (err: any) => void;
}

interface UseAutoSaveReturn {
  /** Call this whenever form data changes */
  triggerAutoSave: () => void;
  /** Whether a save is in-flight */
  saving: boolean;
  /** Whether save succeeded recently (resets after 2s) */
  saved: boolean;
  /** Whether there was a save error */
  error: boolean;
  /** Force an immediate save (bypass debounce) */
  saveNow: () => void;
}

export function useAutoSave(
  saveFn: SaveFn,
  options: UseAutoSaveOptions = {}
): UseAutoSaveReturn {
  const { delay = 2000, onSuccess, onError } = options;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);

  // Keep saveFn ref up to date
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const doSave = useCallback(async () => {
    setSaving(true);
    setError(false);
    try {
      await saveFnRef.current();
      setSaved(true);
      onSuccess?.();
      // Clear saved indicator after 2s
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(true);
      onError?.(err);
    } finally {
      setSaving(false);
    }
  }, [onSuccess, onError]);

  const triggerAutoSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doSave, delay);
  }, [doSave, delay]);

  const saveNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    doSave();
  }, [doSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  return { triggerAutoSave, saving, saved, error, saveNow };
}
