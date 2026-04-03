import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, ShieldCheck, Pencil, Trash2, Play, AlertTriangle, Scale, Shield, Clock, FileSpreadsheet, BookOpen, ChevronDown, ChevronRight } from "lucide-react";
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
  { value: "rest", label: "מנוחה", icon: Clock, color: "text-primary-500" },
  { value: "fairness", label: "הוגנות", icon: Scale, color: "text-green-500" },
  { value: "safety", label: "בטיחות", icon: Shield, color: "text-red-500" },
];

const SEVERITY_OPTIONS = [
  { value: "soft", label: "רך — אזהרה בלבד", description: "המשבץ יראה אזהרה אבל יוכל לשבץ בכל זאת", color: "bg-yellow-100 text-yellow-700" },
  { value: "hard", label: "חמור — חוסם שיבוץ", description: "המערכת לא תאפשר שיבוץ שמפר את החוק", color: "bg-red-100 text-red-700" },
];

// ─── Condition Groups (AND/OR nesting) ────────────

interface ConditionItem {
  field: string;
  operator: string;
  value: string;
}

interface ConditionGroup {
  logicOperator: "and" | "or";
  conditions: ConditionItem[];
}

function flattenGroupsToConditions(groups: ConditionGroup[]): { operator: string; conditions: any[] } {
  // If single group, return flat
  if (groups.length === 1) {
    return {
      operator: groups[0].logicOperator,
      conditions: groups[0].conditions.map(c => ({
        field: c.field,
        operator: c.operator,
        value: c.value === "true" ? true : c.value === "false" ? false : isNaN(Number(c.value)) ? c.value : Number(c.value),
      })),
    };
  }
  // Multiple groups: wrap in AND of OR groups
  return {
    operator: "and",
    conditions: groups.map(g => ({
      operator: g.logicOperator,
      conditions: g.conditions.map(c => ({
        field: c.field,
        operator: c.operator,
        value: c.value === "true" ? true : c.value === "false" ? false : isNaN(Number(c.value)) ? c.value : Number(c.value),
      })),
    })),
  };
}

function parseConditionExpression(expr: any): ConditionGroup[] {
  if (!expr) return [{ logicOperator: "and", conditions: [{ field: "", operator: "gt", value: "" }] }];
  const conds = expr.conditions || [];
  if (conds.length === 0) return [{ logicOperator: "and", conditions: [{ field: "", operator: "gt", value: "" }] }];
  // Check if nested groups
  if (conds[0]?.conditions) {
    return conds.map((g: any) => ({
      logicOperator: g.operator || "and",
      conditions: (g.conditions || []).map((c: any) => ({
        field: c.field || "",
        operator: c.operator || "gt",
        value: String(c.value ?? ""),
      })),
    }));
  }
  // Flat conditions → single group
  return [{
    logicOperator: (expr.operator || "and") as "and" | "or",
    conditions: conds.map((c: any) => ({
      field: c.field || "",
      operator: c.operator || "gt",
      value: String(c.value ?? ""),
    })),
  }];
}

// ─── Rule Templates ────────────────────────────────

interface RuleTemplate {
  id: string;
  name_he: string;
  name_en: string;
  category: string;
  severity: string;
  description_he: string;
  groups: ConditionGroup[];
  action_type: string;
  action_message_he: string;
  priority: number;
}

