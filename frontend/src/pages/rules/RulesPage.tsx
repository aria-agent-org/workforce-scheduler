import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, ShieldCheck, Pencil, Trash2, Play, AlertTriangle } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

export default function RulesPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [rules, setRules] = useState<any[]>([]);
  const [conditionFields, setConditionFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showTestPanel, setShowTestPanel] = useState(false);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, fieldsRes] = await Promise.all([
        api.get(tenantApi("/rules")),
        api.get(tenantApi("/rules/condition-fields")),
      ]);
      setRules(rulesRes.data);
      setConditionFields(fieldsRes.data);
    } catch (e) {
      toast("error", "שגיאה בטעינת חוקים");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveRule = async () => {
    try {
      const conditions = form.conditions.map(c => ({
        field: c.field,
        operator: c.operator,
        value: isNaN(Number(c.value)) ? c.value : Number(c.value),
      }));
      const body = {
        name: { he: form.name_he, en: form.name_en },
        category: form.category,
        severity: form.severity,
        priority: form.priority,
        condition_expression: { operator: "and", conditions },
        action_expression: {
          type: form.action_type,
          message: { he: form.action_message_he, en: form.action_message_en },
        },
      };

      if (editingRule) {
        await api.patch(tenantApi(`/rules/${editingRule.id}`), body);
        toast("success", "חוק עודכן");
      } else {
        await api.post(tenantApi("/rules"), body);
        toast("success", "חוק נוצר בהצלחה");
      }
      setShowModal(false);
      setEditingRule(null);
      load();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const deleteRule = async (id: string) => {
    try {
      await api.delete(tenantApi(`/rules/${id}`));
      toast("success", "חוק הושבת");
      load();
    } catch (e) {
      toast("error", "שגיאה");
    }
  };

  const testRule = async () => {
    try {
      const conditions = form.conditions.map(c => ({
        field: c.field,
        operator: c.operator,
        value: isNaN(Number(c.value)) ? c.value : Number(c.value),
      }));
      const res = await api.post(tenantApi("/rules/test"), {
        condition_expression: { operator: "and", conditions },
        test_context: JSON.parse(testContext),
      });
      setTestResult(res.data);
    } catch (e: any) {
      toast("error", "שגיאה בבדיקה");
    }
  };

  const openCreate = () => {
    setEditingRule(null);
    setForm({
      name_he: "", name_en: "", category: "general", severity: "soft", priority: 0,
      conditions: [{ field: "", operator: "gt", value: "" }],
      action_type: "warn", action_message_he: "", action_message_en: "",
    });
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
    setShowModal(true);
  };

  if (loading) return <TableSkeleton rows={5} cols={4} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("nav.rules")}</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="me-1 h-4 w-4" />חוק חדש
        </Button>
      </div>

      <div className="space-y-3">
        {rules.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">אין חוקים. צור חוק ראשון!</CardContent></Card>
        ) : rules.map(rule => (
          <Card key={rule.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldCheck className={`h-5 w-5 ${rule.severity === "hard" ? "text-red-500" : "text-yellow-500"}`} />
                  <div>
                    <h3 className="font-medium">{rule.name?.[lang] || rule.name?.he}</h3>
                    <p className="text-xs text-muted-foreground">
                      קטגוריה: {rule.category} · עדיפות: {rule.priority}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={rule.severity === "hard" ? "destructive" : "warning"}>
                    {rule.severity === "hard" ? "חמור" : "רך"}
                  </Badge>
                  <Badge variant={rule.is_active ? "success" : "default"}>
                    {rule.is_active ? "פעיל" : "מושבת"}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(rule)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteRule(rule.id)}>
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
        <DialogContent className="max-w-[700px]">
          <DialogHeader><DialogTitle>{editingRule ? "עריכת חוק" : "חוק חדש"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>שם (עברית)</Label><Input value={form.name_he} onChange={e => setForm({...form, name_he: e.target.value})} /></div>
              <div className="space-y-2"><Label>שם (אנגלית)</Label><Input value={form.name_en} onChange={e => setForm({...form, name_en: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>קטגוריה</Label>
                <Select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                  <option value="general">כללי</option>
                  <option value="rest">מנוחה</option>
                  <option value="fairness">הוגנות</option>
                  <option value="safety">בטיחות</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>חומרה</Label>
                <Select value={form.severity} onChange={e => setForm({...form, severity: e.target.value})}>
                  <option value="soft">רך (אזהרה)</option>
                  <option value="hard">חמור (חסימה)</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>עדיפות</Label>
                <Input type="number" value={form.priority} onChange={e => setForm({...form, priority: Number(e.target.value)})} />
              </div>
            </div>

            {/* Condition Builder */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">תנאים</Label>
                <Button size="sm" variant="outline" onClick={() => setForm({...form, conditions: [...form.conditions, { field: "", operator: "gt", value: "" }]})}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {form.conditions.map((cond, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 items-end">
                  <div>
                    <Label className="text-xs">שדה</Label>
                    <Select value={cond.field} onChange={e => {
                      const c = [...form.conditions]; c[i].field = e.target.value; setForm({...form, conditions: c});
                    }}>
                      <option value="">בחר שדה</option>
                      {conditionFields.map(f => <option key={f.field} value={f.field}>{f.label[lang] || f.label.he}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">אופרטור</Label>
                    <Select value={cond.operator} onChange={e => {
                      const c = [...form.conditions]; c[i].operator = e.target.value; setForm({...form, conditions: c});
                    }}>
                      <option value="gt">גדול מ</option>
                      <option value="gte">גדול או שווה</option>
                      <option value="lt">קטן מ</option>
                      <option value="lte">קטן או שווה</option>
                      <option value="eq">שווה ל</option>
                      <option value="neq">שונה מ</option>
                      <option value="is_true">אמת</option>
                      <option value="is_false">שקר</option>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">ערך</Label>
                    <Input value={cond.value} onChange={e => {
                      const c = [...form.conditions]; c[i].value = e.target.value; setForm({...form, conditions: c});
                    }} />
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setForm({...form, conditions: form.conditions.filter((_, j) => j !== i)})}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Action */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">פעולה</Label>
              <Select value={form.action_type} onChange={e => setForm({...form, action_type: e.target.value})}>
                <option value="warn">אזהרה</option>
                <option value="block">חסימה</option>
                <option value="score">ניקוד</option>
              </Select>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="text-xs">הודעה (עברית)</Label><Input value={form.action_message_he} onChange={e => setForm({...form, action_message_he: e.target.value})} /></div>
                <div className="space-y-2"><Label className="text-xs">הודעה (אנגלית)</Label><Input value={form.action_message_en} onChange={e => setForm({...form, action_message_en: e.target.value})} /></div>
              </div>
            </div>

            {/* Test Panel */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">בדיקת חוק</Label>
                <Button size="sm" variant="outline" onClick={testRule}>
                  <Play className="me-1 h-3 w-3" />בדוק
                </Button>
              </div>
              <textarea
                value={testContext}
                onChange={e => setTestContext(e.target.value)}
                className="w-full h-20 rounded border px-3 py-2 text-sm font-mono"
                placeholder='{"employee": {"hours_since_last_mission": 5}, "mission": {"is_night": true}}'
              />
              {testResult && (
                <div className={`rounded p-3 text-sm ${testResult.result ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {testResult.result ? "✅ תנאי מתקיים" : "❌ תנאי לא מתקיים"} — {testResult.explanation}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>ביטול</Button>
            <Button onClick={saveRule}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
