import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  Building2, Users, ClipboardList, Target, UserPlus, Sheet, Bot,
  ChevronLeft, ChevronRight, ChevronDown, Check, Upload, Sparkles, HelpCircle,
  LayoutDashboard, Calendar, Shield, BarChart3, User, BookOpen,
  GraduationCap, Rocket, Settings, Loader2,
  CircleCheckBig,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import Papa from "papaparse";

// ─── Types ──────────────────────────────────────

type UserRole = "admin" | "commander" | "soldier";
type OnboardingMode = "setup" | "tour" | "help";

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

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: any;
  illustration: string;
  targetPath?: string;
  roles: UserRole[];
}

interface HelpArticle {
  id: string;
  category: string;
  title: string;
  content: string;
  icon: string;
  roles: UserRole[];
}

// ─── Constants ──────────────────────────────────

const STORAGE_KEY = "shavtzak_onboarding";
const COMPLETED_KEY = "shavtzak_onboarding_completed";

// ─── Onboarding API helpers ──────────────────────

interface OnboardingProgressData {
  current_step: number;
  completed_steps: Record<string, boolean>;
  status: "in_progress" | "completed" | "skipped";
}

async function fetchOnboardingProgress(): Promise<OnboardingProgressData | null> {
  try {
    const res = await api.get(tenantApi("/onboarding/progress"));
    return res.data;
  } catch {
    return null;
  }
}

async function saveOnboardingProgress(current_step: number, completed_steps: Record<number, boolean>): Promise<void> {
  try {
    // Convert numeric keys to string keys for API
    const steps: Record<string, boolean> = {};
    Object.entries(completed_steps).forEach(([k, v]) => { steps[k] = v; });
    await api.put(tenantApi("/onboarding/progress"), { current_step, completed_steps: steps });
  } catch {
    // Non-fatal: localStorage still acts as cache
  }
}

async function skipOnboardingApi(): Promise<void> {
  try {
    await api.post(tenantApi("/onboarding/skip"));
  } catch {
    // Non-fatal
  }
}

async function completeOnboardingApi(): Promise<void> {
  try {
    await api.post(tenantApi("/onboarding/complete"));
  } catch {
    // Non-fatal
  }
}

const defaultState: WizardState = {
  currentStep: 0,
  completed: {},
  tenant: { name: "", timezone: "Asia/Jerusalem", language: "he" },
  workRoles: [
    { name_he: "לוחם", name_en: "Fighter", color: "#ef4444" },
    { name_he: "מפקד", name_en: "Commander", color: "#6B7F3B" },
    { name_he: "קצין", name_en: "Officer", color: "#8b5cf6" },
  ],
  statuses: [
    { code: "present", name_he: "נוכח", name_en: "Present", color: "#22c55e", icon: "✅", counts_as_present: true },
    { code: "home", name_he: "בית", name_en: "Home", color: "#6B7F3B", icon: "🏠", counts_as_present: false },
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

const setupSteps = [
  { icon: Building2, label_he: "פרטי יחידה", label_en: "Unit Details" },
  { icon: Users, label_he: "תפקידי עבודה", label_en: "Work Roles" },
  { icon: ClipboardList, label_he: "סטטוסי נוכחות", label_en: "Attendance Statuses" },
  { icon: Target, label_he: "סוג משימה ראשון", label_en: "First Mission Type" },
  { icon: UserPlus, label_he: "הוספת חיילים", label_en: "Add Soldiers" },
  { icon: Sheet, label_he: "Google Sheets", label_en: "Google Sheets" },
  { icon: Bot, label_he: "בוט", label_en: "Bot Connection" },
];

// ─── Interactive Tour Steps ──────────────────────

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "ברוכים הבאים לשבצק! 🎯",
    description: "שבצק היא מערכת שיבוצים חכמה שתעזור לך לנהל את סידור העבודה ביחידה שלך בצורה יעילה והוגנת. בואו נכיר את המערכת יחד.",
    icon: Rocket,
    illustration: "🚀",
    roles: ["admin", "commander", "soldier"],
  },
  {
    id: "dashboard",
    title: "לוח מחוונים",
    description: "כאן תראה תמונת מצב מהירה: כמה חיילים נוכחים, משימות פעילות, התראות ועוד. זהו מסך הבית שלך.",
    icon: LayoutDashboard,
    illustration: "📊",
    targetPath: "/dashboard",
    roles: ["admin", "commander", "soldier"],
  },
  {
    id: "mission_types",
    title: "סוגי משימות",
    description: "כאן מגדירים את סוגי המשימות ביחידה — שמירה, סיור, תצפית, כוננות ועוד. לכל סוג ניתן להגדיר צבע, משך זמן, ותפקידים נדרשים.",
    icon: Target,
    illustration: "🎯",
    targetPath: "/scheduling",
    roles: ["admin", "commander"],
  },
  {
    id: "scheduling",
    title: "לוח שיבוצים",
    description: "הלב של המערכת! כאן יוצרים לוחות עבודה, משבצים חיילים למשימות, ומנהלים את סידור העבודה. ניתן לשבץ ידנית או להפעיל שיבוץ אוטומטי.",
    icon: Calendar,
    illustration: "📅",
    targetPath: "/scheduling",
    roles: ["admin", "commander"],
  },
  {
    id: "rules",
    title: "חוקי שיבוץ",
    description: "הגדר חוקים שמונעים טעויות: מנוחה מינימלית בין משמרות, מקסימום שעות בשבוע, איסור שיבוץ בוקר אחרי לילה. המערכת תזהיר או תחסום אוטומטית.",
    icon: Shield,
    illustration: "🛡️",
    targetPath: "/rules",
    roles: ["admin"],
  },
  {
    id: "reports",
    title: "דוחות ונתונים",
    description: "צפה בדוחות על חלוקת שעות, הוגנות, נוכחות ועוד. ניתן לייצא לאקסל ולראות נתונים לכל תקופה.",
    icon: BarChart3,
    illustration: "📈",
    targetPath: "/reports",
    roles: ["admin", "commander"],
  },
  {
    id: "soldier_view",
    title: "תצוגת חייל",
    description: "כאן אתה רואה את המשמרות שלך, יכול לבקש החלפות, ולעדכן את ההעדפות שלך. הכל מותאם אישית עבורך.",
    icon: User,
    illustration: "👤",
    targetPath: "/my/schedule",
    roles: ["soldier"],
  },
  {
    id: "complete",
    title: "סיום! 🎉",
    description: "מעולה! עכשיו אתה מכיר את המערכת. תוכל תמיד לחזור לסיור הזה מתפריט העזרה. בהצלחה!",
    icon: CircleCheckBig,
    illustration: "🏆",
    roles: ["admin", "commander", "soldier"],
  },
];