const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: "min_rest",
    name_he: "מנוחה מינימלית 8 שעות",
    name_en: "Minimum 8h rest",
    category: "rest",
    severity: "hard",
    description_he: "חוסם שיבוץ אם לא עברו לפחות 8 שעות מנוחה מהמשימה האחרונה",
    groups: [{ logicOperator: "and", conditions: [{ field: "employee.hours_since_last_mission", operator: "lt", value: "8" }] }],
    action_type: "block",
    action_message_he: "לחייל לא עברו 8 שעות מנוחה מהמשימה האחרונה",
    priority: 90,
  },
  {
    id: "max_week_hours",
    name_he: "מקסימום 48 שעות בשבוע",
    name_en: "Max 48h per week",
    category: "fairness",
    severity: "soft",
    description_he: "אזהרה אם חייל עובד יותר מ-48 שעות בשבוע",
    groups: [{ logicOperator: "and", conditions: [{ field: "employee.total_work_hours_week", operator: "gt", value: "48" }] }],
    action_type: "warn",
    action_message_he: "החייל עבר 48 שעות עבודה השבוע",
    priority: 70,
  },
  {
    id: "consecutive_days",
    name_he: "מקסימום 6 ימים רצופים",
    name_en: "Max 6 consecutive days",
    category: "rest",
    severity: "hard",
    description_he: "חוסם שיבוץ אם החייל עבד 6 ימים רצופים ללא חופש",
    groups: [{ logicOperator: "and", conditions: [{ field: "employee.consecutive_days_worked", operator: "gte", value: "6" }] }],
    action_type: "block",
    action_message_he: "החייל עבד 6 ימים רצופים — חייב לקבל יום חופש",
    priority: 85,
  },
  {
    id: "night_rest",
    name_he: "מנוחה אחרי משמרת לילה",
    name_en: "Rest after night shift",
    category: "safety",
    severity: "hard",
    description_he: "חוסם שיבוץ בוקר אחרי משמרת לילה אם לא עברו 12 שעות",
    groups: [{
      logicOperator: "and",
      conditions: [
        { field: "employee.last_mission_was_night", operator: "is_true", value: "true" },
        { field: "employee.hours_since_last_mission", operator: "lt", value: "12" },
      ],
    }],
    action_type: "block",
    action_message_he: "לא ניתן לשבץ משמרת בוקר אחרי לילה — נדרשות 12 שעות מנוחה",
    priority: 95,
  },
  {
    id: "max_shifts_week",
    name_he: "מקסימום 6 משמרות בשבוע",
    name_en: "Max 6 shifts per week",
    category: "fairness",
    severity: "soft",
    description_he: "אזהרה אם חייל עושה יותר מ-6 משימות בשבוע",
    groups: [{ logicOperator: "and", conditions: [{ field: "employee.missions_week", operator: "gt", value: "6" }] }],
    action_type: "warn",
    action_message_he: "החייל עשה יותר מ-6 משימות השבוע",
    priority: 60,
  },
  {
    id: "only_present",
    name_he: "שיבוץ רק לנוכחים",
    name_en: "Only schedule present soldiers",
    category: "general",
    severity: "hard",
    description_he: "חוסם שיבוץ של חייל שלא נמצא בסטטוס נוכח",
    groups: [{ logicOperator: "and", conditions: [{ field: "employee.status", operator: "neq", value: "present" }] }],
    action_type: "block",
    action_message_he: "החייל לא בסטטוס נוכח — לא ניתן לשבץ",
    priority: 100,
  },
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

  // Form — now with condition groups for AND/OR nesting
  const [form, setForm] = useState({
    name_he: "", name_en: "", category: "general", severity: "soft", priority: 0,
    conditionGroups: [{ logicOperator: "and", conditions: [{ field: "", operator: "gt", value: "" }] }] as ConditionGroup[],
    action_type: "warn", action_message_he: "", action_message_en: "",
  });
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);

  // Test
  const [testContext, setTestContext] = useState("{}");
  const [testResult, setTestResult] = useState<any>(null);
  const [showTestPanel, setShowTestPanel] = useState(false);

  // Auto-save for rule editing
  const ruleAutoSaveFn = useCallback(async () => {
    if (!editingRule || !form.name_he) return;
    const conditionExpr = flattenGroupsToConditions(form.conditionGroups);
    const body = {
      name: { he: form.name_he, en: form.name_en || form.name_he },
      category: form.category,
      severity: form.severity,
      priority: form.priority,
      condition_expression: conditionExpr,
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
      { field: "employee.status", type: "select", label: { he: "סטטוס נוכחות", en: "Attendance status" }, description: { he: "הסטטוס הנוכחי של החייל (נוכח, בבית, חולה...)", en: "Current attendance status" }, options: [{value:"present",label:"נוכח"},{value:"home",label:"בבית"},{value:"sick",label:"חולה"},{value:"vacation",label:"חופשה"},{value:"training",label:"אימון"},{value:"reserve",label:"מילואים"}], example: "present" },
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
    const allConds = form.conditionGroups.flatMap(g => g.conditions);
    if (allConds.some(c => !c.field)) { toast("error", "יש לבחור שדה לכל תנאי"); return; }

    try {
      const conditionExpr = flattenGroupsToConditions(form.conditionGroups);
      const body = {
        name: { he: form.name_he, en: form.name_en || form.name_he },
        category: form.category,
        severity: form.severity,
        priority: form.priority,
        condition_expression: conditionExpr,
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
      const conditionExpr = flattenGroupsToConditions(form.conditionGroups);
      const res = await api.post(tenantApi("/rules/test"), {
        condition_expression: conditionExpr,
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
      conditionGroups: [{ logicOperator: "and", conditions: [{ field: "", operator: "gt", value: "" }] }],
      action_type: "warn", action_message_he: "", action_message_en: "",
    });
    setTestResult(null);
    setShowTestPanel(false);
    setShowTemplatePanel(false);
    setShowModal(true);
  };

  const openEdit = (rule: any) => {
    setEditingRule(rule);
    const groups = parseConditionExpression(rule.condition_expression);
    setForm({
      name_he: rule.name?.he || "", name_en: rule.name?.en || "",
      category: rule.category, severity: rule.severity, priority: rule.priority,
      conditionGroups: groups,
      action_type: rule.action_expression?.type || "warn",
      action_message_he: rule.action_expression?.message?.he || "",
      action_message_en: rule.action_expression?.message?.en || "",
    });
    setTestResult(null);
    setShowTestPanel(false);
    setShowTemplatePanel(false);
    setShowModal(true);
  };

  const applyTemplate = (tpl: RuleTemplate) => {
    setForm({
      name_he: tpl.name_he,
      name_en: tpl.name_en,
      category: tpl.category,
      severity: tpl.severity,
      priority: tpl.priority,
      conditionGroups: tpl.groups.map(g => ({ ...g, conditions: g.conditions.map(c => ({ ...c })) })),
      action_type: tpl.action_type,
      action_message_he: tpl.action_message_he,
      action_message_en: "",
    });
    setShowTemplatePanel(false);
    toast("success", `תבנית "${tpl.name_he}" הוחלה — ניתן לערוך לפני שמירה`);
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
            <CardContent className="p-12 text-center">
              <div className="h-20 w-20 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="h-10 w-10 text-primary-400" />
              </div>
              <p className="text-lg font-semibold text-foreground">אין חוקים עדיין</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                חוקים מגדירים מגבלות שיבוץ — מנוחה מינימלית, הוגנות, בטיחות ועוד.
                <br />הוסף חוקים כדי לוודא שיבוץ תקין.
              </p>
              <div className="flex flex-col items-center gap-2 mt-4">
                <Button size="sm" onClick={openCreate}>
                  <Plus className="me-1 h-4 w-4" />צור חוק ראשון
                </Button>
                <p className="text-xs text-muted-foreground">💡 דוגמאות: מנוחה מינימלית 8 שעות, מקסימום 6 משמרות בשבוע</p>
              </div>
            </CardContent>
          </Card>
        ) : rules.map(rule => (
          <Card key={rule.id} className="hover:shadow-md transition-all">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                  <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${
                    rule.severity === "hard" ? "bg-red-100 dark:bg-red-900/30" : "bg-yellow-100 dark:bg-yellow-900/30"
                  }`}>
                    {rule.severity === "hard"
                      ? <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
                      : <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
                    }
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base">{typeof rule.name === "object" ? (rule.name?.he || rule.name?.en || "") : String(rule.name || "")}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">
                      {buildConditionSummary(rule) || "ללא תנאים"}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <Badge className={`text-[10px] sm:text-xs ${rule.severity === "hard" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {rule.severity === "hard" ? "חמור" : "רך"}
                      </Badge>
                      <Badge className="text-[10px] sm:text-xs bg-muted text-muted-foreground">
                        {CATEGORY_OPTIONS.find(c => c.value === rule.category)?.label || rule.category}
                      </Badge>
                      <Badge className={`text-[10px] sm:text-xs ${rule.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {rule.is_active ? "פעיל" : "כבוי"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex gap-0.5 flex-shrink-0">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(rule)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => deleteRule(rule.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
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

            {/* === Rule Templates === */}
            {!editingRule && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowTemplatePanel(!showTemplatePanel)}
                  className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  {showTemplatePanel ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <BookOpen className="h-4 w-4" />
                  📋 תבניות מוכנות — בחר תבנית חוק נפוצה
                </button>
                {showTemplatePanel && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 animate-in slide-in-from-top-2">
                    {RULE_TEMPLATES.map((tpl) => {
                      const catOpt = CATEGORY_OPTIONS.find(c => c.value === tpl.category);
                      const CatIcon = catOpt?.icon || ShieldCheck;
                      return (
                        <button
                          key={tpl.id}
                          onClick={() => applyTemplate(tpl)}
                          className="text-right rounded-xl border p-3 hover:border-primary-300 hover:shadow-sm transition-all bg-card"
                        >
                          <div className="flex items-start gap-2">
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              tpl.severity === "hard" ? "bg-red-100 dark:bg-red-900/30" : "bg-yellow-100 dark:bg-yellow-900/30"
                            }`}>
                              <CatIcon className={`h-4 w-4 ${catOpt?.color || "text-gray-500"}`} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm">{tpl.name_he}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{tpl.description_he}</p>
                              <div className="flex gap-1 mt-1.5">
                                <Badge className={tpl.severity === "hard" ? "bg-red-100 text-red-700 text-[10px]" : "bg-yellow-100 text-yellow-700 text-[10px]"}>
                                  {tpl.severity === "hard" ? "חמור" : "רך"}
                                </Badge>
                                <Badge className="bg-muted text-muted-foreground text-[10px]">
                                  {catOpt?.label || tpl.category}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

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

            {/* === Section 3: Conditions (THE CORE) with AND/OR Groups === */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                  🔍 תנאים — מתי החוק חל?
                  <HelpTooltip
                    title={{ he: "מהו תנאי?", en: "What is a condition?" }}
                    content={{ he: "תנאי בודק נתון מסוים לפני כל שיבוץ.\nניתן ליצור קבוצות תנאים עם חיבור וגם (AND) או או (OR).\n\nדוגמה: (שעות מנוחה < 8) וגם (משמרת לילה = כן)", en: "Conditions check values before assignment. Group with AND/OR." }}
                    examples={[
                      { he: "שעות מנוחה < 16 → חסום שיבוץ", en: "Rest hours < 16 → block" },
                      { he: "(לילה = כן) או (שעות > 12) → אזהרה", en: "(night = yes) or (hours > 12) → warn" },
                    ]}
                  />
                </h3>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[36px] text-xs"
                    onClick={() => {
                      const groups = [...form.conditionGroups];
                      groups.push({ logicOperator: "or", conditions: [{ field: "", operator: "gt", value: "" }] });
                      setForm({ ...form, conditionGroups: groups });
                    }}
                    title="הוסף קבוצת OR — לפחות אחת מהקבוצות צריכה להתקיים"
                  >
                    <Plus className="h-3 w-3 me-1" />קבוצת OR
                  </Button>
                </div>
              </div>

              {form.conditionGroups.map((group, gIdx) => (
                <div key={gIdx} className="space-y-2">
                  {gIdx > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="flex-1 border-t border-orange-300" />
                      <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full font-bold text-xs">
                        וגם (AND) בין הקבוצות
                      </span>
                      <div className="flex-1 border-t border-orange-300" />
                    </div>
                  )}

                  <div className={`rounded-xl border-2 p-3 space-y-2 ${
                    group.logicOperator === "or"
                      ? "border-primary-200 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-900/10"
                      : "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10"
                  }`}>
                    {/* Group header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                            group.logicOperator === "and"
                              ? "bg-green-500 text-white"
                              : "bg-muted text-muted-foreground hover:bg-green-100"
                          }`}
                          onClick={() => {
                            const groups = [...form.conditionGroups];
                            groups[gIdx] = { ...groups[gIdx], logicOperator: "and" };
                            setForm({ ...form, conditionGroups: groups });
                          }}
                        >
                          AND (וגם)
                        </button>
                        <button
                          className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                            group.logicOperator === "or"
                              ? "bg-primary-500 text-white"
                              : "bg-muted text-muted-foreground hover:bg-primary-100"
                          }`}
                          onClick={() => {
                            const groups = [...form.conditionGroups];
                            groups[gIdx] = { ...groups[gIdx], logicOperator: "or" };
                            setForm({ ...form, conditionGroups: groups });
                          }}
                        >
                          OR (או)
                        </button>
                        <span className="text-[10px] text-muted-foreground">
                          {group.logicOperator === "and" ? "כל התנאים צריכים להתקיים" : "לפחות תנאי אחד צריך להתקיים"}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => {
                            const groups = [...form.conditionGroups];
                            groups[gIdx] = {
                              ...groups[gIdx],
                              conditions: [...groups[gIdx].conditions, { field: "", operator: "gt", value: "" }],
                            };
                            setForm({ ...form, conditionGroups: groups });
                          }}
                        >
                          <Plus className="h-3 w-3 me-1" />תנאי
                        </Button>
                        {form.conditionGroups.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-red-500"
                            onClick={() => {
                              setForm({
                                ...form,
                                conditionGroups: form.conditionGroups.filter((_, gi) => gi !== gIdx),
                              });
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Conditions in this group */}
                    {group.conditions.map((cond, cIdx) => {
                      const fieldInfo = getFieldInfo(cond.field);
                      const availableOps = getOperatorsForField(cond.field);

                      const updateCond = (updates: Partial<ConditionItem>) => {
                        const groups = [...form.conditionGroups];
                        const conds = [...groups[gIdx].conditions];
                        conds[cIdx] = { ...conds[cIdx], ...updates };
                        groups[gIdx] = { ...groups[gIdx], conditions: conds };
                        setForm({ ...form, conditionGroups: groups });
                      };

                      return (
                        <div key={cIdx} className="rounded-lg border bg-card p-3 space-y-2">
                          {cIdx > 0 && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                              <div className="flex-1 border-t" />
                              <span className={`px-2 py-0.5 rounded-full font-medium ${
                                group.logicOperator === "and" ? "bg-green-100 text-green-700" : "bg-primary-100 text-primary-700"
                              }`}>
                                {group.logicOperator === "and" ? "וגם (AND)" : "או (OR)"}
                              </span>
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
                                  const newField = e.target.value;
                                  const newFieldInfo = conditionFields.find(f => f.field === newField);
                                  const updates: Partial<ConditionItem> = { field: newField };
                                  if (newFieldInfo?.type === "bool") {
                                    updates.operator = "is_true";
                                    updates.value = "true";
                                  }
                                  updateCond(updates);
                                }}
                                className="min-h-[44px]"
                              >
                                <option value="">בחר שדה...</option>
                                <optgroup label="👤 עובד">
                                  {conditionFields.filter(f => f.field.startsWith("employee.")).map(f => (
                                    <option key={f.field} value={f.field}>
                                      {f.label?.[lang] || f.label?.he} ({TYPE_LABELS[f.type] || f.type})
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="📋 משימה">
                                  {conditionFields.filter(f => f.field.startsWith("mission.")).map(f => (
                                    <option key={f.field} value={f.field}>
                                      {f.label?.[lang] || f.label?.he} ({TYPE_LABELS[f.type] || f.type})
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="🔗 שיבוץ">
                                  {conditionFields.filter(f => f.field.startsWith("assignment.")).map(f => (
                                    <option key={f.field} value={f.field}>
                                      {f.label?.[lang] || f.label?.he} ({TYPE_LABELS[f.type] || f.type})
                                    </option>
                                  ))}
                                </optgroup>
                              </Select>
                            </div>

                            {/* Operator */}
                            <div className="space-y-1">
                              <Label className="text-xs">איך?</Label>
                              <Select
                                value={cond.operator}
                                onChange={e => updateCond({ operator: e.target.value })}
                                className="min-h-[44px] min-w-[140px]"
                              >
                                {availableOps.map(op => (
                                  <option key={op.value} value={op.value}>
                                    {op.symbol} {lang === "he" ? op.label_he : op.label_en}
                                  </option>
                                ))}
                              </Select>
                            </div>

                            {/* Value — adaptive input based on operator & field type */}
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
                                        onChange={e => updateCond({ value: `${e.target.value},${parts[1] || ""}` })}
                                        placeholder="מינימום"
                                        className="min-h-[44px]"
                                      />
                                      <span className="text-muted-foreground text-xs">—</span>
                                      <Input
                                        type="number"
                                        value={parts[1] || ""}
                                        onChange={e => updateCond({ value: `${parts[0] || ""},${e.target.value}` })}
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
                                    {fieldInfo?.type === "select" && fieldInfo.options ? (
                                      <div className="flex flex-wrap gap-1.5 rounded-lg border p-2 min-h-[44px]">
                                        {fieldInfo.options.map((opt: any) => {
                                          const optValue = typeof opt === "object" ? opt.value : opt;
                                          const optLabel = typeof opt === "object" ? opt.label : opt;
                                          const selected = tags.includes(optValue);
                                          return (
                                            <button key={optValue} type="button" onClick={() => {
                                              const newTags = selected ? tags.filter((t: string) => t !== optValue) : [...tags, optValue];
                                              updateCond({ value: newTags.join(",") });
                                            }} className={`text-xs px-2 py-1 rounded-lg border transition-colors ${selected ? "bg-primary-500 text-white border-primary-500" : "bg-muted hover:bg-accent"}`}>
                                              {optLabel}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <Input
                                        value={cond.value}
                                        onChange={e => updateCond({ value: e.target.value })}
                                        placeholder="ערך1,ערך2,ערך3"
                                        className="min-h-[44px]"
                                      />
                                    )}
                                  </div>
                                );
                              }

                              // Adaptive single value: date picker for date fields, number for numbers, select for selects
                              const isDateField = cond.field?.includes("date") || cond.field?.includes("day_of_week");
                              return (
                                <div className="space-y-1">
                                  <Label className="text-xs">ערך</Label>
                                  {fieldInfo?.type === "select" && fieldInfo.options ? (
                                    <Select
                                      value={cond.value}
                                      onChange={e => updateCond({ value: e.target.value })}
                                      className="min-h-[44px]"
                                    >
                                      <option value="">בחר...</option>
                                      {fieldInfo.options.map((opt: any) => {
                                        const v = typeof opt === "object" ? opt.value : opt;
                                        const l = typeof opt === "object" ? opt.label : opt;
                                        return <option key={v} value={v}>{l}</option>;
                                      })}
                                    </Select>
                                  ) : isDateField ? (
                                    <Input
                                      type="date"
                                      value={cond.value}
                                      onChange={e => updateCond({ value: e.target.value })}
                                      className="min-h-[44px]"
                                    />
                                  ) : (
                                    <Input
                                      value={cond.value}
                                      onChange={e => updateCond({ value: e.target.value })}
                                      placeholder={fieldInfo?.example ? `דוגמה: ${fieldInfo.example}` : "הזן ערך..."}
                                      className="min-h-[44px]"
                                      type={fieldInfo?.type === "number" ? "number" : "text"}
                                    />
                                  )}
                                </div>
                              );
                            })()}

                            {/* Delete condition */}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="min-h-[44px] min-w-[44px]"
                              onClick={() => {
                                const groups = [...form.conditionGroups];
                                if (groups[gIdx].conditions.length <= 1 && form.conditionGroups.length <= 1) return;
                                if (groups[gIdx].conditions.length <= 1) {
                                  // Remove entire group
                                  setForm({ ...form, conditionGroups: groups.filter((_, gi) => gi !== gIdx) });
                                } else {
                                  groups[gIdx] = {
                                    ...groups[gIdx],
                                    conditions: groups[gIdx].conditions.filter((_, ci) => ci !== cIdx),
                                  };
                                  setForm({ ...form, conditionGroups: groups });
                                }
                              }}
                              disabled={group.conditions.length <= 1 && form.conditionGroups.length <= 1}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>

                          {/* Live preview */}
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
                </div>
              ))}
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
