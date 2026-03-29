import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  Building2, Users, ClipboardList, Target, UserPlus, Sheet, Bot,
  ChevronLeft, ChevronRight, Check, Upload
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import Papa from "papaparse";

interface WizardState {
  currentStep: number;
  completed: Record<number, boolean>;
  tenant: { name: string; timezone: string; language: string };
  workRoles: Array<{ name_he: string; name_en: string; color: string }>;
  statuses: Array<{ code: string; name_he: string; name_en: string; color: string; icon: string; counts_as_present: boolean }>;
  missionType: { name_he: string; name_en: string; color: string; min_soldiers: number; max_soldiers: number };
  soldiers: Array<{ full_name: string; employee_number: string; phone?: string; email?: string }>;
  sheetsConfig: { spreadsheet_id: string; sheet_name: string; enabled: boolean };
  botConfig: { whatsapp_enabled: boolean; telegram_enabled: boolean; telegram_token: string };
}

const STORAGE_KEY = "shavtzak_onboarding";

const defaultState: WizardState = {
  currentStep: 0,
  completed: {},
  tenant: { name: "", timezone: "Asia/Jerusalem", language: "he" },
  workRoles: [
    { name_he: "לוחם", name_en: "Fighter", color: "#ef4444" },
    { name_he: "מפקד", name_en: "Commander", color: "#3b82f6" },
    { name_he: "קצין", name_en: "Officer", color: "#8b5cf6" },
  ],
  statuses: [
    { code: "present", name_he: "נוכח", name_en: "Present", color: "#22c55e", icon: "✅", counts_as_present: true },
    { code: "home", name_he: "בית", name_en: "Home", color: "#3b82f6", icon: "🏠", counts_as_present: false },
    { code: "sick", name_he: "חולה", name_en: "Sick", color: "#ef4444", icon: "🤒", counts_as_present: false },
    { code: "vacation", name_he: "חופשה", name_en: "Vacation", color: "#eab308", icon: "🏖️", counts_as_present: false },
    { code: "reserve", name_he: "מילואים", name_en: "Reserve", color: "#a855f7", icon: "🎖️", counts_as_present: false },
    { code: "training", name_he: "הדרכה", name_en: "Training", color: "#f97316", icon: "📚", counts_as_present: true },
  ],
  missionType: { name_he: "שמירה", name_en: "Guard", color: "#ef4444", min_soldiers: 1, max_soldiers: 2 },
  soldiers: [],
  sheetsConfig: { spreadsheet_id: "", sheet_name: "Sheet1", enabled: false },
  botConfig: { whatsapp_enabled: false, telegram_enabled: false, telegram_token: "" },
};

const steps = [
  { icon: Building2, label_he: "פרטי יחידה", label_en: "Unit Details" },
  { icon: Users, label_he: "תפקידי עבודה", label_en: "Work Roles" },
  { icon: ClipboardList, label_he: "סטטוסי נוכחות", label_en: "Attendance Statuses" },
  { icon: Target, label_he: "סוג משימה ראשון", label_en: "First Mission Type" },
  { icon: UserPlus, label_he: "הוספת חיילים", label_en: "Add Soldiers" },
  { icon: Sheet, label_he: "Google Sheets", label_en: "Google Sheets" },
  { icon: Bot, label_he: "בוט", label_en: "Bot Connection" },
];