// ─── Help Center Articles ────────────────────────

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "create_schedule",
    category: "שיבוץ",
    title: "איך יוצרים לוח שיבוצים?",
    content: "1. לכו לעמוד שיבוצים בתפריט.\n2. לחצו \"לוח חדש\" ובחרו תאריכי התחלה וסיום.\n3. הוסיפו חיילים ללוח.\n4. צרו משימות או השתמשו בתבניות.\n5. שבצו חיילים ידנית או הפעילו שיבוץ אוטומטי.\n6. פרסמו את הלוח כשהוא מוכן.",
    icon: "📅",
    roles: ["admin", "commander"],
  },
  {
    id: "auto_schedule",
    category: "שיבוץ",
    title: "מה עושה השיבוץ האוטומטי?",
    content: "השיבוץ האוטומטי מחלק משמרות בצורה הוגנת תוך שמירה על כל החוקים שהגדרתם. הוא מתחשב ב:\n• שעות מנוחה מינימליות\n• חלוקה שוויונית של משמרות\n• העדפות חיילים\n• כישורים ותפקידים נדרשים\n• היסטוריית שיבוצים קודמים",
    icon: "🤖",
    roles: ["admin", "commander"],
  },
  {
    id: "swap_request",
    category: "החלפות",
    title: "איך מבקשים החלפת משמרת?",
    content: "1. לכו לעמוד המשמרות שלי.\n2. לחצו על המשמרת שרוצים להחליף.\n3. בחרו \"בקש החלפה\".\n4. בחרו חייל להחלפה (או בקשו החלפה פתוחה).\n5. החייל השני יקבל הודעה ויוכל לאשר או לדחות.\n6. מפקד צריך לאשר סופית.",
    icon: "🔄",
    roles: ["soldier", "commander"],
  },
  {
    id: "attendance",
    category: "נוכחות",
    title: "איך מנהלים נוכחות?",
    content: "נוכחות מנוהלת ברמת הלוח:\n• כל חייל מקבל סטטוס (נוכח, בית, חולה, חופשה...)\n• הסטטוס קובע אם החייל זמין לשיבוץ\n• ניתן לסנכרן עם Google Sheets\n• ניתן לעדכן דרך בוט WhatsApp/Telegram",
    icon: "✅",
    roles: ["admin", "commander"],
  },
  {
    id: "rules_explain",
    category: "חוקים",
    title: "מה זה חוקי שיבוץ?",
    content: "חוקים הם כללים שהמערכת אוכפת:\n\nחוק רך (אזהרה) — מראה אזהרה צהובה אבל מאפשר שיבוץ\nחוק חמור (חסימה) — חוסם שיבוץ לגמרי\n\nדוגמאות נפוצות:\n• מנוחה מינימלית 8 שעות בין משמרות\n• מקסימום 48 שעות בשבוע\n• איסור שיבוץ בוקר אחרי לילה\n• מקסימום 6 ימים רצופים",
    icon: "🛡️",
    roles: ["admin"],
  },
  {
    id: "preferences",
    category: "העדפות",
    title: "איך מגדירים העדפות?",
    content: "כל חייל יכול להגדיר העדפות אישיות:\n• משמרות מועדפות (בוקר/צהריים/לילה)\n• ימים מועדפים לחופש\n• שותפים מועדפים\n• סוגי משימות מועדפים\n\nהשיבוץ האוטומטי מנסה להתחשב בהעדפות ככל שניתן.",
    icon: "⭐",
    roles: ["soldier", "commander", "admin"],
  },
  {
    id: "board_template",
    category: "תבניות",
    title: "מה זה תבנית לוח?",
    content: "תבנית לוח מגדירה את המבנה הוויזואלי של הלוח היומי.\n\nאפשרויות:\n• הגדרת עמודות ושורות\n• מיזוג תאים\n• צבעים ועיצוב\n• משתנים אוטומטיים (שם חייל, שעה...)\n• חלוקה לקטעים (סיור, שמירה, כוננות)\n\nהתבנית נשמרת ומשמשת לייצור לוחות יומיים.",
    icon: "📋",
    roles: ["admin"],
  },
  {
    id: "notifications",
    category: "התראות",
    title: "איך עובדות ההתראות?",
    content: "המערכת שולחת התראות ב:\n• WhatsApp — דרך בוט\n• Telegram — דרך בוט\n• אימייל\n• Push notifications (אפליקציה)\n\nהודעות נשלחות על:\n• שיבוץ חדש\n• בקשת החלפה\n• שינוי בלוח\n• תזכורת לפני משמרת",
    icon: "🔔",
    roles: ["admin", "commander", "soldier"],
  },
];

