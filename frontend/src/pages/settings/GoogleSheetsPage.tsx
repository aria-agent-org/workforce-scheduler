import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  Sheet, RefreshCw, Link2, ArrowLeftRight, CheckCircle2,
  AlertCircle, Clock, Trash2, Plus, Save,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import HelpTooltip from "@/components/common/HelpTooltip";

interface SheetsConfig {
  spreadsheet_id: string;
  sheet_name: string;
  sync_direction: "bidirectional" | "inbound" | "outbound";
  column_mapping: Array<{ sheet_column: string; system_field: string }>;
  status_mapping: Array<{ hebrew_text: string; status_code: string }>;
  last_sync_at: string | null;
  last_sync_status: "success" | "error" | "never" | null;
  last_sync_error: string | null;
}

const SYSTEM_FIELDS = [
  { key: "employee_number", label_he: "מספר אישי", label_en: "Employee Number" },
  { key: "full_name", label_he: "שם מלא", label_en: "Full Name" },
  { key: "status_code", label_he: "סטטוס", label_en: "Status" },
  { key: "date", label_he: "תאריך", label_en: "Date" },
  { key: "notes", label_he: "הערות", label_en: "Notes" },
];

export default function GoogleSheetsPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [config, setConfig] = useState<SheetsConfig>({
    spreadsheet_id: "",
    sheet_name: "Sheet1",
    sync_direction: "bidirectional",
    column_mapping: [
      { sheet_column: "A", system_field: "employee_number" },
      { sheet_column: "B", system_field: "full_name" },
      { sheet_column: "C", system_field: "status_code" },
    ],
    status_mapping: [
      { hebrew_text: "נוכח", status_code: "present" },
      { hebrew_text: "בית", status_code: "home" },
      { hebrew_text: "חולה", status_code: "sick" },
      { hebrew_text: "חופשה", status_code: "vacation" },
      { hebrew_text: "מילואים", status_code: "reserve" },
      { hebrew_text: "הדרכה", status_code: "training" },
    ],
    last_sync_at: null,
    last_sync_status: "never",
    last_sync_error: null,
  });

  const [statusDefs, setStatusDefs] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, statusRes, confRes] = await Promise.all([
        api.get(tenantApi("/settings")).catch(() => ({ data: [] })),
        api.get(tenantApi("/attendance/statuses")).catch(() => ({ data: [] })),
        api.get(tenantApi("/attendance/conflicts")).catch(() => ({ data: [] })),
      ]);

      setStatusDefs(statusRes.data || []);
      setConflicts(confRes.data || []);

      // Load saved config from settings
      const settings = settingsRes.data || [];
      const sheetsSettings = settings.filter((s: any) => s.group === "google_sheets" || s.key?.startsWith("google_sheets_"));
      if (sheetsSettings.length > 0) {
        const merged: any = {};
        for (const s of sheetsSettings) {
          merged[s.key.replace("google_sheets_", "")] = s.value;
        }
        setConfig(prev => ({
          ...prev,
          spreadsheet_id: merged.spreadsheet_id || prev.spreadsheet_id,
          sheet_name: merged.sheet_name || prev.sheet_name,
          sync_direction: merged.sync_direction || prev.sync_direction,
          column_mapping: merged.column_mapping || prev.column_mapping,
          status_mapping: merged.status_mapping || prev.status_mapping,
          last_sync_at: merged.last_sync_at || null,
          last_sync_status: merged.last_sync_status || "never",
          last_sync_error: merged.last_sync_error || null,
        }));
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const pairs = [
        { key: "google_sheets_spreadsheet_id", value: config.spreadsheet_id, group: "google_sheets" },
        { key: "google_sheets_sheet_name", value: config.sheet_name, group: "google_sheets" },
        { key: "google_sheets_sync_direction", value: config.sync_direction, group: "google_sheets" },
        { key: "google_sheets_column_mapping", value: config.column_mapping, group: "google_sheets" },
        { key: "google_sheets_status_mapping", value: config.status_mapping, group: "google_sheets" },
      ];
      for (const pair of pairs) {
        await api.post(tenantApi("/settings"), pair).catch(() =>
          api.patch(tenantApi(`/settings/${pair.key}`), pair).catch(() => {})
        );
      }
      toast("success", "הגדרות Google Sheets נשמרו");
    } catch (e) {
      toast("error", "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await api.post(tenantApi("/attendance/sync"), {
        spreadsheet_id: config.spreadsheet_id,
        sheet_name: config.sheet_name,
        direction: config.sync_direction,
      });
      toast("success", "סנכרון הושלם");
      load();
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בסנכרון"));
    } finally {
      setSyncing(false);
    }
  };

  const addColumnMapping = () => {
    setConfig(prev => ({
      ...prev,
      column_mapping: [...prev.column_mapping, { sheet_column: "", system_field: "" }],
    }));
  };

  const removeColumnMapping = (idx: number) => {
    setConfig(prev => ({
      ...prev,
      column_mapping: prev.column_mapping.filter((_, i) => i !== idx),
    }));
  };

  const updateColumnMapping = (idx: number, field: string, value: string) => {
    setConfig(prev => {
      const updated = [...prev.column_mapping];
      (updated[idx] as any)[field] = value;
      return { ...prev, column_mapping: updated };
    });
  };

  const addStatusMapping = () => {
    setConfig(prev => ({
      ...prev,
      status_mapping: [...prev.status_mapping, { hebrew_text: "", status_code: "" }],
    }));
  };

  const removeStatusMapping = (idx: number) => {
    setConfig(prev => ({
      ...prev,
      status_mapping: prev.status_mapping.filter((_, i) => i !== idx),
    }));
  };

  const updateStatusMapping = (idx: number, field: string, value: string) => {
    setConfig(prev => {
      const updated = [...prev.status_mapping];
      (updated[idx] as any)[field] = value;
      return { ...prev, status_mapping: updated };
    });
  };

  const resolveConflict = async (conflictId: string, winner: "system" | "sheets") => {
    try {
      await api.post(tenantApi(`/attendance/conflicts/${conflictId}/resolve`), { winner });
      toast("success", "קונפליקט נפתר");
      load();
    } catch (e) {
      toast("error", "שגיאה");
    }
  };

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-40 bg-muted rounded-lg" /><div className="h-40 bg-muted rounded-lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Sheet className="h-6 w-6 text-green-600" />
            Google Sheets Integration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "he" ? "חבר גיליון אלקטרוני לסנכרון נוכחות" : "Connect a spreadsheet for attendance sync"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={saveConfig} disabled={saving}>
            <Save className="me-1 h-4 w-4" />{saving ? "שומר..." : "שמור"}
          </Button>
          <Button onClick={triggerSync} disabled={syncing || !config.spreadsheet_id}>
            <RefreshCw className={`me-1 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "מסנכרן..." : "סנכרן עכשיו"}
          </Button>
        </div>
      </div>

      {/* Sync Status */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          {config.last_sync_status === "success" && (
            <><CheckCircle2 className="h-5 w-5 text-green-500" /><span className="text-green-700">סנכרון אחרון הצליח — {config.last_sync_at}</span></>
          )}
          {config.last_sync_status === "error" && (
            <><AlertCircle className="h-5 w-5 text-red-500" /><span className="text-red-700">שגיאה בסנכרון: {config.last_sync_error}</span></>
          )}
          {config.last_sync_status === "never" && (
            <><Clock className="h-5 w-5 text-muted-foreground" /><span className="text-muted-foreground">לא בוצע סנכרון עדיין</span></>
          )}
        </CardContent>
      </Card>

      {/* Connection Settings */}
      <Card>
        <CardHeader><CardTitle className="text-lg">חיבור גיליון</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Spreadsheet ID
                <HelpTooltip content={{ he: "מצא את ה-ID בכתובת URL של הגיליון: docs.google.com/spreadsheets/d/{ID}/edit", en: "Find the ID in the spreadsheet URL" }} />
              </Label>
              <Input
                value={config.spreadsheet_id}
                onChange={e => setConfig(prev => ({ ...prev, spreadsheet_id: e.target.value }))}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>שם גיליון</Label>
              <Input
                value={config.sheet_name}
                onChange={e => setConfig(prev => ({ ...prev, sheet_name: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              כיוון סנכרון
              <HelpTooltip content={{ he: "דו-כיווני: עדכונים בשני הכיוונים. נכנס: רק מגיליון למערכת. יוצא: רק ממערכת לגיליון.", en: "Bidirectional, Inbound (sheet→system), or Outbound (system→sheet)" }} />
            </Label>
            <Select
              value={config.sync_direction}
              onChange={e => setConfig(prev => ({ ...prev, sync_direction: e.target.value as any }))}
              className="w-48"
            >
              <option value="bidirectional">↔ דו-כיווני</option>
              <option value="inbound">← נכנס (גיליון → מערכת)</option>
              <option value="outbound">→ יוצא (מערכת → גיליון)</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Column Mapping */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">מיפוי עמודות</CardTitle>
            <Button size="sm" variant="outline" onClick={addColumnMapping}>
              <Plus className="me-1 h-4 w-4" />הוסף
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.column_mapping.map((mapping, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="space-y-1 flex-1">
                <Label className="text-xs">עמודה בגיליון</Label>
                <Input
                  value={mapping.sheet_column}
                  onChange={e => updateColumnMapping(i, "sheet_column", e.target.value)}
                  placeholder="A"
                  dir="ltr"
                  className="text-center"
                />
              </div>
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground mt-6" />
              <div className="space-y-1 flex-1">
                <Label className="text-xs">שדה במערכת</Label>
                <Select
                  value={mapping.system_field}
                  onChange={e => updateColumnMapping(i, "system_field", e.target.value)}
                >
                  <option value="">בחר...</option>
                  {SYSTEM_FIELDS.map(f => (
                    <option key={f.key} value={f.key}>{lang === "he" ? f.label_he : f.label_en}</option>
                  ))}
                </Select>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeColumnMapping(i)} className="mt-6">
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Status Mapping */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">מיפוי סטטוסים (טקסט עברי → קוד)</CardTitle>
            <Button size="sm" variant="outline" onClick={addStatusMapping}>
              <Plus className="me-1 h-4 w-4" />הוסף
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {config.status_mapping.map((mapping, i) => (
            <div key={i} className="flex items-center gap-3">
              <Input
                value={mapping.hebrew_text}
                onChange={e => updateStatusMapping(i, "hebrew_text", e.target.value)}
                placeholder="נוכח"
                className="flex-1"
              />
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Select
                value={mapping.status_code}
                onChange={e => updateStatusMapping(i, "status_code", e.target.value)}
                className="flex-1"
              >
                <option value="">בחר...</option>
                {statusDefs.map((s: any) => (
                  <option key={s.code} value={s.code}>{s.icon} {s.name[lang] || s.code}</option>
                ))}
              </Select>
              <Button variant="ghost" size="sm" onClick={() => removeStatusMapping(i)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Conflict Resolution */}
      {conflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-red-600">⚠ קונפליקטים ({conflicts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-start">עובד</th>
                  <th className="px-3 py-2 text-start">תאריך</th>
                  <th className="px-3 py-2 text-center">מערכת</th>
                  <th className="px-3 py-2 text-center">גיליון</th>
                  <th className="px-3 py-2 text-center">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((c: any) => (
                  <tr key={c.id} className="border-b">
                    <td className="px-3 py-2">{c.employee_name}</td>
                    <td className="px-3 py-2 font-mono">{c.date}</td>
                    <td className="px-3 py-2 text-center"><Badge>{c.system_value}</Badge></td>
                    <td className="px-3 py-2 text-center"><Badge variant="outline">{c.sheets_value}</Badge></td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="outline" onClick={() => resolveConflict(c.id, "system")}>
                          השתמש במערכת
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => resolveConflict(c.id, "sheets")}>
                          השתמש בגיליון
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