export default function OnboardingWizard() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const lang = i18n.language as "he" | "en";

  const [state, setState] = useState<WizardState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...defaultState, ...JSON.parse(saved) } : defaultState;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const update = (partial: Partial<WizardState>) => setState(prev => ({ ...prev, ...partial }));
  const markComplete = (step: number) => update({ completed: { ...state.completed, [step]: true } });

  const goNext = () => {
    markComplete(state.currentStep);
    update({ currentStep: Math.min(state.currentStep + 1, steps.length - 1) });
  };
  const goPrev = () => update({ currentStep: Math.max(state.currentStep - 1, 0) });

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const imported = results.data.map((row: any) => ({
          full_name: row["שם מלא"] || row["full_name"] || row["name"] || "",
          employee_number: row["מספר אישי"] || row["employee_number"] || row["number"] || "",
          phone: row["טלפון"] || row["phone"] || "",
          email: row["אימייל"] || row["email"] || "",
        })).filter((s: any) => s.full_name);
        update({ soldiers: [...state.soldiers, ...imported] });
        toast("success", `${imported.length} חיילים יובאו בהצלחה`);
      },
    });
  };

  const addSoldier = () => {
    update({ soldiers: [...state.soldiers, { full_name: "", employee_number: "", phone: "", email: "" }] });
  };

  const updateSoldier = (idx: number, field: string, value: string) => {
    const updated = [...state.soldiers];
    (updated[idx] as any)[field] = value;
    update({ soldiers: updated });
  };

  const removeSoldier = (idx: number) => {
    update({ soldiers: state.soldiers.filter((_, i) => i !== idx) });
  };

  const finishOnboarding = async () => {
    setSaving(true);
    try {
      // Save work roles
      for (const role of state.workRoles) {
        await api.post(tenantApi("/settings/work-roles"), {
          name: { he: role.name_he, en: role.name_en },
          color: role.color,
        }).catch(() => {});
      }

      // Save attendance statuses
      for (const status of state.statuses) {
        await api.post(tenantApi("/attendance/statuses"), {
          code: status.code,
          name: { he: status.name_he, en: status.name_en },
          color: status.color,
          icon: status.icon,
          counts_as_present: status.counts_as_present,
          is_schedulable: true,
          sort_order: state.statuses.indexOf(status),
        }).catch(() => {});
      }

      // Save soldiers
      for (const soldier of state.soldiers) {
        if (soldier.full_name) {
          await api.post(tenantApi("/employees"), {
            full_name: soldier.full_name,
            employee_number: soldier.employee_number,
            phone: soldier.phone,
            email: soldier.email,
          }).catch(() => {});
        }
      }

      // Save sheets config if enabled
      if (state.sheetsConfig.enabled && state.sheetsConfig.spreadsheet_id) {
        await api.post(tenantApi("/settings"), {
          key: "google_sheets_spreadsheet_id",
          value: state.sheetsConfig.spreadsheet_id,
          group: "integrations",
        }).catch(() => {});
      }

      // Save bot config
      if (state.botConfig.whatsapp_enabled || state.botConfig.telegram_enabled) {
        if (state.botConfig.whatsapp_enabled) {
          await api.post(tenantApi("/settings"), {
            key: "bot_whatsapp_enabled",
            value: true,
            group: "bot",
          }).catch(() => {});
        }
        if (state.botConfig.telegram_enabled) {
          await api.post(tenantApi("/settings"), {
            key: "bot_telegram_enabled",
            value: true,
            group: "bot",
          }).catch(() => {});
        }
      }

      localStorage.removeItem(STORAGE_KEY);
      toast("success", "ההגדרות נשמרו בהצלחה! 🎉");
      navigate("/dashboard");
    } catch (e) {
      toast("error", "שגיאה בשמירת ההגדרות");
    } finally {
      setSaving(false);
    }
  };

  const addWorkRole = () => update({ workRoles: [...state.workRoles, { name_he: "", name_en: "", color: "#6b7280" }] });
  const removeWorkRole = (idx: number) => update({ workRoles: state.workRoles.filter((_, i) => i !== idx) });
  const updateWorkRole = (idx: number, field: string, value: string) => {
    const updated = [...state.workRoles];
    (updated[idx] as any)[field] = value;
    update({ workRoles: updated });
  };

  const addStatus = () => update({ statuses: [...state.statuses, { code: "", name_he: "", name_en: "", color: "#6b7280", icon: "📋", counts_as_present: false }] });
  const removeStatus = (idx: number) => update({ statuses: state.statuses.filter((_, i) => i !== idx) });
  const updateStatus = (idx: number, field: string, value: any) => {
    const updated = [...state.statuses];
    (updated[idx] as any)[field] = value;
    update({ statuses: updated });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary-500">🎯 {lang === "he" ? "הגדרת שבצק" : "Shavtzak Setup"}</h1>
          <p className="mt-2 text-muted-foreground">
            {lang === "he" ? "הגדר את המערכת ב-7 צעדים פשוטים" : "Set up the system in 7 simple steps"}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8 flex items-center justify-center gap-1 overflow-x-auto pb-2">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === state.currentStep;
            const isDone = state.completed[i];
            return (
              <button
                key={i}
                onClick={() => update({ currentStep: i })}
                className={`flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs transition-colors min-w-[70px] ${
                  isActive ? "bg-primary-500 text-white" : isDone ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                <span className="whitespace-nowrap">{lang === "he" ? step.label_he : step.label_en}</span>
              </button>
            );
          })}
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="p-6">
            {/* Step 0: Tenant Details */}
            {state.currentStep === 0 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold">{lang === "he" ? "פרטי היחידה" : "Unit Details"}</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{lang === "he" ? "שם היחידה" : "Unit Name"}</Label>
                    <Input
                      value={state.tenant.name}
                      onChange={e => update({ tenant: { ...state.tenant, name: e.target.value } })}
                      placeholder={lang === "he" ? "פלוגה א׳" : "Company A"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{lang === "he" ? "אזור זמן" : "Timezone"}</Label>
                    <Select
                      value={state.tenant.timezone}
                      onChange={e => update({ tenant: { ...state.tenant, timezone: e.target.value } })}
                    >
                      <option value="Asia/Jerusalem">Asia/Jerusalem (UTC+2/3)</option>
                      <option value="Europe/London">Europe/London (UTC+0/1)</option>
                      <option value="America/New_York">America/New_York (UTC-5/4)</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{lang === "he" ? "שפה" : "Language"}</Label>
                    <Select
                      value={state.tenant.language}
                      onChange={e => update({ tenant: { ...state.tenant, language: e.target.value } })}
                    >
                      <option value="he">עברית</option>
                      <option value="en">English</option>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Work Roles */}
            {state.currentStep === 1 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">{lang === "he" ? "תפקידי עבודה" : "Work Roles"}</h2>
                  <Button size="sm" onClick={addWorkRole}>+ {lang === "he" ? "הוסף" : "Add"}</Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {lang === "he" ? "הגדר תפקידים שניתן לשבץ אליהם חיילים" : "Define roles soldiers can be assigned to"}
                </p>
                <div className="space-y-3">
                  {state.workRoles.map((role, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                      <input
                        type="color"
                        value={role.color}
                        onChange={e => updateWorkRole(i, "color", e.target.value)}
                        className="h-8 w-8 cursor-pointer rounded"
                      />
                      <Input
                        placeholder="שם בעברית"
                        value={role.name_he}
                        onChange={e => updateWorkRole(i, "name_he", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Name in English"
                        value={role.name_en}
                        onChange={e => updateWorkRole(i, "name_en", e.target.value)}
                        className="flex-1"
                      />
                      <Button variant="ghost" size="sm" onClick={() => removeWorkRole(i)} className="text-red-500">✕</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Attendance Statuses */}
            {state.currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">{lang === "he" ? "סטטוסי נוכחות" : "Attendance Statuses"}</h2>
                  <Button size="sm" onClick={addStatus}>+ {lang === "he" ? "הוסף" : "Add"}</Button>
                </div>
                <div className="space-y-3">
                  {state.statuses.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border p-3 flex-wrap">
                      <input
                        type="color"
                        value={s.color}
                        onChange={e => updateStatus(i, "color", e.target.value)}
                        className="h-8 w-8 cursor-pointer rounded"
                      />
                      <Input
                        placeholder="קוד"
                        value={s.code}
                        onChange={e => updateStatus(i, "code", e.target.value)}
                        className="w-24"
                      />
                      <Input
                        placeholder="אימוג׳י"
                        value={s.icon}
                        onChange={e => updateStatus(i, "icon", e.target.value)}
                        className="w-16 text-center"
                      />
                      <Input
                        placeholder="שם בעברית"
                        value={s.name_he}
                        onChange={e => updateStatus(i, "name_he", e.target.value)}
                        className="flex-1 min-w-[100px]"
                      />
                      <Input
                        placeholder="Name (EN)"
                        value={s.name_en}
                        onChange={e => updateStatus(i, "name_en", e.target.value)}
                        className="flex-1 min-w-[100px]"
                      />
                      <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={s.counts_as_present}
                          onChange={e => updateStatus(i, "counts_as_present", e.target.checked)}
                        />
                        {lang === "he" ? "נחשב נוכח" : "Counts Present"}
                      </label>
                      <Button variant="ghost" size="sm" onClick={() => removeStatus(i)} className="text-red-500">✕</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: First Mission Type */}
            {state.currentStep === 3 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold">{lang === "he" ? "סוג משימה ראשון" : "First Mission Type"}</h2>
                <p className="text-sm text-muted-foreground">
                  {lang === "he" ? "הגדר את סוג המשימה הראשון שלך. תוכל להוסיף עוד אחר כך." : "Define your first mission type. You can add more later."}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{lang === "he" ? "שם (עברית)" : "Name (Hebrew)"}</Label>
                    <Input
                      value={state.missionType.name_he}
                      onChange={e => update({ missionType: { ...state.missionType, name_he: e.target.value } })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{lang === "he" ? "שם (אנגלית)" : "Name (English)"}</Label>
                    <Input
                      value={state.missionType.name_en}
                      onChange={e => update({ missionType: { ...state.missionType, name_en: e.target.value } })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{lang === "he" ? "צבע" : "Color"}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={state.missionType.color}
                        onChange={e => update({ missionType: { ...state.missionType, color: e.target.value } })}
                        className="h-10 w-16 cursor-pointer rounded"
                      />
                      <span className="text-sm font-mono">{state.missionType.color}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{lang === "he" ? "מינימום חיילים" : "Min Soldiers"}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={state.missionType.min_soldiers}
                      onChange={e => update({ missionType: { ...state.missionType, min_soldiers: parseInt(e.target.value) || 1 } })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{lang === "he" ? "מקסימום חיילים" : "Max Soldiers"}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={state.missionType.max_soldiers}
                      onChange={e => update({ missionType: { ...state.missionType, max_soldiers: parseInt(e.target.value) || 2 } })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Add Soldiers */}
            {state.currentStep === 4 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-xl font-bold">{lang === "he" ? "הוספת חיילים" : "Add Soldiers"}</h2>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addSoldier}>+ {lang === "he" ? "ידני" : "Manual"}</Button>
                    <label>
                      <Button size="sm" variant="outline" asChild>
                        <span><Upload className="me-1 h-4 w-4" />{lang === "he" ? "ייבוא CSV" : "CSV Import"}</span>
                      </Button>
                      <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
                    </label>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {lang === "he"
                    ? "הוסף חיילים ידנית או ייבא קובץ CSV עם עמודות: שם מלא, מספר אישי, טלפון, אימייל"
                    : "Add soldiers manually or import a CSV with columns: full_name, employee_number, phone, email"}
                </p>
                {state.soldiers.length > 0 && (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {state.soldiers.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 rounded border p-2">
                        <Input
                          placeholder={lang === "he" ? "שם מלא" : "Full Name"}
                          value={s.full_name}
                          onChange={e => updateSoldier(i, "full_name", e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          placeholder={lang === "he" ? "מס׳ אישי" : "Number"}
                          value={s.employee_number}
                          onChange={e => updateSoldier(i, "employee_number", e.target.value)}
                          className="w-28"
                        />
                        <Input
                          placeholder={lang === "he" ? "טלפון" : "Phone"}
                          value={s.phone || ""}
                          onChange={e => updateSoldier(i, "phone", e.target.value)}
                          className="w-32"
                        />
                        <Button variant="ghost" size="sm" onClick={() => removeSoldier(i)} className="text-red-500">✕</Button>
                      </div>
                    ))}
                  </div>
                )}
                {state.soldiers.length === 0 && (
                  <div className="rounded-lg border-2 border-dashed p-8 text-center text-muted-foreground">
                    {lang === "he" ? "אין חיילים עדיין. הוסף ידנית או ייבא CSV." : "No soldiers yet. Add manually or import CSV."}
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Google Sheets */}
            {state.currentStep === 5 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold">{lang === "he" ? "חיבור Google Sheets" : "Google Sheets Connection"}</h2>
                <p className="text-sm text-muted-foreground">
                  {lang === "he" ? "אופציונלי — תוכל לחבר גם מאוחר יותר דרך ההגדרות" : "Optional — you can connect later from Settings"}
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={state.sheetsConfig.enabled}
                    onChange={e => update({ sheetsConfig: { ...state.sheetsConfig, enabled: e.target.checked } })}
                  />
                  <span>{lang === "he" ? "חבר Google Sheets" : "Connect Google Sheets"}</span>
                </label>
                {state.sheetsConfig.enabled && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Spreadsheet ID</Label>
                      <Input
                        value={state.sheetsConfig.spreadsheet_id}
                        onChange={e => update({ sheetsConfig: { ...state.sheetsConfig, spreadsheet_id: e.target.value } })}
                        placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{lang === "he" ? "שם גיליון" : "Sheet Name"}</Label>
                      <Input
                        value={state.sheetsConfig.sheet_name}
                        onChange={e => update({ sheetsConfig: { ...state.sheetsConfig, sheet_name: e.target.value } })}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 6: Bot */}
            {state.currentStep === 6 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold">{lang === "he" ? "חיבור בוט" : "Bot Connection"}</h2>
                <p className="text-sm text-muted-foreground">
                  {lang === "he" ? "אופציונלי — חבר בוט WhatsApp או Telegram" : "Optional — connect a WhatsApp or Telegram bot"}
                </p>
                <div className="space-y-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.botConfig.whatsapp_enabled}
                      onChange={e => update({ botConfig: { ...state.botConfig, whatsapp_enabled: e.target.checked } })}
                    />
                    <span>{lang === "he" ? "בוט WhatsApp" : "WhatsApp Bot"}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.botConfig.telegram_enabled}
                      onChange={e => update({ botConfig: { ...state.botConfig, telegram_enabled: e.target.checked } })}
                    />
                    <span>{lang === "he" ? "בוט Telegram" : "Telegram Bot"}</span>
                  </label>
                  {state.botConfig.telegram_enabled && (
                    <div className="space-y-2">
                      <Label>Telegram Bot Token</Label>
                      <Input
                        value={state.botConfig.telegram_token}
                        onChange={e => update({ botConfig: { ...state.botConfig, telegram_token: e.target.value } })}
                        placeholder="123456:ABC-DEF..."
                        dir="ltr"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="mt-8 flex items-center justify-between border-t pt-4">
              <Button
                variant="outline"
                onClick={goPrev}
                disabled={state.currentStep === 0}
              >
                <ChevronRight className="me-1 h-4 w-4 rtl:rotate-180" />
                {lang === "he" ? "הקודם" : "Previous"}
              </Button>
              <span className="text-sm text-muted-foreground">
                {state.currentStep + 1} / {steps.length}
              </span>
              {state.currentStep < steps.length - 1 ? (
                <Button onClick={goNext}>
                  {lang === "he" ? "הבא" : "Next"}
                  <ChevronLeft className="ms-1 h-4 w-4 rtl:rotate-180" />
                </Button>
              ) : (
                <Button onClick={finishOnboarding} disabled={saving}>
                  {saving ? (lang === "he" ? "שומר..." : "Saving...") : (lang === "he" ? "סיום 🎉" : "Finish 🎉")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
