import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import HelpTooltip from "@/components/common/HelpTooltip";
import AutoSaveIndicator from "@/components/common/AutoSaveIndicator";
import { useAutoSave } from "@/hooks/useAutoSave";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, ShieldCheck, Pencil, Trash2, Play, AlertTriangle, Info, Zap, Scale, Shield, Clock, FileSpreadsheet } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import * as XLSX from "xlsx";

// Human-readable operator labels
const OPERATORS = [
  { value: "gt", label_he: "גדול מ", label_en: "greater than", symbol: ">", types: ["number"] },
  { value: "gte", label_he: "גדול או שווה ל", label_en: "greater or equal", symbol: "≥", types: ["number"] },
  { value: "lt", label_he: "קטן מ", label_en: "less than", symbol: "<", types: ["number"] },
  { value: "lte", label_he: "קטן או שווה ל", label_en: "less or equal", symbol: "≤", types: ["number"] },
  { value: "eq", label_he: "שווה ל", label_en: "equals", symbol: "=", types: ["number", "string", "select", "bool"] },
  { value: "neq", label_he: "שונה מ", label_en: "not equals", symbol: "≠", types: ["number", "string", "select", "bool"] },
  { value: "is_true", label_he: "כן (אמת)", label_en: "is true", symbol: "✓", types: ["bool"] },
  { value: "is_false", label_he: "לא (שקר)", label_en: "is false", symbol: "✗", types: ["bool"] },
  { value: "is_null", label_he: "ריק", label_en: "is empty", symbol: "∅", types: ["number", "string", "select"] },
  { value: "is_not_null", label_he: "לא ריק", label_en: "is not empty", symbol: "≠∅", types: ["number", "string", "select"] },
  { value: "between", label_he: "בין", label_en: "between", symbol: "↔", types: ["number"] },
  { value: "in", label_he: "אחד מ", label_en: "is one of", symbol: "∈", types: ["string", "select"] },
  { value: "not_in", label_he: "לא אחד מ", label_en: "is not one of", symbol: "∉", types: ["string", "select"] },
];

const CATEGORY_OPTIONS = [
  { value: "general", label: "כללי", icon: ShieldCheck, color: "text-gray-500" },
  { value: "rest", label: "מנוחה", icon: Clock, color: "text-blue-500" },
  { value: "fairness", label: "הוגנות", icon: Scale, color: "text-green-500" },
  { value: "safety", label: "בטיחות", icon: Shield, color: "text-red-500" },
];

const SEVERITY_OPTIONS = [
  { value: "soft", label: "רך — אזהרה בלבד", description: "המשבץ יראה אזהרה אבל יוכל לשבץ בכל זאת", color: "bg-yellow-100 text-yellow-700" },
  { value: "hard", label: "חמור — חוסם שיבוץ", description: "המערכת לא תאפשר שיבוץ שמפר את החוק", color: "bg-red-100 text-red-700" },
];

const TYPE_LABELS: Record<string, string> = {
  number: "מספר",
  bool: "כן/לא",
  string: "טקסט",
  select: "בחירה",
};

