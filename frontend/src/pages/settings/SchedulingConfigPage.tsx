import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import HelpTooltip from "@/components/common/HelpTooltip";
import {
  Settings, Clock, Repeat, Scale, Shield, Save, RotateCcw,
  Zap, AlertTriangle, ChevronDown, ChevronRight,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";

// ─── Types ──────────────────────────────────────

interface SchedulingConfig {
  // Shift patterns
  default_shift_duration_hours: number;
  shift_patterns: Array<{ label: string; duration_hours: number }>;
  // Rotation
  rotation_mode: "round_robin" | "weighted_preferences" | "random" | "balanced";
  fair_distribution_enabled: boolean;
  // Limits
  max_consecutive_shifts: number;
  required_rest_hours: number;
  max_hours_per_week: number;
  max_hours_per_month: number;
  // Night shifts
  night_shift_start_hour: number;
  night_shift_end_hour: number;
  rest_after_night_hours: number;
  // Advanced
  allow_override_with_justification: boolean;
  auto_schedule_fill_percentage: number;
}

interface MissionTypeOverride {
  mission_type_id: string;
  mission_type_name: string;
  overrides: Partial<SchedulingConfig>;
}

const DEFAULT_CONFIG: SchedulingConfig = {
  default_shift_duration_hours: 8,
  shift_patterns: [
    { label: "משמרת 4 שעות", duration_hours: 4 },
    { label: "משמרת 8 שעות", duration_hours: 8 },
    { label: "משמרת 12 שעות", duration_hours: 12 },
  ],
  rotation_mode: "balanced",
  fair_distribution_enabled: true,
  max_consecutive_shifts: 6,
  required_rest_hours: 8,
  max_hours_per_week: 48,
  max_hours_per_month: 200,
  night_shift_start_hour: 23,
  night_shift_end_hour: 7,
  rest_after_night_hours: 12,
  allow_override_with_justification: true,
  auto_schedule_fill_percentage: 90,
};

const ROTATION_MODES = [
  { value: "round_robin", label: "סבב (Round Robin)", description: "כל חייל מקבל תור שווה לפי הסדר" },
  { value: "weighted_preferences", label: "לפי העדפות", description: "העדפות חיילים מקבלות משקל גבוה" },
  { value: "balanced", label: "מאוזן (מומלץ)", description: "שילוב של הוגנות, העדפות ומנוחה" },
  { value: "random", label: "אקראי", description: "שיבוץ אקראי עם שמירת חוקים בסיסיים" },
];

// ─── Component ──────────────────────────────────

export default function SchedulingConfigPage() {
  const { toast } = useToast();

  const [config, setConfig] = useState<SchedulingConfig>(DEFAULT_CONFIG);
  const [missionTypes, setMissionTypes] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<MissionTypeOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [settingsRes, mtRes] = await Promise.all([
        api.get(tenantApi("/settings")).catch(() => ({ data: [] })),
        api.get(tenantApi("/mission-types")).catch(() => ({ data: [] })),
      ]);

      // Load scheduling config from settings
      const settings = Array.isArray(settingsRes.data) ? settingsRes.data : [];
      const configSetting = settings.find((s: any) => s.key === "scheduling_config");
      if (configSetting?.value) {
        const raw = typeof configSetting.value === "string"
          ? JSON.parse(configSetting.value)
          : configSetting.value._v
            ? (typeof configSetting.value._v === "string" ? JSON.parse(configSetting.value._v) : configSetting.value._v)
            : configSetting.value;
        setConfig({ ...DEFAULT_CONFIG, ...raw });
      }

      // Load mission type overrides
      const overrideSetting = settings.find((s: any) => s.key === "scheduling_config_overrides");
      if (overrideSetting?.value) {
        const raw = typeof overrideSetting.value === "string" ? JSON.parse(overrideSetting.value) : overrideSetting.value._v || overrideSetting.value;
        if (Array.isArray(raw)) setOverrides(raw);
      }

      setMissionTypes(Array.isArray(mtRes.data) ? mtRes.data : []);
    } catch (e) {
      console.error("Load scheduling config error:", e);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await api.post(tenantApi("/settings"), {
        key: "scheduling_config",
        value: JSON.stringify(config),
        group: "scheduling",
      });

      if (overrides.length > 0) {
        await api.post(tenantApi("/settings"), {
          key: "scheduling_config_overrides",
          value: JSON.stringify(overrides),
          group: "scheduling",
        });
      }

      toast("success", "הגדרות השיבוץ נשמרו בהצלחה");
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בשמירת הגדרות"));
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setConfig(DEFAULT_CONFIG);
    toast("info", "ההגדרות אופסו לברירת מחדל — לחץ שמור כדי להחיל");
  };

  const addOverride = (mtId: string) => {
    const mt = missionTypes.find(m => m.id === mtId);
    if (!mt || overrides.some(o => o.mission_type_id === mtId)) return;
    setOverrides([...overrides, {
      mission_type_id: mtId,
      mission_type_name: typeof mt.name === "object" ? (mt.name.he || mt.name.en || "") : String(mt.name),
      overrides: {},
    }]);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
            <Settings className="h-6 w-6 text-primary-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold">הגדרות שיבוץ</h2>
            <p className="text-sm text-muted-foreground">הגדר את אלגוריתם השיבוץ, מגבלות שעות, וכללי סיבוב</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults} className="min-h-[44px]">
            <RotateCcw className="me-1 h-4 w-4" />
            אפס לברירת מחדל
          </Button>
          <Button onClick={saveConfig} disabled={saving} className="min-h-[44px]">
            <Save className="me-1 h-4 w-4" />
            {saving ? "שומר..." : "שמור הגדרות"}
          </Button>
        </div>
      </div>

      {/* Shift Patterns */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            תבניות משמרות
            <HelpTooltip content={{ he: "הגדר את אורך המשמרות הנפוצות ביחידה שלך. ניתן להגדיר דפוסים שונים ואורך ברירת מחדל.", en: "Configure common shift patterns and default duration." }} />
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>אורך משמרת ברירת מחדל (שעות)</Label>
              <Input
                type="number"
                min={1}
                max={24}
                value={config.default_shift_duration_hours}
                onChange={e => setConfig({ ...config, default_shift_duration_hours: Number(e.target.value) || 8 })}
                className="min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>דפוסי משמרות</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfig({
                  ...config,
                  shift_patterns: [...config.shift_patterns, { label: "", duration_hours: 8 }],
                })}
                className="h-8 text-xs"
              >
                + הוסף דפוס
              </Button>
            </div>
            <div className="space-y-2">
              {config.shift_patterns.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={p.label}
                    onChange={e => {
                      const patterns = [...config.shift_patterns];
                      patterns[i] = { ...patterns[i], label: e.target.value };
                      setConfig({ ...config, shift_patterns: patterns });
                    }}
                    placeholder="שם הדפוס"
                    className="flex-1 min-h-[44px]"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={p.duration_hours}
                    onChange={e => {
                      const patterns = [...config.shift_patterns];
                      patterns[i] = { ...patterns[i], duration_hours: Number(e.target.value) || 8 };
                      setConfig({ ...config, shift_patterns: patterns });
                    }}
                    className="w-24 min-h-[44px]"
                  />
                  <span className="text-sm text-muted-foreground">שעות</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfig({ ...config, shift_patterns: config.shift_patterns.filter((_, j) => j !== i) })}
                    className="text-red-500 min-h-[44px]"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rotation & Fairness */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-bold flex items-center gap-2">
            <Repeat className="h-5 w-5 text-green-500" />
            סיבוב והוגנות
            <HelpTooltip content={{ he: "בחר את אלגוריתם חלוקת המשמרות.\nמאוזן = שילוב של הוגנות, העדפות, ומנוחה (מומלץ).", en: "Choose the shift distribution algorithm." }} />
          </h3>

          <div className="space-y-3">
            <Label>מצב סיבוב</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ROTATION_MODES.map(mode => (
                <label
                  key={mode.value}
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                    config.rotation_mode === mode.value ? "ring-2 ring-primary-500 border-primary-300" : "hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="rotation"
                    value={mode.value}
                    checked={config.rotation_mode === mode.value}
                    onChange={e => setConfig({ ...config, rotation_mode: e.target.value as any })}
                    className="mt-1 accent-primary-500"
                  />
                  <div>
                    <span className="font-medium text-sm">{mode.label}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{mode.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer hover:bg-muted/50">
            <input
              type="checkbox"
              checked={config.fair_distribution_enabled}
              onChange={e => setConfig({ ...config, fair_distribution_enabled: e.target.checked })}
              className="accent-primary-500"
            />
            <div>
              <span className="font-medium text-sm flex items-center gap-1">
                <Scale className="h-4 w-4 text-green-500" />
                אלגוריתם חלוקה הוגנת
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                המערכת תוודא שכל חייל מקבל כמות דומה של משמרות, עם תיקון אוטומטי כשיש חוסר איזון
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Limits */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-500" />
            מגבלות שיבוץ
            <HelpTooltip content={{ he: "הגדר את המגבלות שהמערכת אוכפת על כל שיבוץ.\nהשיבוץ האוטומטי ידע להתחשב בהגבלות אלו.", en: "Set scheduling limits enforced by the system." }} />
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>מקסימום משמרות רצופות</Label>
                <HelpTooltip content={{ he: "כמה ימים ברצף חייל יכול לעבוד בלי יום חופש", en: "Max consecutive days before mandatory rest" }} />
              </div>
              <Input
                type="number"
                min={1}
                max={30}
                value={config.max_consecutive_shifts}
                onChange={e => setConfig({ ...config, max_consecutive_shifts: Number(e.target.value) || 6 })}
                className="min-h-[44px]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>שעות מנוחה נדרשות בין משמרות</Label>
                <HelpTooltip content={{ he: "מינימום שעות שצריכות לעבור בין סיום משמרת לתחילת הבאה", en: "Min hours between end and start of next shift" }} />
              </div>
              <Input
                type="number"
                min={0}
                max={48}
                value={config.required_rest_hours}
                onChange={e => setConfig({ ...config, required_rest_hours: Number(e.target.value) || 8 })}
                className="min-h-[44px]"
              />
            </div>

            <div className="space-y-2">
              <Label>מקסימום שעות בשבוע</Label>
              <Input
                type="number"
                min={1}
                max={168}
                value={config.max_hours_per_week}
                onChange={e => setConfig({ ...config, max_hours_per_week: Number(e.target.value) || 48 })}
                className="min-h-[44px]"
              />
            </div>

            <div className="space-y-2">
              <Label>מקסימום שעות בחודש</Label>
              <Input
                type="number"
                min={1}
                max={744}
                value={config.max_hours_per_month}
                onChange={e => setConfig({ ...config, max_hours_per_month: Number(e.target.value) || 200 })}
                className="min-h-[44px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Night Shift Settings */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-bold flex items-center gap-2">
            🌙 משמרות לילה
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>שעת התחלת לילה</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={config.night_shift_start_hour}
                onChange={e => setConfig({ ...config, night_shift_start_hour: Number(e.target.value) })}
                className="min-h-[44px]"
              />
              <span className="text-xs text-muted-foreground">{String(config.night_shift_start_hour).padStart(2, "0")}:00</span>
            </div>

            <div className="space-y-2">
              <Label>שעת סיום לילה</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={config.night_shift_end_hour}
                onChange={e => setConfig({ ...config, night_shift_end_hour: Number(e.target.value) })}
                className="min-h-[44px]"
              />
              <span className="text-xs text-muted-foreground">{String(config.night_shift_end_hour).padStart(2, "0")}:00</span>
            </div>

            <div className="space-y-2">
              <Label>שעות מנוחה אחרי לילה</Label>
              <Input
                type="number"
                min={0}
                max={48}
                value={config.rest_after_night_hours}
                onChange={e => setConfig({ ...config, rest_after_night_hours: Number(e.target.value) || 12 })}
                className="min-h-[44px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Advanced */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            הגדרות מתקדמות
          </h3>

          <label className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer hover:bg-muted/50">
            <input
              type="checkbox"
              checked={config.allow_override_with_justification}
              onChange={e => setConfig({ ...config, allow_override_with_justification: e.target.checked })}
              className="accent-primary-500"
            />
            <div>
              <span className="font-medium text-sm">אפשר עקיפת חוקים עם נימוק</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                מנהל יוכל לשבץ בניגוד לחוק חמור אם יזין נימוק. הפעולה תתועד ביומן ביקורת.
              </p>
            </div>
          </label>

          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>אחוז מילוי בשיבוץ אוטומטי</Label>
              <HelpTooltip content={{ he: "באיזה אחוז מילוי השיבוץ האוטומטי יעצור.\n100% = ימלא את כל המשבצות.\n90% = ישאיר 10% למילוי ידני.", en: "Auto-scheduler target fill percentage." }} />
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="range"
                min={50}
                max={100}
                value={config.auto_schedule_fill_percentage}
                onChange={e => setConfig({ ...config, auto_schedule_fill_percentage: Number(e.target.value) })}
                className="flex-1 h-2 accent-primary-500"
              />
              <span className="font-mono text-sm w-12 text-center">{config.auto_schedule_fill_percentage}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Mission-Type Overrides */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <button
            onClick={() => setShowOverrides(!showOverrides)}
            className="flex items-center gap-2 font-bold w-full text-right"
          >
            {showOverrides ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            עקיפות לפי סוג משימה
            <Badge className="bg-muted text-muted-foreground text-xs mr-2">{overrides.length}</Badge>
          </button>

          {showOverrides && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                ניתן להגדיר הגדרות שיבוץ שונות לכל סוג משימה. ההגדרות הללו יחליפו את ברירת המחדל.
              </p>

              {missionTypes.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <Label className="self-center">הוסף עקיפה:</Label>
                  <Select
                    value=""
                    onChange={e => { if (e.target.value) addOverride(e.target.value); }}
                    className="min-h-[44px] w-48"
                  >
                    <option value="">בחר סוג משימה...</option>
                    {missionTypes.filter(mt => !overrides.some(o => o.mission_type_id === mt.id)).map(mt => (
                      <option key={mt.id} value={mt.id}>
                        {typeof mt.name === "object" ? (mt.name.he || mt.name.en || "") : String(mt.name)}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {overrides.map((override, idx) => (
                <Card key={override.mission_type_id} className="border-orange-200 dark:border-orange-800">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Badge className="bg-orange-100 text-orange-700">{override.mission_type_name}</Badge>
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOverrides(overrides.filter((_, i) => i !== idx))}
                        className="text-red-500"
                      >
                        ✕ הסר
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">אורך משמרת (שעות)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          value={override.overrides.default_shift_duration_hours ?? ""}
                          onChange={e => {
                            const o = [...overrides];
                            o[idx] = { ...o[idx], overrides: { ...o[idx].overrides, default_shift_duration_hours: Number(e.target.value) || undefined } };
                            setOverrides(o);
                          }}
                          placeholder={String(config.default_shift_duration_hours)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">שעות מנוחה נדרשות</Label>
                        <Input
                          type="number"
                          min={0}
                          max={48}
                          value={override.overrides.required_rest_hours ?? ""}
                          onChange={e => {
                            const o = [...overrides];
                            o[idx] = { ...o[idx], overrides: { ...o[idx].overrides, required_rest_hours: Number(e.target.value) || undefined } };
                            setOverrides(o);
                          }}
                          placeholder={String(config.required_rest_hours)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">מקסימום רצופות</Label>
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          value={override.overrides.max_consecutive_shifts ?? ""}
                          onChange={e => {
                            const o = [...overrides];
                            o[idx] = { ...o[idx], overrides: { ...o[idx].overrides, max_consecutive_shifts: Number(e.target.value) || undefined } };
                            setOverrides(o);
                          }}
                          placeholder={String(config.max_consecutive_shifts)}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {overrides.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg border-dashed">
                  אין עקיפות מוגדרות. כל סוגי המשימות משתמשים בהגדרות הכלליות.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
