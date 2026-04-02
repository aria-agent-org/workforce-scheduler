import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import AutoSaveIndicator from "@/components/common/AutoSaveIndicator";
import { useAutoSave } from "@/hooks/useAutoSave";
import api, { tenantApi } from "@/lib/api";

type VisibilityLevel = "own_only" | "daily_board" | "weekly_board";

interface VisibilitySettings {
  employee_visibility_level: VisibilityLevel;
  employee_can_see_other_names: boolean;
  employee_can_see_phone_numbers: boolean;
  employee_can_see_others_attendance: boolean;
}

const DEFAULT_SETTINGS: VisibilitySettings = {
  employee_visibility_level: "own_only",
  employee_can_see_other_names: false,
  employee_can_see_phone_numbers: false,
  employee_can_see_others_attendance: false,
};

const VISIBILITY_OPTIONS: { value: VisibilityLevel; label: string; description: string }[] = [
  { value: "own_only", label: "שלי בלבד", description: "חייל רואה רק את השיבוצים של עצמו" },
  { value: "daily_board", label: "כל משימות היום", description: "חייל רואה את כל לוח המשימות של היום (שמות + תפקידים)" },
  { value: "weekly_board", label: "לוח שבועי", description: "חייל רואה את כל הלוח לשבוע שלם" },
];

const TOGGLE_OPTIONS: { key: keyof Omit<VisibilitySettings, "employee_visibility_level">; label: string; description: string }[] = [
  { key: "employee_can_see_other_names", label: "חייל רואה שמות חיילים אחרים במשימה", description: "האם להציג שמות של חיילים אחרים באותה משימה" },
  { key: "employee_can_see_phone_numbers", label: "חייל רואה מספרי טלפון", description: "האם להציג מספרי טלפון של חיילים אחרים" },
  { key: "employee_can_see_others_attendance", label: "חייל רואה נוכחות אחרים", description: "האם להציג סטטוס נוכחות של חיילים אחרים" },
];

export default function VisibilitySettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<VisibilitySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const saveFn = useCallback(async () => {
    // Save each setting as a separate tenant_setting
    const entries = Object.entries(settings);
    for (const [key, value] of entries) {
      await api.post(tenantApi("/settings"), {
        key,
        value: typeof value === "boolean" ? value : value,
        group: "visibility",
      });
    }
  }, [settings]);

  const { triggerAutoSave, saving, saved, error } = useAutoSave(saveFn, {
    delay: 2000,
    onError: () => toast("error", "שגיאה בשמירת הגדרות"),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(tenantApi("/settings"), { params: { group: "visibility" } });
      const loaded: any = { ...DEFAULT_SETTINGS };
      for (const s of res.data) {
        if (s.key in loaded) {
          const val = s.value?._v ?? s.value;
          loaded[s.key] = val;
        }
      }
      setSettings(loaded);
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateSetting = <K extends keyof VisibilitySettings>(key: K, value: VisibilitySettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    // Trigger auto-save after state update via useEffect
  };

  // Trigger auto-save whenever settings change (skip initial load)
  const initialLoadDone = useState(false);
  useEffect(() => {
    if (loading) return;
    if (!initialLoadDone[0]) {
      initialLoadDone[1](true);
      return;
    }
    triggerAutoSave();
  }, [settings]);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">טוען...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-bold">הרשאות צפייה לחיילים</h2>
        </div>
        <AutoSaveIndicator saving={saving} saved={saved} error={error} />
      </div>

      <p className="text-sm text-muted-foreground">
        הגדר מה חיילים רואים במערכת. משבצים ומנהלים רואים תמיד הכל.
      </p>

      {/* Visibility Level - Radio */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">מה חייל רואה?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {VISIBILITY_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-all ${
                settings.employee_visibility_level === opt.value
                  ? "ring-2 ring-primary-500 border-primary-300 bg-primary-50/50 dark:bg-primary-900/10"
                  : "hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name="visibility_level"
                value={opt.value}
                checked={settings.employee_visibility_level === opt.value}
                onChange={() => updateSetting("employee_visibility_level", opt.value)}
                className="mt-1 accent-primary-500 h-4 w-4"
              />
              <div>
                <span className="font-medium text-sm">{opt.label}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Toggle Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">הגדרות נוספות</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {TOGGLE_OPTIONS.map(opt => (
            <div key={opt.key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </div>
              <button
                onClick={() => updateSetting(opt.key, !settings[opt.key])}
                role="switch"
                aria-checked={settings[opt.key]}
                aria-label={opt.label}
                className={`relative flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 ${
                  settings[opt.key] ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-600"
                }`}
                style={{ width: '44px', height: '24px', minWidth: '44px' }}
              >
                <span
                  className={`absolute top-[3px] h-[22px] w-[22px] transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                    settings[opt.key] ? "translate-x-[24px] rtl:-translate-x-[24px]" : "translate-x-[3px] rtl:-translate-x-[3px]"
                  }`}
                />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
        <CardContent className="p-4 text-sm text-blue-700 dark:text-blue-300">
          <p className="font-medium mb-1">💡 שים לב:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>הגדרות אלה חלות על חיילים בלבד — משבצים ומנהלים רואים תמיד הכל</li>
            <li>ניתן לדרוס הגדרות אלה ברמת תפקיד ספציפי דרך מערכת ההרשאות</li>
            <li>שינויים נשמרים אוטומטית</li>
          </ul>
        </CardContent>
      </Card>

      {/* Manual Save Fallback */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            saveFn().then(() => toast("success", "נשמר בהצלחה")).catch(() => toast("error", "שגיאה"));
          }}
          className="min-h-[44px]"
        >
          שמור ידנית
        </Button>
      </div>
    </div>
  );
}