const HELP_CATEGORIES = ["שיבוץ", "החלפות", "נוכחות", "חוקים", "העדפות", "תבניות", "התראות"];

// ─── Main Component ──────────────────────────────

export default function OnboardingWizard() {
  const { toast } = useToast();
  const navigate = useNavigate();

  // Detect if onboarding was already completed (localStorage as quick cache)
  const [isCompleted, setIsCompleted] = useState(() => {
    return localStorage.getItem(COMPLETED_KEY) === "true";
  });

  // Mode: setup wizard, interactive tour, or help center
  const [mode, setMode] = useState<OnboardingMode>(() => {
    if (localStorage.getItem(COMPLETED_KEY) === "true") return "help";
    return "setup";
  });

  // Role for tour filtering
  const [userRole, setUserRole] = useState<UserRole>("admin");
  const [tourStep, setTourStep] = useState(0);

  // Help center
  const [helpSearch, setHelpSearch] = useState("");
  const [helpCategory, setHelpCategory] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  // Setup wizard state
  const [state, setState] = useState<WizardState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...defaultState, ...JSON.parse(saved) } : defaultState;
  });
  const [saving, setSaving] = useState(false);

  // On mount: load progress from DB (authoritative source)
  useEffect(() => {
    (async () => {
      const progress = await fetchOnboardingProgress();
      if (!progress) return; // No DB record yet — stay with defaults

      if (progress.status === "completed" || progress.status === "skipped") {
        // Mark completed locally and switch to help mode
        localStorage.setItem(COMPLETED_KEY, "true");
        setIsCompleted(true);
        setMode("help");
        return;
      }

      // Resume from saved step
      if (progress.status === "in_progress") {
        const numericCompleted: Record<number, boolean> = {};
        Object.entries(progress.completed_steps).forEach(([k, v]) => {
          numericCompleted[parseInt(k)] = v as boolean;
        });
        setState(prev => ({
          ...prev,
          currentStep: progress.current_step,
          completed: numericCompleted,
        }));
        // Sync localStorage cache
        const saved = localStorage.getItem(STORAGE_KEY);
        const localState = saved ? JSON.parse(saved) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...localState,
          currentStep: progress.current_step,
          completed: numericCompleted,
        }));
      }
    })();
  }, []);

  // Save progress to DB (debounced via useEffect) + localStorage cache
  useEffect(() => {
    if (mode === "setup") {
      // Sync localStorage immediately
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // Persist to DB (debounced)
      const timer = setTimeout(() => {
        saveOnboardingProgress(state.currentStep, state.completed);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [state, mode]);

  const update = (partial: Partial<WizardState>) => setState(prev => ({ ...prev, ...partial }));
  const markComplete = (step: number) => update({ completed: { ...state.completed, [step]: true } });

  const goNext = () => {
    markComplete(state.currentStep);
    update({ currentStep: Math.min(state.currentStep + 1, setupSteps.length - 1) });
  };
  const goPrev = () => update({ currentStep: Math.max(state.currentStep - 1, 0) });

  // Tour steps filtered by role
  const filteredTourSteps = TOUR_STEPS.filter(s => s.roles.includes(userRole));

  // Help articles filtered
  const filteredArticles = HELP_ARTICLES.filter(a => {
    if (!a.roles.includes(userRole)) return false;
    if (helpCategory && a.category !== helpCategory) return false;
    if (helpSearch) {
      const q = helpSearch.toLowerCase();
      return a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q);
    }
    return true;
  });

  // ─── CSV Import ─────────────────────────────────

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

  // ─── Finish Setup ───────────────────────────────

  const finishOnboarding = async () => {
    setSaving(true);
    try {
      // Step 1: Tenant settings
      if (state.tenant.name) {
        await api.post(tenantApi("/settings"), { key: "tenant_display_name", value: state.tenant.name, group: "general" }).catch(() => {});
      }
      await api.post(tenantApi("/settings"), { key: "timezone", value: state.tenant.timezone, group: "general" }).catch(() => {});
      await api.post(tenantApi("/settings"), { key: "language", value: state.tenant.language, group: "general" }).catch(() => {});

      // Step 2: Work roles
      for (const role of state.workRoles) {
        if (role.name_he) {
          await api.post(tenantApi("/settings/work-roles"), { name: { he: role.name_he, en: role.name_en }, color: role.color }).catch(() => {});
        }
      }

      // Step 3: Attendance statuses
      for (const status of state.statuses) {
        if (status.code && status.name_he) {
          await api.post(tenantApi("/attendance/statuses"), {
            code: status.code, name: { he: status.name_he, en: status.name_en },
            color: status.color, icon: status.icon, counts_as_present: status.counts_as_present,
            is_schedulable: true, sort_order: state.statuses.indexOf(status),
          }).catch(() => {});
        }
      }

      // Step 4: Mission type
      if (state.missionType.name_he) {
        await api.post(tenantApi("/mission-types"), {
          name: { he: state.missionType.name_he, en: state.missionType.name_en },
          color: state.missionType.color, duration_hours: 8,
          required_slots: [{ slot_id: "s1", work_role_id: null, count: state.missionType.max_soldiers || 2, label: { he: "חייל", en: "Soldier" }, role_mode: "all" }],
        }).catch(() => {});
      }

      // Step 5: Soldiers
      if (state.soldiers.length > 0) {
        const valid = state.soldiers.filter(s => s.full_name);
        try {
          await api.post(tenantApi("/employees/bulk-import"), { employees: valid.map(s => ({ full_name: s.full_name, employee_number: s.employee_number, notes: null })), skip_errors: true });
        } catch {
          for (const s of valid) {
            await api.post(tenantApi("/employees"), { full_name: s.full_name, employee_number: s.employee_number, notification_channels: { phone_whatsapp: s.phone || undefined, email: s.email || undefined } }).catch(() => {});
          }
        }
      }

      // Step 6: Sheets
      if (state.sheetsConfig.enabled && state.sheetsConfig.spreadsheet_id) {
        await api.post(tenantApi("/settings"), { key: "google_sheets_spreadsheet_id", value: state.sheetsConfig.spreadsheet_id, group: "integrations" }).catch(() => {});
        if (state.sheetsConfig.sheet_name) {
          await api.post(tenantApi("/settings"), { key: "google_sheets_sheet_name", value: state.sheetsConfig.sheet_name, group: "integrations" }).catch(() => {});
        }
      }

      // Step 7: Bot
      if (state.botConfig.whatsapp_enabled) await api.post(tenantApi("/settings"), { key: "bot_whatsapp_enabled", value: true, group: "bot" }).catch(() => {});
      if (state.botConfig.telegram_enabled) {
        await api.post(tenantApi("/settings"), { key: "bot_telegram_enabled", value: true, group: "bot" }).catch(() => {});
        if (state.botConfig.telegram_token) await api.post(tenantApi("/settings"), { key: "bot_telegram_token", value: state.botConfig.telegram_token, group: "bot" }).catch(() => {});
      }

      // Mark onboarding as completed in DB
      await completeOnboardingApi();

      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(COMPLETED_KEY, "true");
      setIsCompleted(true);
      toast("success", "ההגדרות נשמרו בהצלחה! 🎉");

      // Offer the tour
      setMode("tour");
      setTourStep(0);
    } catch (e) {
      toast("error", getErrorMessage(e, "שגיאה בשמירת ההגדרות"));
    } finally {
      setSaving(false);
    }
  };

  // ─── Helpers ────────────────────────────────────

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

  // ─── Interactive Tour ───────────────────────────

  if (mode === "tour") {
    const step = filteredTourSteps[tourStep];
    if (!step) {
      setMode("help");
      return null;
    }
    const StepIcon = step.icon;
    const progress = ((tourStep + 1) / filteredTourSteps.length) * 100;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                שלב {tourStep + 1} מתוך {filteredTourSteps.length}
              </span>
              <div className="flex items-center gap-2">
                <Badge className="bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                  {userRole === "admin" ? "מנהל" : userRole === "commander" ? "מפקד" : "חייל"}
                </Badge>
                <button
                  onClick={async () => {
                    await skipOnboardingApi();
                    localStorage.setItem(COMPLETED_KEY, "true");
                    setIsCompleted(true);
                    setMode("help");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  דלג ←
                </button>
              </div>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Tour card */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {/* Illustration area */}
              <div className="bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 p-8 text-center">
                <div className="text-6xl mb-4 animate-bounce-slow">
                  {step.illustration}
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 dark:bg-gray-800/80 shadow-sm">
                  <StepIcon className="w-5 h-5 text-primary-500" />
                  <span className="font-bold text-lg">{step.title}</span>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                <p className="text-base leading-relaxed text-foreground/90">
                  {step.description}
                </p>

                {/* Navigation */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setTourStep(Math.max(0, tourStep - 1))}
                    disabled={tourStep === 0}
                    className="min-h-[48px]"
                  >
                    <ChevronRight className="me-1 h-4 w-4 rtl:rotate-180" />
                    הקודם
                  </Button>

                  {/* Step indicators */}
                  <div className="flex gap-1.5">
                    {filteredTourSteps.map((_, i) => (
                      <button
                        key={i}
                        className={`w-2.5 h-2.5 rounded-full transition-all ${
                          i === tourStep ? "bg-primary-500 scale-125" : i < tourStep ? "bg-primary-300" : "bg-muted"
                        }`}
                        onClick={() => setTourStep(i)}
                      />
                    ))}
                  </div>

                  {tourStep < filteredTourSteps.length - 1 ? (
                    <Button
                      onClick={() => setTourStep(tourStep + 1)}
                      className="min-h-[48px]"
                    >
                      הבנתי, הבא
                      <ChevronLeft className="ms-1 h-4 w-4 rtl:rotate-180" />
                    </Button>
                  ) : (
                    <Button
                      onClick={async () => {
                        await skipOnboardingApi(); // mark tour as "done" too
                        localStorage.setItem(COMPLETED_KEY, "true");
                        setIsCompleted(true);
                        toast("success", "מעולה! סיום מוצלח של הסיור 🎉");
                        navigate("/dashboard");
                      }}
                      className="min-h-[48px] bg-green-600 hover:bg-green-700"
                    >
                      <CircleCheckBig className="me-1 h-4 w-4" />
                      סיום — בוא נתחיל! 🎉
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Help Center ────────────────────────────────

  if (mode === "help") {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <HelpCircle className="w-8 h-8 text-primary-500" />
                מרכז עזרה
              </h1>
              <p className="text-muted-foreground mt-1">מדריכים, הסברים ותשובות לשאלות נפוצות</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => { setMode("tour"); setTourStep(0); }}
              >
                <GraduationCap className="me-1 h-4 w-4" />
                סיור מודרך
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/dashboard")}
              >
                חזרה למערכת
              </Button>
            </div>
          </div>

          {/* Role selector */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">הצג עזרה עבור:</span>
            {([
              { role: "admin" as UserRole, label: "מנהל", icon: Settings },
              { role: "commander" as UserRole, label: "מפקד", icon: Shield },
              { role: "soldier" as UserRole, label: "חייל", icon: User },
            ]).map(({ role, label, icon: Icon }) => (
              <button
                key={role}
                onClick={() => setUserRole(role)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  userRole === role
                    ? "bg-primary-500 text-white shadow-md"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card
              className="cursor-pointer hover:border-primary-300 hover:shadow-md transition-all"
              onClick={() => { setMode("tour"); setTourStep(0); }}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                  <Rocket className="h-6 w-6 text-primary-500" />
                </div>
                <div>
                  <p className="font-semibold">סיור מודרך</p>
                  <p className="text-xs text-muted-foreground">הכר את המערכת שלב אחרי שלב</p>
                </div>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer hover:border-primary-300 hover:shadow-md transition-all"
              onClick={() => {
                if (!isCompleted) { setMode("setup"); }
                else { toast("info", "ההגדרה הראשונית הושלמה. ניתן לערוך הגדרות מעמוד ההגדרות."); navigate("/settings"); }
              }}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                  <Settings className="h-6 w-6 text-primary-500" />
                </div>
                <div>
                  <p className="font-semibold">הגדרה ראשונית</p>
                  <p className="text-xs text-muted-foreground">{isCompleted ? "הושלמה ✅" : "הגדר את המערכת"}</p>
                </div>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer hover:border-green-300 hover:shadow-md transition-all"
              onClick={() => setHelpCategory(null)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="font-semibold">כל המאמרים</p>
                  <p className="text-xs text-muted-foreground">{HELP_ARTICLES.filter(a => a.roles.includes(userRole)).length} מאמרים זמינים</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search & Filter */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <HelpCircle className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חפש במאמרי עזרה..."
                value={helpSearch}
                onChange={(e) => setHelpSearch(e.target.value)}
                className="ps-9 min-h-[44px]"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto">
              <button
                onClick={() => setHelpCategory(null)}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  !helpCategory ? "bg-primary-500 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                הכל
              </button>
              {HELP_CATEGORIES.map(cat => {
                const count = HELP_ARTICLES.filter(a => a.category === cat && a.roles.includes(userRole)).length;
                if (count === 0) return null;
                return (
                  <button
                    key={cat}
                    onClick={() => setHelpCategory(helpCategory === cat ? null : cat)}
                    className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                      helpCategory === cat ? "bg-primary-500 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Articles */}
          <div className="space-y-2">
            {filteredArticles.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg font-medium">לא נמצאו מאמרים</p>
                  <p className="text-sm mt-1">נסה לחפש במילים אחרות או לבחור קטגוריה אחרת</p>
                </CardContent>
              </Card>
            ) : filteredArticles.map(article => (
              <Card
                key={article.id}
                className="cursor-pointer hover:shadow-sm transition-all"
                onClick={() => setExpandedArticle(expandedArticle === article.id ? null : article.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{article.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{article.title}</h3>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-muted text-muted-foreground text-xs">{article.category}</Badge>
                          {expandedArticle === article.id ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      {expandedArticle === article.id && (
                        <div className="mt-3 text-sm text-foreground/80 whitespace-pre-line leading-relaxed animate-in slide-in-from-top-2">
                          {article.content}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Setup Wizard ───────────────────────────────

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 text-center relative">
          <button
            onClick={async () => {
              await skipOnboardingApi();
              localStorage.setItem(COMPLETED_KEY, "true");
              setIsCompleted(true);
              setMode("help");
            }}
            className="absolute end-0 top-0 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-lg hover:bg-muted"
          >
            דלג ←
          </button>
          <h1 className="text-3xl font-bold text-primary-500 flex items-center justify-center gap-2">
            <Sparkles className="w-8 h-8" />
            הגדרת שבצק
          </h1>
          <p className="mt-2 text-muted-foreground">
            הגדר את המערכת ב-7 צעדים פשוטים
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          {/* Progress bar */}
          <div className="h-2 bg-muted rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-300"
              style={{ width: `${((Object.keys(state.completed).length) / setupSteps.length) * 100}%` }}
            />
          </div>
          {/* Step indicators - compact dots on mobile, full labels on desktop */}
          <div className="hidden sm:flex items-center justify-center gap-1 overflow-x-auto pb-2">
            {setupSteps.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === state.currentStep;
              const isDone = state.completed[i];
              return (
                <button
                  key={i}
                  onClick={() => update({ currentStep: i })}
                  className={`flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs transition-all min-w-[70px] ${
                    isActive ? "bg-primary-500 text-white shadow-md scale-105" : isDone ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  <span className="whitespace-nowrap">{step.label_he}</span>
                </button>
              );
            })}
          </div>
          {/* Mobile: compact step indicators */}
          <div className="flex sm:hidden items-center justify-center gap-1.5 overflow-x-auto pb-1">
            {setupSteps.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === state.currentStep;
              const isDone = state.completed[i];
              return (
                <button
                  key={i}
                  onClick={() => update({ currentStep: i })}
                  title={step.label_he}
                  className={`flex items-center justify-center rounded-full transition-all flex-shrink-0 ${
                    isActive
                      ? "bg-primary-500 text-white shadow-md w-10 h-10"
                      : isDone
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 w-8 h-8"
                      : "bg-muted text-muted-foreground w-8 h-8"
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
          {/* Current step label on mobile */}
          <p className="sm:hidden text-center text-sm font-medium text-primary-600 mt-1">
            שלב {state.currentStep + 1}: {setupSteps[state.currentStep]?.label_he}
          </p>
        </div>

        {/* Step Content */}
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            {/* Step 0: Tenant Details */}
            {state.currentStep === 0 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-primary-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">פרטי היחידה</h2>
                    <p className="text-sm text-muted-foreground">ספר לנו על היחידה שלך — שם, אזור זמן ושפה</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>שם היחידה</Label>
                    <Input
                      value={state.tenant.name}
                      onChange={e => update({ tenant: { ...state.tenant, name: e.target.value } })}
                      placeholder="פלוגה א׳"
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>אזור זמן</Label>
                    <Select
                      value={state.tenant.timezone}
                      onChange={e => update({ tenant: { ...state.tenant, timezone: e.target.value } })}
                      className="min-h-[44px]"
                    >
                      <option value="Asia/Jerusalem">Asia/Jerusalem (UTC+2/3)</option>
                      <option value="Europe/London">Europe/London (UTC+0/1)</option>
                      <option value="America/New_York">America/New_York (UTC-5/4)</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>שפה</Label>
                    <Select
                      value={state.tenant.language}
                      onChange={e => update({ tenant: { ...state.tenant, language: e.target.value } })}
                      className="min-h-[44px]"
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
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                      <Users className="h-6 w-6 text-primary-500" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">תפקידי עבודה</h2>
                      <p className="text-sm text-muted-foreground">הגדר תפקידים שניתן לשבץ אליהם חיילים</p>
                    </div>
                  </div>
                  <Button size="sm" onClick={addWorkRole} className="min-h-[44px]">+ הוסף</Button>
                </div>
                <div className="space-y-3">
                  {state.workRoles.map((role, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border p-3 hover:shadow-sm transition-shadow">
                      <input type="color" value={role.color} onChange={e => updateWorkRole(i, "color", e.target.value)} className="h-8 w-8 cursor-pointer rounded" />
                      <Input placeholder="שם בעברית" value={role.name_he} onChange={e => updateWorkRole(i, "name_he", e.target.value)} className="flex-1 min-h-[44px]" />
                      <Input placeholder="Name in English" value={role.name_en} onChange={e => updateWorkRole(i, "name_en", e.target.value)} className="flex-1 min-h-[44px]" />
                      <Button variant="ghost" size="sm" onClick={() => removeWorkRole(i)} className="text-red-500 min-h-[44px]">✕</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Attendance Statuses */}
            {state.currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                      <ClipboardList className="h-6 w-6 text-green-500" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">סטטוסי נוכחות</h2>
                      <p className="text-sm text-muted-foreground">הגדר מצבים אפשריים לחיילים — נוכח, בית, חולה וכו׳</p>
                    </div>
                  </div>
                  <Button size="sm" onClick={addStatus} className="min-h-[44px]">+ הוסף</Button>
                </div>
                <div className="space-y-3">
                  {state.statuses.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border p-3 flex-wrap">
                      <input type="color" value={s.color} onChange={e => updateStatus(i, "color", e.target.value)} className="h-8 w-8 cursor-pointer rounded" />
                      <Input placeholder="קוד" value={s.code} onChange={e => updateStatus(i, "code", e.target.value)} className="w-24 min-h-[44px]" />
                      <Input placeholder="אימוג׳י" value={s.icon} onChange={e => updateStatus(i, "icon", e.target.value)} className="w-16 text-center min-h-[44px]" />
                      <Input placeholder="שם בעברית" value={s.name_he} onChange={e => updateStatus(i, "name_he", e.target.value)} className="flex-1 min-w-[100px] min-h-[44px]" />
                      <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                        <input type="checkbox" checked={s.counts_as_present} onChange={e => updateStatus(i, "counts_as_present", e.target.checked)} />
                        נחשב נוכח
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
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
                    <Target className="h-6 w-6 text-red-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">סוג משימה ראשון</h2>
                    <p className="text-sm text-muted-foreground">הגדר את סוג המשימה הראשון שלך. תוכל להוסיף עוד אחר כך.</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>שם (עברית)</Label>
                    <Input value={state.missionType.name_he} onChange={e => update({ missionType: { ...state.missionType, name_he: e.target.value } })} className="min-h-[44px]" />
                  </div>
                  <div className="space-y-2">
                    <Label>שם (אנגלית)</Label>
                    <Input value={state.missionType.name_en} onChange={e => update({ missionType: { ...state.missionType, name_en: e.target.value } })} className="min-h-[44px]" />
                  </div>
                  <div className="space-y-2">
                    <Label>צבע</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={state.missionType.color} onChange={e => update({ missionType: { ...state.missionType, color: e.target.value } })} className="h-10 w-16 cursor-pointer rounded" />
                      <span className="text-sm font-mono">{state.missionType.color}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>מקסימום חיילים</Label>
                    <Input type="number" min={1} value={state.missionType.max_soldiers} onChange={e => update({ missionType: { ...state.missionType, max_soldiers: parseInt(e.target.value) || 2 } })} className="min-h-[44px]" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Add Soldiers */}
            {state.currentStep === 4 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                      <UserPlus className="h-6 w-6 text-purple-500" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">הוספת חיילים</h2>
                      <p className="text-sm text-muted-foreground">הוסף חיילים ידנית או ייבא קובץ CSV</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addSoldier} className="min-h-[44px]">+ ידני</Button>
                    <label>
                      <Button size="sm" variant="outline" asChild className="min-h-[44px]">
                        <span><Upload className="me-1 h-4 w-4" />ייבוא CSV</span>
                      </Button>
                      <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
                    </label>
                  </div>
                </div>
                {state.soldiers.length > 0 ? (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {state.soldiers.map((s, i) => (
                      <div key={i} className="rounded border p-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <Input placeholder="שם מלא" value={s.full_name} onChange={e => updateSoldier(i, "full_name", e.target.value)} className="flex-1 min-h-[44px]" />
                          <Button variant="ghost" size="sm" onClick={() => removeSoldier(i)} className="text-red-500 flex-shrink-0">✕</Button>
                        </div>
                        <div className="flex gap-2">
                          <Input placeholder="מס׳ אישי" value={s.employee_number} onChange={e => updateSoldier(i, "employee_number", e.target.value)} className="flex-1 min-h-[44px]" />
                          <Input placeholder="טלפון" value={s.phone || ""} onChange={e => updateSoldier(i, "phone", e.target.value)} className="flex-1 min-h-[44px]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border-2 border-dashed p-8 text-center text-muted-foreground">
                    <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>אין חיילים עדיין. הוסף ידנית או ייבא CSV.</p>
                    <p className="text-xs mt-2">CSV עם עמודות: שם מלא, מספר אישי, טלפון, אימייל</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Google Sheets */}
            {state.currentStep === 5 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Sheet className="h-6 w-6 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">חיבור Google Sheets</h2>
                    <p className="text-sm text-muted-foreground">אופציונלי — תוכל לחבר גם מאוחר יותר דרך ההגדרות</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={state.sheetsConfig.enabled} onChange={e => update({ sheetsConfig: { ...state.sheetsConfig, enabled: e.target.checked } })} className="accent-primary-500" />
                  <span>חבר Google Sheets</span>
                </label>
                {state.sheetsConfig.enabled && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Spreadsheet ID</Label>
                      <Input value={state.sheetsConfig.spreadsheet_id} onChange={e => update({ sheetsConfig: { ...state.sheetsConfig, spreadsheet_id: e.target.value } })} placeholder="1BxiMVs0XRA5n..." dir="ltr" className="min-h-[44px]" />
                    </div>
                    <div className="space-y-2">
                      <Label>שם גיליון</Label>
                      <Input value={state.sheetsConfig.sheet_name} onChange={e => update({ sheetsConfig: { ...state.sheetsConfig, sheet_name: e.target.value } })} className="min-h-[44px]" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 6: Bot */}
            {state.currentStep === 6 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center">
                    <Bot className="h-6 w-6 text-orange-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">חיבור בוט</h2>
                    <p className="text-sm text-muted-foreground">אופציונלי — חבר בוט WhatsApp או Telegram</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state.botConfig.whatsapp_enabled} onChange={e => update({ botConfig: { ...state.botConfig, whatsapp_enabled: e.target.checked } })} className="accent-primary-500" />
                    <span>בוט WhatsApp</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state.botConfig.telegram_enabled} onChange={e => update({ botConfig: { ...state.botConfig, telegram_enabled: e.target.checked } })} className="accent-primary-500" />
                    <span>בוט Telegram</span>
                  </label>
                  {state.botConfig.telegram_enabled && (
                    <div className="space-y-2">
                      <Label>Telegram Bot Token</Label>
                      <Input value={state.botConfig.telegram_token} onChange={e => update({ botConfig: { ...state.botConfig, telegram_token: e.target.value } })} placeholder="123456:ABC-DEF..." dir="ltr" className="min-h-[44px]" />
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
                className="min-h-[48px]"
              >
                <ChevronRight className="me-1 h-4 w-4 rtl:rotate-180" />
                הקודם
              </Button>
              <span className="text-sm text-muted-foreground">
                {state.currentStep + 1} / {setupSteps.length}
              </span>
              {state.currentStep < setupSteps.length - 1 ? (
                <Button onClick={goNext} className="min-h-[48px]">
                  הבא
                  <ChevronLeft className="ms-1 h-4 w-4 rtl:rotate-180" />
                </Button>
              ) : (
                <Button onClick={finishOnboarding} disabled={saving} className="min-h-[48px] bg-green-600 hover:bg-green-700 gap-2">
                  {saving ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />שומר...</>
                  ) : (
                    <>🎉 סיום! המערכת מוכנה</>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Help link */}
        <div className="text-center mt-4">
          <button
            onClick={() => setMode("help")}
            className="text-sm text-muted-foreground hover:text-primary-500 transition-colors"
          >
            <HelpCircle className="inline-block h-4 w-4 me-1" />
            צריך עזרה? פתח את מרכז העזרה
          </button>
        </div>
      </div>
    </div>
  );
}