export default function RulesPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [rules, setRules] = useState<any[]>([]);
  const [conditionFields, setConditionFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);

  // Form
  const [form, setForm] = useState({
    name_he: "", name_en: "", category: "general", severity: "soft", priority: 0,
    conditions: [{ field: "", operator: "gt", value: "" }] as Array<{ field: string; operator: string; value: string }>,
    action_type: "warn", action_message_he: "", action_message_en: "",
  });

  // Test
  const [testContext, setTestContext] = useState("{}");
  const [testResult, setTestResult] = useState<any>(null);
  const [showTestPanel, setShowTestPanel] = useState(false);

  // Auto-save for rule editing
  const ruleAutoSaveFn = useCallback(async () => {
    if (!editingRule || !form.name_he) return;
    const conditions = form.conditions.map(c => ({
      field: c.field,
      operator: c.operator,
      value: c.value === "true" ? true : c.value === "false" ? false : isNaN(Number(c.value)) ? c.value : Number(c.value),
    }));
    const body = {
      name: { he: form.name_he, en: form.name_en || form.name_he },
      category: form.category,
      severity: form.severity,
      priority: form.priority,
      condition_expression: { operator: "and", conditions },
      action_expression: {
        type: form.action_type,
        message: { he: form.action_message_he, en: form.action_message_en || form.action_message_he },
      },
    };
    await api.patch(tenantApi(`/rules/${editingRule.id}`), body);
  }, [editingRule, form]);

  const { triggerAutoSave: triggerRuleAutoSave, saving: ruleSaving, saved: ruleSaved, error: ruleError } = useAutoSave(ruleAutoSaveFn, {
    delay: 2000,
    onError: () => {},
  });

  const ruleFormInitRef = useRef(false);
  useEffect(() => {
    if (!editingRule) { ruleFormInitRef.current = false; return; }
    if (!ruleFormInitRef.current) { ruleFormInitRef.current = true; return; }
    triggerRuleAutoSave();
  }, [form, editingRule]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, fieldsRes] = await Promise.all([
        api.get(tenantApi("/rules")),
        api.get(tenantApi("/rules/condition-fields")).catch(() => ({ data: getDefaultFields() })),
      ]);
      setRules(rulesRes.data);
      setConditionFields(fieldsRes.data);
    } catch (e) {
      setLoadError(true);
      toast("error", "שגיאה בטעינת חוקים");
    } finally {
      setLoading(false);
    }
  }, []);

  const [loadError, setLoadError] = useState(false);

  useEffect(() => { load(); }, [load]);

  // Fallback condition fields if API doesn't return them
  function getDefaultFields() {
    return [
      { field: "employee.hours_since_last_mission", type: "number", label: { he: "שעות מנוחה מאז המשימה האחרונה", en: "Hours since last mission" }, description: { he: "כמה שעות עברו מאז שהחייל סיים את המשימה הקודמת", en: "Hours elapsed since employee finished previous mission" }, example: "16" },
      { field: "employee.last_mission_was_night", type: "bool", label: { he: "המשימה האחרונה הייתה לילית", en: "Last mission was night" }, description: { he: "האם המשימה האחרונה של החייל הייתה בין 23:00 ל-07:00", en: "Was the last mission between 23:00-07:00" }, example: "true" },
      { field: "employee.assignments_count_today", type: "number", label: { he: "מספר שיבוצים היום", en: "Assignments today" }, description: { he: "כמה משימות יש לחייל ביום הנוכחי", en: "Number of missions assigned today" }, example: "2" },
      { field: "employee.total_work_hours_today", type: "number", label: { he: "סה\"כ שעות עבודה היום", en: "Work hours today" }, description: { he: "כמה שעות החייל כבר עבד היום", en: "Total hours worked today" }, example: "8" },
      { field: "employee.total_work_hours_week", type: "number", label: { he: "סה\"כ שעות עבודה השבוע", en: "Work hours this week" }, description: { he: "כמה שעות החייל עבד השבוע הנוכחי (ראשון-שבת)", en: "Total hours worked this week" }, example: "40" },
      { field: "employee.consecutive_days_worked", type: "number", label: { he: "ימי עבודה רצופים", en: "Consecutive days worked" }, description: { he: "כמה ימים ברצף החייל עבד בלי יום חופש", en: "Days worked in a row without a day off" }, example: "6" },
      { field: "employee.status", type: "select", label: { he: "סטטוס נוכחות", en: "Attendance status" }, description: { he: "הסטטוס הנוכחי של החייל (נוכח, בבית, חולה...)", en: "Current attendance status" }, options: ["present", "home", "sick", "vacation", "training", "reserve"], example: "present" },
      { field: "employee.missions_week", type: "number", label: { he: "מספר משימות השבוע", en: "Missions this week" }, description: { he: "כמה משימות ביצע החייל השבוע", en: "Number of missions this week" }, example: "5" },
      { field: "mission.start_hour", type: "number", label: { he: "שעת התחלת המשימה", en: "Mission start hour" }, description: { he: "באיזו שעה המשימה מתחילה (0-23)", en: "Mission start hour (0-23)" }, example: "7" },
      { field: "mission.end_hour", type: "number", label: { he: "שעת סיום המשימה", en: "Mission end hour" }, description: { he: "באיזו שעה המשימה נגמרת (0-23)", en: "Mission end hour (0-23)" }, example: "15" },
      { field: "mission.is_night", type: "bool", label: { he: "משימה לילית", en: "Night mission" }, description: { he: "האם המשימה מתרחשת בשעות הלילה (23:00-07:00)", en: "Is the mission during night hours" }, example: "true" },
      { field: "mission.duration_hours", type: "number", label: { he: "משך המשימה (שעות)", en: "Mission duration" }, description: { he: "כמה שעות נמשכת המשימה", en: "Duration in hours" }, example: "8" },
      { field: "mission.is_weekend", type: "bool", label: { he: "משימה בסוף שבוע", en: "Weekend mission" }, description: { he: "האם המשימה ביום שישי או שבת", en: "Is it a Friday/Saturday mission" }, example: "false" },
      { field: "assignment.is_standby", type: "bool", label: { he: "כוננות", en: "Standby" }, description: { he: "האם זו משימת כוננות (לא משמרת רגילה)", en: "Is this a standby assignment" }, example: "false" },
      { field: "mission.day_of_week", type: "number", label: { he: "יום בשבוע", en: "Day of week" }, description: { he: "0=ראשון, 1=שני... 6=שבת", en: "0=Sunday, 6=Saturday" }, example: "5" },
    ];
  }

  const getFieldInfo = (fieldKey: string) => conditionFields.find(f => f.field === fieldKey);

  const getOperatorsForField = (fieldKey: string) => {
    const fieldInfo = getFieldInfo(fieldKey);
    if (!fieldInfo) return OPERATORS;
    return OPERATORS.filter(op => op.types.includes(fieldInfo.type));
  };

  const saveRule = async () => {
    if (!form.name_he) { toast("error", "יש להזין שם לחוק"); return; }
    if (form.conditions.some(c => !c.field)) { toast("error", "יש לבחור שדה לכל תנאי"); return; }

    try {
      const conditions = form.conditions.map(c => ({
        field: c.field,
        operator: c.operator,
        value: c.value === "true" ? true : c.value === "false" ? false : isNaN(Number(c.value)) ? c.value : Number(c.value),
      }));
      const body = {
        name: { he: form.name_he, en: form.name_en || form.name_he },
        category: form.category,
        severity: form.severity,
        priority: form.priority,
        condition_expression: { operator: "and", conditions },
        action_expression: {
          type: form.action_type,
          message: { he: form.action_message_he, en: form.action_message_en || form.action_message_he },
        },
      };

      if (editingRule) {
        await api.patch(tenantApi(`/rules/${editingRule.id}`), body);
        toast("success", "החוק עודכן בהצלחה");
      } else {
        await api.post(tenantApi("/rules"), body);
        toast("success", "חוק חדש נוצר בהצלחה");
      }
      setShowModal(false);
      setEditingRule(null);
      load();
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בשמירת החוק"));
    }
  };

  const deleteRule = async (id: string) => {
    try {
      await api.delete(tenantApi(`/rules/${id}`));
      toast("success", "החוק הושבת");
      load();
    } catch (e) {
      toast("error", "שגיאה בהשבתת החוק");
    }
  };

  const testRule = async () => {
    try {
      const conditions = form.conditions.map(c => ({
        field: c.field,
        operator: c.operator,
        value: c.value === "true" ? true : c.value === "false" ? false : isNaN(Number(c.value)) ? c.value : Number(c.value),
      }));
      const res = await api.post(tenantApi("/rules/test"), {
        condition_expression: { operator: "and", conditions },
        test_context: JSON.parse(testContext),
      });
      setTestResult(res.data);
    } catch (e: any) {
      toast("error", "שגיאה בבדיקת החוק — ודא שה-JSON תקין");
    }
  };

  const openCreate = () => {
    setEditingRule(null);
    setForm({
      name_he: "", name_en: "", category: "general", severity: "soft", priority: 0,
      conditions: [{ field: "", operator: "gt", value: "" }],
      action_type: "warn", action_message_he: "", action_message_en: "",
    });
    setTestResult(null);
    setShowTestPanel(false);
    setShowModal(true);
  };

  const openEdit = (rule: any) => {
    setEditingRule(rule);
    const conds = rule.condition_expression?.conditions || [];
    setForm({
      name_he: rule.name?.he || "", name_en: rule.name?.en || "",
      category: rule.category, severity: rule.severity, priority: rule.priority,
      conditions: conds.length > 0 ? conds.map((c: any) => ({ field: c.field || "", operator: c.operator || "gt", value: String(c.value ?? "") })) : [{ field: "", operator: "gt", value: "" }],
      action_type: rule.action_expression?.type || "warn",
      action_message_he: rule.action_expression?.message?.he || "",
      action_message_en: rule.action_expression?.message?.en || "",
    });
    setTestResult(null);
    setShowTestPanel(false);
    setShowModal(true);
  };

  // Build human-readable summary of a rule's conditions
  const buildConditionSummary = (rule: any): string => {
    const conds = rule.condition_expression?.conditions || [];
    return conds.map((c: any) => {
      const fieldInfo = conditionFields.find(f => f.field === c.field);
      const fieldLabel = fieldInfo?.label?.[lang] || fieldInfo?.label?.he || c.field;
      const op = OPERATORS.find(o => o.value === c.operator);
      const opLabel = op ? (lang === "he" ? op.label_he : op.label_en) : c.operator;
      return `${fieldLabel} ${opLabel} ${c.value}`;
    }).join(" וגם ");
  };

  const exportRulesExcel = () => {
    const data = rules.map(rule => ({
      "שם": rule.name?.[lang] || rule.name?.he || "",
      "קטגוריה": CATEGORY_OPTIONS.find(c => c.value === rule.category)?.label || rule.category,
      "חומרה": rule.severity === "hard" ? "חמור — חוסם" : "רך — אזהרה",
      "תנאים": buildConditionSummary(rule) || "ללא תנאים",
      "פעיל": rule.is_active ? "כן" : "לא",
      "עדיפות": rule.priority,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 50 }, { wch: 8 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "חוקים");
    XLSX.writeFile(wb, "rules.xlsx");
  };

  if (loading) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-9 w-36 bg-muted rounded animate-pulse" />
      </div>
      <TableSkeleton rows={5} cols={4} />
    </div>
  );

  if (loadError && rules.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <ShieldCheck className="h-16 w-16 text-yellow-500 mb-4" />
      <h2 className="text-xl font-bold mb-2">שגיאה בטעינת חוקים</h2>
      <p className="text-muted-foreground mb-4">לא ניתן היה לטעון את הנתונים. נסה שוב.</p>
      <button onClick={load} className="inline-flex items-center gap-2 rounded-lg bg-primary-500 text-white px-4 py-2 text-sm hover:bg-primary-600 transition-colors">
        נסה שוב
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{t("nav.rules")}</h1>
          <HelpTooltip
            title={{ he: "חוקי שיבוץ", en: "Scheduling Rules" }}
            content={{ he: "חוקים מגדירים מתי מותר ומתי אסור לשבץ חייל.\nחוק רך = אזהרה בלבד, חוק חמור = חוסם שיבוץ.", en: "Rules define when scheduling is allowed. Soft = warning only, Hard = blocks." }}
            examples={[{ he: "מנוחה מינימלית: אם עברו פחות מ-16 שעות → חסום", en: "Min rest: if less than 16h → block" }]}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportRulesExcel} className="min-h-[44px]">
            <FileSpreadsheet className="me-1 h-4 w-4" />ייצוא Excel
          </Button>
          <Button size="sm" onClick={openCreate} className="min-h-[44px]">
            <Plus className="me-1 h-4 w-4" />חוק חדש
          </Button>
        </div>
      </div>

      {/* Rules list */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              <ShieldCheck className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-lg font-medium">אין חוקים עדיין</p>
              <p className="text-sm mt-1">הוסף חוק ראשון כדי להגדיר כללי שיבוץ</p>
              <Button size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="me-1 h-4 w-4" />צור חוק ראשון
              </Button>
            </CardContent>
          </Card>
        ) : rules.map(rule => (
          <Card key={rule.id} className="hover:shadow-md transition-all">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    rule.severity === "hard" ? "bg-red-100 dark:bg-red-900/30" : "bg-yellow-100 dark:bg-yellow-900/30"
                  }`}>
                    {rule.severity === "hard"
                      ? <Shield className="h-5 w-5 text-red-500" />
                      : <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    }
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold">{rule.name?.[lang] || rule.name?.he}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                      {buildConditionSummary(rule) || "ללא תנאים"}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge className={rule.severity === "hard" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}>
                        {rule.severity === "hard" ? "חמור — חוסם" : "רך — אזהרה"}
                      </Badge>
                      <Badge className="bg-muted text-muted-foreground">
                        {CATEGORY_OPTIONS.find(c => c.value === rule.category)?.label || rule.category}
                      </Badge>
                      <Badge className={rule.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                        {rule.is_active ? "פעיל" : "מושבת"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="sm" variant="ghost" className="min-h-[40px] min-w-[40px]" onClick={() => openEdit(rule)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="min-h-[40px] min-w-[40px]" onClick={() => deleteRule(rule.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rule Builder Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-[750px] max-h-[90vh] overflow-y-auto mobile-fullscreen">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl">{editingRule ? "עריכת חוק" : "יצירת חוק חדש"}</DialogTitle>
              {editingRule && <AutoSaveIndicator saving={ruleSaving} saved={ruleSaved} error={ruleError} />}
            </div>
          </DialogHeader>
          <div className="space-y-5 py-4">

            {/* === Section 1: Basic Info === */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                📝 פרטי החוק
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>שם החוק (עברית) *</Label>
                    <HelpTooltip content={{ he: "שם קצר ומובן שמתאר את החוק.\nזה מה שיופיע ברשימת החוקים.", en: "Short descriptive name for the rule." }} />
                  </div>
                  <Input
                    value={form.name_he}
                    onChange={e => setForm({...form, name_he: e.target.value})}
                    placeholder="לדוגמה: מנוחה מינימלית 16 שעות"
                    className="min-h-[44px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>שם החוק (אנגלית)</Label>
                  <Input
                    value={form.name_en}
                    onChange={e => setForm({...form, name_en: e.target.value})}
                    placeholder="e.g. Minimum 16h rest"
                    className="min-h-[44px]"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* === Section 2: Category & Severity === */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                ⚙️ סיווג וחומרה
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>קטגוריה</Label>
                    <HelpTooltip content={{ he: "קטגוריית החוק — מנוחה, שעות עבודה, יציאה, חזרה.\n\nקטגוריה עוזרת לארגן את החוקים:\n• כללי — חוקים רגילים\n• מנוחה — הפסקות ושעות מנוחה\n• הוגנות — חלוקה שוויונית\n• בטיחות — כללי בטיחות", en: "Rule category — rest, work hours, departure, return." }} />
                  </div>
                  <Select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="min-h-[44px]">
                    {CATEGORY_OPTIONS.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>חומרה *</Label>
                    <HelpTooltip
                      title={{ he: "חומרה — hard = חוסם שיבוץ, soft = אזהרה בלבד", en: "Severity — hard blocks, soft warns" }}
                      content={{ he: "רך (soft / אזהרה) — המשבץ יראה אזהרה צהובה, אבל יוכל לשבץ בכל זאת.\n\nחמור (hard / חסימה) — המערכת תחסום את השיבוץ לגמרי. רק מנהל מערכת יכול לעקוף.", en: "Soft = warning only. Hard = blocks assignment completely." }}
                    />
                  </div>
                  <div className="space-y-2">
                    {SEVERITY_OPTIONS.map(sev => (
                      <label
                        key={sev.value}
                        className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                          form.severity === sev.value ? "ring-2 ring-primary-500 border-primary-300" : "hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="severity"
                          value={sev.value}
                          checked={form.severity === sev.value}
                          onChange={e => setForm({...form, severity: e.target.value})}
                          className="mt-1 accent-primary-500"
                        />
                        <div>
                          <span className="font-medium text-sm">{sev.label}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{sev.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>עדיפות</Label>
                    <HelpTooltip content={{ he: "סדר עדיפות — מספר גבוה = חוק חשוב יותר.\n\nכשיש התנגשות בין חוקים, החוק עם העדיפות הגבוהה מנצח.\nלדוגמה: חוק מנוחה (עדיפות 90) גובר על חוק הוגנות (עדיפות 50).", en: "Priority — higher number = more important rule." }} />
                  </div>
                  <Input
                    type="number"
                    value={form.priority}
                    onChange={e => setForm({...form, priority: Number(e.target.value)})}
                    className="min-h-[44px]"
                    min={0}
                    max={100}
                  />
                </div>
              </div>
            </div>

            {/* === Section 3: Conditions (THE CORE) === */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                  🔍 תנאים — מתי החוק חל?
                  <HelpTooltip
                    title={{ he: "מהו תנאי?", en: "What is a condition?" }}
                    content={{ he: "תנאי בודק נתון מסוים לפני כל שיבוץ.\nלדוגמה: אם עברו פחות מ-16 שעות מנוחה → החוק חל.\n\nאם יש כמה תנאים, כולם צריכים להתקיים (וגם).\n\nהיקף החוק (scope) נקבע לפי השדות שתבחר:\n• שדות עובד → חל על עובד ספציפי\n• שדות משימה → חל על סוג משימה\n• שניהם → גלובלי (כל הטננט)", en: "A condition checks a value before each assignment. Scope is determined by the fields you choose." }}
                    examples={[
                      { he: "שעות מנוחה < 16 → חסום שיבוץ", en: "Rest hours < 16 → block" },
                      { he: "שעות עבודה היום > 8 → אזהרה", en: "Work hours today > 8 → warn" },
                    ]}
                  />
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[36px]"
                  onClick={() => setForm({...form, conditions: [...form.conditions, { field: "", operator: "gt", value: "" }]})}
                >
                  <Plus className="h-3 w-3 me-1" />הוסף תנאי
                </Button>
              </div>

              {form.conditions.map((cond, i) => {
                const fieldInfo = getFieldInfo(cond.field);
                const availableOps = getOperatorsForField(cond.field);

                return (
                  <div key={i} className="rounded-xl border bg-muted/20 p-3 space-y-2">
                    {i > 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <div className="flex-1 border-t" />
                        <span className="bg-muted px-2 py-0.5 rounded-full font-medium">וגם (AND)</span>
                        <div className="flex-1 border-t" />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
                      {/* Field selector */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">מה לבדוק?</Label>
                          {fieldInfo && (
                            <HelpTooltip
                              title={fieldInfo.label}
                              content={fieldInfo.description || fieldInfo.label}
                              examples={fieldInfo.example ? [{ he: `דוגמה: ${fieldInfo.example}`, en: `Example: ${fieldInfo.example}` }] : undefined}
                            />
                          )}
                        </div>
                        <Select
                          value={cond.field}
                          onChange={e => {
                            const c = [...form.conditions];
                            c[i].field = e.target.value;
                            // Reset operator for new field type
                            const newFieldInfo = conditionFields.find(f => f.field === e.target.value);
                            if (newFieldInfo?.type === "bool") {
                              c[i].operator = "is_true";
                              c[i].value = "true";
                            }
                            setForm({...form, conditions: c});
                          }}
                          className="min-h-[44px]"
                        >
                          <option value="">בחר שדה...</option>
                          <optgroup label="👤 עובד">
                            {conditionFields.filter(f => f.field.startsWith("employee.")).map(f => {
                              const desc = f.description?.[lang] || f.description?.he || "";
                              const shortDesc = desc.length > 40 ? desc.slice(0, 40) + "…" : desc;
                              return (
                                <option key={f.field} value={f.field}>
                                  {f.label?.[lang] || f.label?.he} ({TYPE_LABELS[f.type] || f.type}){shortDesc ? ` — ${shortDesc}` : ""}
                                </option>
                              );
                            })}
                          </optgroup>
                          <optgroup label="📋 משימה">
                            {conditionFields.filter(f => f.field.startsWith("mission.")).map(f => {
                              const desc = f.description?.[lang] || f.description?.he || "";
                              const shortDesc = desc.length > 40 ? desc.slice(0, 40) + "…" : desc;
                              return (
                                <option key={f.field} value={f.field}>
                                  {f.label?.[lang] || f.label?.he} ({TYPE_LABELS[f.type] || f.type}){shortDesc ? ` — ${shortDesc}` : ""}
                                </option>
                              );
                            })}
                          </optgroup>
                          <optgroup label="🔗 שיבוץ">
                            {conditionFields.filter(f => f.field.startsWith("assignment.")).map(f => {
                              const desc = f.description?.[lang] || f.description?.he || "";
                              const shortDesc = desc.length > 40 ? desc.slice(0, 40) + "…" : desc;
                              return (
                                <option key={f.field} value={f.field}>
                                  {f.label?.[lang] || f.label?.he} ({TYPE_LABELS[f.type] || f.type}){shortDesc ? ` — ${shortDesc}` : ""}
                                </option>
                              );
                            })}
                          </optgroup>
                        </Select>
                      </div>

                      {/* Operator */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">איך?</Label>
                          <HelpTooltip content={{ he: "בחר את סוג ההשוואה:\n• גדול מ (>) — ערך גבוה מהמספר שתזין\n• קטן מ (<) — ערך נמוך מהמספר\n• שווה ל (=) — ערך זהה\n• שונה מ (≠) — ערך שונה\n• בין (↔) — טווח מספרים\n• אחד מ (∈) — אחד מרשימת ערכים\n• כן/לא (✓/✗) — לשדות בוליאניים\n• ריק/לא ריק (∅) — בדיקת קיום ערך", en: "Choose comparison: >, <, =, ≠, between, in, is_true/false, is_null/not_null" }} />
                        </div>
                        <Select
                          value={cond.operator}
                          onChange={e => {
                            const c = [...form.conditions]; c[i].operator = e.target.value; setForm({...form, conditions: c});
                          }}
                          className="min-h-[44px] min-w-[140px]"
                        >
                          {availableOps.map(op => (
                            <option key={op.value} value={op.value}>
                              {op.symbol} {lang === "he" ? op.label_he : op.label_en}
                            </option>
                          ))}
                        </Select>
                      </div>

                      {/* Value — smart visibility based on operator */}
                      {(() => {
                        const hideValue = ["is_true", "is_false", "is_null", "is_not_null"].includes(cond.operator);
                        const isBetween = cond.operator === "between";
                        const isMulti = ["in", "not_in"].includes(cond.operator);

                        if (hideValue) return <div />;

                        if (isBetween) {
                          const parts = (cond.value || ",").split(",");
                          return (
                            <div className="space-y-1">
                              <Label className="text-xs">טווח (מ — עד)</Label>
                              <div className="flex gap-1.5 items-center">
                                <Input
                                  type="number"
                                  value={parts[0] || ""}
                                  onChange={e => {
                                    const c = [...form.conditions]; c[i].value = `${e.target.value},${parts[1] || ""}`; setForm({...form, conditions: c});
                                  }}
                                  placeholder="מינימום"
                                  className="min-h-[44px]"
                                />
                                <span className="text-muted-foreground text-xs">—</span>
                                <Input
                                  type="number"
                                  value={parts[1] || ""}
                                  onChange={e => {
                                    const c = [...form.conditions]; c[i].value = `${parts[0] || ""},${e.target.value}`; setForm({...form, conditions: c});
                                  }}
                                  placeholder="מקסימום"
                                  className="min-h-[44px]"
                                />
                              </div>
                            </div>
                          );
                        }

                        if (isMulti) {
                          const tags = cond.value ? cond.value.split(",").filter(Boolean) : [];
                          return (
                            <div className="space-y-1">
                              <Label className="text-xs">ערכים (הפרד בפסיק)</Label>
                              <div className="space-y-1.5">
                                {fieldInfo?.type === "select" && fieldInfo.options ? (
                                  <div className="flex flex-wrap gap-1.5 rounded-lg border p-2 min-h-[44px]">
                                    {fieldInfo.options.map((opt: string) => {
                                      const selected = tags.includes(opt);
                                      return (
                                        <button key={opt} type="button" onClick={() => {
                                          const c = [...form.conditions];
                                          const newTags = selected ? tags.filter(t => t !== opt) : [...tags, opt];
                                          c[i].value = newTags.join(",");
                                          setForm({...form, conditions: c});
                                        }} className={`text-xs px-2 py-1 rounded-lg border transition-colors ${selected ? "bg-primary-500 text-white border-primary-500" : "bg-muted hover:bg-accent"}`}>
                                          {opt}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <Input
                                    value={cond.value}
                                    onChange={e => {
                                      const c = [...form.conditions]; c[i].value = e.target.value; setForm({...form, conditions: c});
                                    }}
                                    placeholder="ערך1,ערך2,ערך3"
                                    className="min-h-[44px]"
                                  />
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Default: single value
                        return (
                          <div className="space-y-1">
                            <Label className="text-xs">ערך</Label>
                            {fieldInfo?.type === "select" && fieldInfo.options ? (
                              <Select
                                value={cond.value}
                                onChange={e => {
                                  const c = [...form.conditions]; c[i].value = e.target.value; setForm({...form, conditions: c});
                                }}
                                className="min-h-[44px]"
                              >
                                <option value="">בחר...</option>
                                {fieldInfo.options.map((opt: string) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </Select>
                            ) : (
                              <Input
                                value={cond.value}
                                onChange={e => {
                                  const c = [...form.conditions]; c[i].value = e.target.value; setForm({...form, conditions: c});
                                }}
                                placeholder={fieldInfo?.example ? `דוגמה: ${fieldInfo.example}` : "הזן ערך..."}
                                className="min-h-[44px]"
                                type={fieldInfo?.type === "number" ? "number" : "text"}
                              />
                            )}
                          </div>
                        );
                      })()}

                      {/* Delete */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-[44px] min-w-[44px]"
                        onClick={() => setForm({...form, conditions: form.conditions.filter((_, j) => j !== i)})}
                        disabled={form.conditions.length <= 1}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>

                    {/* Live preview of this condition */}
                    {cond.field && (
                      <div className="text-xs bg-muted/50 rounded-lg px-3 py-1.5 text-muted-foreground">
                        💡 {(() => {
                          const fLabel = fieldInfo?.label?.[lang] || fieldInfo?.label?.he || cond.field;
                          const op = OPERATORS.find(o => o.value === cond.operator);
                          const opLabel = op ? (lang === "he" ? op.label_he : op.label_en) : cond.operator;
                          if (["is_true", "is_false"].includes(cond.operator)) {
                            return `אם "${fLabel}" ${cond.operator === "is_true" ? "כן" : "לא"}`;
                          }
                          if (["is_null", "is_not_null"].includes(cond.operator)) {
                            return `אם "${fLabel}" ${cond.operator === "is_null" ? "ריק" : "לא ריק"}`;
                          }
                          if (cond.operator === "between") {
                            const parts = (cond.value || ",").split(",");
                            return `אם "${fLabel}" בין ${parts[0] || "?"} ל-${parts[1] || "?"}`;
                          }
                          if (["in", "not_in"].includes(cond.operator)) {
                            return `אם "${fLabel}" ${cond.operator === "in" ? "אחד מ" : "לא אחד מ"}: ${cond.value || "?"}`;
                          }
                          return `אם "${fLabel}" ${opLabel} ${cond.value || "?"}`;
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* === Section 4: Action === */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                ⚡ מה קורה כשהתנאי מתקיים?
                <HelpTooltip content={{ he: "כשכל התנאים מתקיימים, המערכת תבצע את הפעולה שתבחר:\n• אזהרה — הודעה צהובה\n• חסימה — לא ניתן לשבץ\n• ניקוד — הורדת ציון (שיבוץ אוטומטי)", en: "Action when conditions are met." }} />
              </h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>סוג פעולה</Label>
                    <HelpTooltip content={{ he: "סוג פעולה — block = חסום, warn = הזהרה, score = השפע על ניקוד.\n\n• אזהרה (warn) — הודעה צהובה למשבץ\n• חסימה (block) — לא ניתן לשבץ כלל\n• ניקוד (score) — השפעה על ציון בשיבוץ אוטומטי", en: "Action type — block, warn, or score." }} />
                  </div>
                  <Select value={form.action_type} onChange={e => setForm({...form, action_type: e.target.value})} className="min-h-[44px]">
                    <option value="warn">⚠️ אזהרה — הצג הודעה למשבץ</option>
                    <option value="block">🚫 חסימה — מנע שיבוץ לגמרי</option>
                    <option value="score">📊 ניקוד — הורד ציון בשיבוץ אוטומטי</option>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label>הודעה (עברית) *</Label>
                      <HelpTooltip
                        content={{ he: "ההודעה שתוצג למשבץ כשהחוק חל.\nניתן להשתמש במשתנים:\n• {employee.name} — שם החייל\n• {hours} — שעות מנוחה\n• {mission.name} — שם המשימה", en: "Message shown when rule triggers. Use variables." }}
                        examples={[
                          { he: "לחייל {employee.name} נותרו רק {hours} שעות מנוחה, נדרש מינימום 16", en: "Employee {employee.name} only has {hours} hours rest" },
                        ]}
                      />
                    </div>
                    <Input
                      value={form.action_message_he}
                      onChange={e => setForm({...form, action_message_he: e.target.value})}
                      placeholder="הזן הודעה שתוצג..."
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>הודעה (אנגלית)</Label>
                    <Input
                      value={form.action_message_en}
                      onChange={e => setForm({...form, action_message_en: e.target.value})}
                      placeholder="Enter message..."
                      className="min-h-[44px]"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* === Section 5: Test Panel === */}
            <div className="space-y-3 border-t pt-4">
              <button
                onClick={() => setShowTestPanel(!showTestPanel)}
                className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                <Play className="h-4 w-4" />
                🧪 בדיקת החוק (אופציונלי)
              </button>
              {showTestPanel && (
                <div className="space-y-3 animate-in slide-in-from-top-2">
                  <p className="text-xs text-muted-foreground">הזן נתוני דוגמה בפורמט JSON כדי לבדוק אם החוק חל:</p>
                  <textarea
                    value={testContext}
                    onChange={e => setTestContext(e.target.value)}
                    className="w-full h-24 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-mono"
                    dir="ltr"
                    placeholder='{"employee": {"hours_since_last_mission": 5}, "mission": {"is_night": true}}'
                  />
                  <Button size="sm" variant="outline" onClick={testRule} className="min-h-[40px]">
                    <Play className="me-1 h-3 w-3" />הרץ בדיקה
                  </Button>
                  {testResult && (
                    <div className={`rounded-xl p-3 text-sm ${testResult.result ? "bg-green-50 dark:bg-green-900/20 text-green-700" : "bg-red-50 dark:bg-red-900/20 text-red-700"}`}>
                      {testResult.result ? "✅ התנאי מתקיים — החוק חל" : "❌ התנאי לא מתקיים — החוק לא חל"}
                      {testResult.explanation && <p className="text-xs mt-1 opacity-80">{testResult.explanation}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} className="min-h-[44px]">ביטול</Button>
            <Button onClick={saveRule} className="min-h-[44px]">
              {editingRule ? "עדכן חוק" : "צור חוק"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
