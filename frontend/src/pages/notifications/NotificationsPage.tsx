import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Bell, Plus, Pencil, Mail, MessageSquare, Send, Megaphone, Check, Eye } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import { getPushPermission, subscribeToPush, unsubscribeFromPush, isPushSubscribed, sendTestPush, getLastPushError, getPushDebugLog, clearPushDebugLog, getPushStatus, type PushStatus } from "@/lib/push";

type Tab = "templates" | "logs" | "channels";

const CHANNEL_LABELS: Record<string, string> = {
  push: "🔔 Push",
  in_app: "📱 אפליקציה",
  whatsapp: "💬 WhatsApp",
  email: "📧 Email",
  sms: "💬 SMS",
  telegram: "✈️ Telegram",
};

const STATUS_LABELS_HE: Record<string, string> = {
  sent: "נשלח",
  failed: "נכשל",
  pending: "ממתין",
  queued: "בתור",
};

function LogsPanel({ logs }: { logs: any[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");

  const allLogs = Array.isArray(logs) ? logs : [];

  const filtered = allLogs.filter(log => {
    if (filterChannel && log.channel !== filterChannel) return false;
    if (filterStatus && log.status !== filterStatus) return false;
    if (filterType && log.event_type_code !== filterType) return false;
    if (search && !(
      (log.employee_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (log.event_type_code || "").toLowerCase().includes(search.toLowerCase()) ||
      (log.body_sent || "").toLowerCase().includes(search.toLowerCase())
    )) return false;
    return true;
  });

  const uniqueChannels = [...new Set(allLogs.map(l => l.channel).filter(Boolean))];
  const uniqueStatuses = [...new Set(allLogs.map(l => l.status).filter(Boolean))];
  const uniqueTypes = [...new Set(allLogs.map(l => l.event_type_code).filter(Boolean))];

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="חפש נמען, אירוע, תוכן..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px] bg-background"
        />
        <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)} className="border rounded-lg px-2 py-2 text-sm bg-background min-h-[40px]">
          <option value="">כל הערוצים</option>
          {uniqueChannels.map(ch => <option key={ch} value={ch}>{CHANNEL_LABELS[ch] || ch}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-2 py-2 text-sm bg-background min-h-[40px]">
          <option value="">כל הסטטוסים</option>
          {uniqueStatuses.map(s => <option key={s} value={s}>{STATUS_LABELS_HE[s] || s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-lg px-2 py-2 text-sm bg-background min-h-[40px]">
          <option value="">כל האירועים</option>
          {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(filterChannel || filterStatus || filterType || search) && (
          <button onClick={() => { setFilterChannel(""); setFilterStatus(""); setFilterType(""); setSearch(""); }} className="text-xs text-muted-foreground hover:text-foreground px-2">
            ✕ נקה
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} מתוך {allLogs.length} רשומות</p>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50 text-sm">
                <th className="px-4 py-3 text-start font-medium">נמען</th>
                <th className="px-4 py-3 text-start font-medium">ערוץ</th>
                <th className="px-4 py-3 text-start font-medium">סוג</th>
                <th className="px-4 py-3 text-start font-medium">תצוגה מקדימה</th>
                <th className="px-4 py-3 text-start font-medium">סטטוס</th>
                <th className="px-4 py-3 text-start font-medium">זמן</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">אין רשומות</td></tr>
              ) : filtered.map((log: any) => (
                <>
                  <tr
                    key={log.id}
                    className={`border-b cursor-pointer hover:bg-muted/30 transition-colors ${expandedId === log.id ? "bg-muted/20" : ""}`}
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <td className="px-4 py-3 text-sm font-medium">{log.employee_name || log.recipient || "—"}</td>
                    <td className="px-4 py-3 text-sm">{CHANNEL_LABELS[log.channel] || log.channel}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{log.event_type_code}</td>
                    <td className="px-4 py-3 text-sm max-w-[200px] truncate text-muted-foreground" title={log.body_sent}>{log.body_sent || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={log.status === "sent" ? "success" : log.status === "failed" ? "destructive" : "default"}>
                        {STATUS_LABELS_HE[log.status] || log.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.sent_at ? new Date(log.sent_at).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "—"}
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr key={log.id + "-expanded"} className="bg-muted/10">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="space-y-2 text-sm">
                          {log.employee_name && <div><span className="font-medium">נמען:</span> {log.employee_name}</div>}
                          {log.event_type_code && <div><span className="font-medium">סוג אירוע:</span> {log.event_type_code}</div>}
                          {log.channel && <div><span className="font-medium">ערוץ:</span> {CHANNEL_LABELS[log.channel] || log.channel}</div>}
                          {log.body_sent && (
                            <div>
                              <span className="font-medium">הודעה:</span>
                              <p className="mt-1 bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap">{log.body_sent}</p>
                            </div>
                          )}
                          {log.error_message && (
                            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 px-3 py-2 text-red-700 dark:text-red-300">
                              <span className="font-medium">שגיאה:</span> {log.error_message}
                            </div>
                          )}
                          {log.sent_at && <div className="text-muted-foreground"><span className="font-medium">זמן:</span> {new Date(log.sent_at).toLocaleString("he-IL")}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">אין רשומות</div>
        ) : filtered.map((log: any) => (
          <div key={log.id} className="rounded-xl border overflow-hidden">
            <button
              className="w-full p-3 text-start hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{log.employee_name || log.recipient || "אנונימי"}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{log.body_sent || log.event_type_code || ""}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge variant={log.status === "sent" ? "success" : log.status === "failed" ? "destructive" : "default"} className="text-[10px]">
                    {STATUS_LABELS_HE[log.status] || log.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{CHANNEL_LABELS[log.channel] || log.channel}</span>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {log.sent_at ? new Date(log.sent_at).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : ""}
              </div>
            </button>
            {expandedId === log.id && (
              <div className="border-t bg-muted/10 p-3 space-y-2 text-sm">
                {log.event_type_code && <div><span className="font-medium text-xs text-muted-foreground">סוג:</span> <span className="text-xs">{log.event_type_code}</span></div>}
                {log.body_sent && (
                  <div>
                    <p className="font-medium text-xs text-muted-foreground mb-1">הודעה:</p>
                    <p className="text-xs bg-background rounded-lg p-2 border whitespace-pre-wrap">{log.body_sent}</p>
                  </div>
                )}
                {log.error_message && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 px-2 py-1.5 text-red-700 dark:text-red-300 text-xs">
                    שגיאה: {log.error_message}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [activeTab, setActiveTab] = useState<Tab>("templates");
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [eventTypes, setEventTypes] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [form, setForm] = useState({
    name: "", event_type_code: "", is_active: true,
    body_he: "", body_en: "",
    channel_push: true, channel_in_app: true, channel_whatsapp: false, channel_email: false,
  });

  const bodyHeRef = useRef<HTMLTextAreaElement>(null);

  // Push notification state
  const [pushPermission, setPushPermission] = useState<string>("default");
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus>("prompt");
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const refreshPushState = () => {
    setPushPermission(getPushPermission());
    isPushSubscribed().then(setPushSubscribed);
    getPushStatus().then(setPushStatus);
    setDebugLog(getPushDebugLog());
  };

  useEffect(() => {
    refreshPushState();
  }, []);

  const handleEnablePush = async () => {
    setPushLoading(true);
    try {
      const ok = await subscribeToPush();
      refreshPushState();
      if (ok) {
        toast("success", "התראות Push הופעלו בהצלחה! 🎉");
        setPushSubscribed(true);
        setPushPermission("granted");
      } else {
        const specificError = getLastPushError();
        toast("error", specificError || "לא ניתן להפעיל התראות — בדוק יומן Debug למטה");
        setShowDebug(true);
      }
    } catch (err: any) {
      refreshPushState();
      const specificError = getLastPushError();
      toast("error", specificError || `שגיאה בהפעלת התראות: ${err.message}`);
      setShowDebug(true);
    } finally {
      setPushLoading(false);
    }
  };

  const handleDisablePush = async () => {
    setPushLoading(true);
    try {
      await unsubscribeFromPush();
      setPushSubscribed(false);
      toast("success", "התראות Push כובו");
    } catch {
      toast("error", "שגיאה בכיבוי התראות");
    } finally {
      setPushLoading(false);
    }
  };

  const handleTestPush = async () => {
    try {
      const result = await sendTestPush();
      if (result.sent > 0) {
        toast("success", `התראת בדיקה נשלחה! (${result.sent} מכשירים)`);
      } else {
        toast("error", `שליחה נכשלה. ${result.failed > 0 ? "בדוק את מפתחות VAPID" : "אין מנויים רשומים"}`);
      }
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בשליחת בדיקה"));
    }
  };

  // Broadcast state
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastStep, setBroadcastStep] = useState<1 | 2 | 3 | 4>(1);
  const [broadcastForm, setBroadcastForm] = useState({
    title: "",
    body: "",
    target: "all" as "all" | "present" | "by_status" | "by_work_role" | "by_window" | "custom",
    soldier_ids: [] as string[],
    status_filter: "",
    work_role_id: "",
    schedule_window_id: "",
  });
  const [soldiers, setSoldiers] = useState<any[]>([]);
  const [workRoles, setWorkRoles] = useState<any[]>([]);
  const [scheduleWindows, setScheduleWindows] = useState<any[]>([]);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [,] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tmplRes, logsRes, chanRes, evtRes] = await Promise.all([
        api.get(tenantApi("/notifications/templates")),
        api.get(tenantApi("/notifications/logs")),
        api.get(tenantApi("/notifications/channels")),
        api.get(tenantApi("/notifications/event-types")),
      ]);
      setTemplates(tmplRes.data);
      setLogs(logsRes.data.items || logsRes.data);
      setChannels(chanRes.data);
      setEventTypes(evtRes.data);
    } catch (e) {
      toast("error", "שגיאה בטעינת התראות");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadSoldiers = useCallback(async () => {
    try {
      const res = await api.get(tenantApi("/employees"));
      setSoldiers(res.data.items || res.data);
    } catch (e) {}
  }, []);

  const loadWorkRoles = useCallback(async () => {
    try {
      const res = await api.get(tenantApi("/work-roles"));
      setWorkRoles(res.data);
    } catch {}
  }, []);

  const loadScheduleWindows = useCallback(async () => {
    try {
      const res = await api.get(tenantApi("/schedule-windows"));
      setScheduleWindows(res.data);
    } catch {}
  }, []);

  const openBroadcast = () => {
    setBroadcastForm({ title: "", body: "", target: "all", soldier_ids: [], status_filter: "", work_role_id: "", schedule_window_id: "" });
    setBroadcastStep(1);
    setShowBroadcast(true);
    loadSoldiers();
    loadWorkRoles();
    loadScheduleWindows();
  };

  const sendBroadcast = async () => {
    if (!broadcastForm.title || !broadcastForm.body) {
      toast("error", "יש למלא כותרת ותוכן");
      return;
    }
    setBroadcastSending(true);
    try {
      const payload: any = {
        title: broadcastForm.title,
        body: broadcastForm.body,
        target: broadcastForm.target,
      };
      if (broadcastForm.target === "custom") payload.soldier_ids = broadcastForm.soldier_ids;
      if (broadcastForm.target === "by_status") payload.status_filter = broadcastForm.status_filter;
      if (broadcastForm.target === "by_work_role") payload.work_role_id = broadcastForm.work_role_id;
      if (broadcastForm.target === "by_window") payload.schedule_window_id = broadcastForm.schedule_window_id;
      const res = await api.post(tenantApi("/notifications/broadcast"), payload);
      toast("success", `ההודעה נשלחה ל-${res.data.sent} חיילים (${res.data.total_employees} סה״כ)`);
      setShowBroadcast(false);
      load();
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בשליחה"));
    } finally {
      setBroadcastSending(false);
    }
  };

  const toggleSoldier = (id: string) => {
    setBroadcastForm(prev => ({
      ...prev,
      soldier_ids: prev.soldier_ids.includes(id)
        ? prev.soldier_ids.filter(s => s !== id)
        : [...prev.soldier_ids, id],
    }));
  };

  // Known event types with Hebrew labels and variables
  const KNOWN_EVENT_TYPES = [
    { code: "assignment.created", label: "שיבוץ חדש", vars: ["{employee.name}", "{mission.name}", "{mission.date}", "{mission.start_time}", "{mission.role}"] },
    { code: "assignment.updated", label: "שיבוץ עודכן", vars: ["{employee.name}", "{mission.name}", "{change_type}"] },
    { code: "assignment.cancelled", label: "שיבוץ בוטל", vars: ["{employee.name}", "{mission.name}", "{reason}"] },
    { code: "mission.reminder", label: "תזכורת משימה", vars: ["{employee.name}", "{mission.name}", "{mission.date}", "{minutes_until}"] },
    { code: "swap.requested", label: "בקשת החלפה חדשה", vars: ["{requester.name}", "{mission.name}", "{swap_type}"] },
    { code: "swap.approved", label: "החלפה אושרה", vars: ["{requester.name}", "{target.name}", "{mission.name}"] },
    { code: "swap.rejected", label: "החלפה נדחתה", vars: ["{requester.name}", "{mission.name}", "{reason}"] },
    { code: "schedule.published", label: "לוח שיבוצים פורסם", vars: ["{window.name}", "{start_date}", "{end_date}"] },
    { code: "attendance.changed", label: "סטטוס נוכחות השתנה", vars: ["{employee.name}", "{old_status}", "{new_status}"] },
    { code: "broadcast", label: "הודעה כללית", vars: ["{title}", "{body}"] },
    { code: "conflict.detected", label: "התנגשות זוהתה", vars: ["{employee.name}", "{mission.name}", "{conflict_type}"] },
  ];

  const getEventVars = (code: string) => {
    const known = KNOWN_EVENT_TYPES.find(e => e.code === code);
    if (known) return known.vars;
    const fromApi = eventTypes.find((e: any) => e.code === code);
    return fromApi?.available_variables ? Object.keys(fromApi.available_variables).map((k: string) => `{${k}}`) : [];
  };

  const insertVariable = (variable: string) => {
    const textarea = bodyHeRef.current;
    if (!textarea) {
      setForm(prev => ({ ...prev, body_he: prev.body_he + " " + variable }));
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = form.body_he;
    const newText = text.substring(0, start) + variable + text.substring(end);
    setForm(prev => ({ ...prev, body_he: newText }));
    // Restore cursor position after the inserted variable
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + variable.length;
    }, 0);
  };

  // Variable bank grouped by category with Hebrew labels
  const VARIABLE_BANK: Array<{ category: string; vars: Array<{ code: string; label: string }> }> = [
    {
      category: "חייל",
      vars: [
        { code: "{employee.name}", label: "שם חייל" },
        { code: "{employee.number}", label: "מספר אישי" },
      ],
    },
    {
      category: "משימה",
      vars: [
        { code: "{mission.name}", label: "שם משימה" },
        { code: "{mission.date}", label: "תאריך" },
        { code: "{mission.start_time}", label: "שעת התחלה" },
        { code: "{mission.end_time}", label: "שעת סיום" },
        { code: "{mission.role}", label: "תפקיד" },
        { code: "{change_type}", label: "סוג שינוי" },
        { code: "{reason}", label: "סיבה" },
        { code: "{minutes_until}", label: "דקות עד" },
      ],
    },
    {
      category: "החלפות",
      vars: [
        { code: "{requester.name}", label: "מבקש ההחלפה" },
        { code: "{target.name}", label: "יעד ההחלפה" },
        { code: "{swap_type}", label: "סוג החלפה" },
      ],
    },
    {
      category: "מערכת",
      vars: [
        { code: "{window.name}", label: "שם הלוח" },
        { code: "{start_date}", label: "תאריך התחלה" },
        { code: "{end_date}", label: "תאריך סיום" },
        { code: "{old_status}", label: "סטטוס ישן" },
        { code: "{new_status}", label: "סטטוס חדש" },
        { code: "{title}", label: "כותרת" },
        { code: "{body}", label: "תוכן" },
        { code: "{conflict_type}", label: "סוג התנגשות" },
      ],
    },
  ];

  const getPreviewText = () => {
    let text = form.body_he;
    const sampleData: Record<string, string> = {
      "{employee.name}": "יוסי כהן",
      "{mission.name}": "שמירה צפונית",
      "{mission.date}": "2026-04-01",
      "{mission.start_time}": "08:00",
      "{mission.end_time}": "16:00",
      "{mission.role}": "שומר",
      "{minutes_until}": "30",
      "{requester.name}": "דני לוי",
      "{target.name}": "רון אברהם",
      "{swap_type}": "החלפה",
      "{change_type}": "שינוי שעה",
      "{reason}": "סיבה אישית",
      "{window.name}": "אפריל 2026",
      "{start_date}": "2026-04-01",
      "{end_date}": "2026-04-30",
      "{old_status}": "נוכח",
      "{new_status}": "בבית",
      "{title}": form.name || "כותרת",
      "{body}": "תוכן ההודעה",
      "{conflict_type}": "מנוחה מינימלית",
    };
    for (const [key, val] of Object.entries(sampleData)) {
      text = text.split(key).join(val);
    }
    return text;
  };

  const saveTemplate = async () => {
    if (!form.name) { toast("error", "יש למלא שם לתבנית"); return; }
    if (!form.event_type_code) { toast("error", "יש לבחור סוג אירוע"); return; }
    try {
      const channelsPayload: Record<string, any> = {};
      if (form.channel_push) channelsPayload.push = { enabled: true, body: { he: form.body_he, en: form.body_en } };
      if (form.channel_in_app) channelsPayload.in_app = { enabled: true, body: { he: form.body_he, en: form.body_en } };
      if (form.channel_whatsapp) channelsPayload.whatsapp = { enabled: true, body: { he: form.body_he, en: form.body_en } };
      if (form.channel_email) channelsPayload.email = { enabled: true, body: { he: form.body_he, en: form.body_en } };

      const body = {
        name: form.name,
        event_type_code: form.event_type_code,
        channels: channelsPayload,
        is_active: form.is_active,
      };

      if (editingTemplate) {
        await api.patch(tenantApi(`/notifications/templates/${editingTemplate.id}`), body);
        toast("success", "תבנית עודכנה בהצלחה");
      } else {
        await api.post(tenantApi("/notifications/templates"), body);
        toast("success", "תבנית נוצרה בהצלחה");
      }
      setShowModal(false);
      setEditingTemplate(null);
      load();
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה"));
    }
  };

  const openEditTemplate = (tmpl: any) => {
    setEditingTemplate(tmpl);
    const ch = tmpl.channels || {};
    setForm({
      name: tmpl.name,
      event_type_code: tmpl.event_type_code,
      is_active: tmpl.is_active,
      body_he: ch.push?.body?.he || ch.in_app?.body?.he || ch.whatsapp?.body?.he || "",
      body_en: ch.push?.body?.en || ch.in_app?.body?.en || ch.whatsapp?.body?.en || "",
      channel_push: !!ch.push?.enabled,
      channel_in_app: !!ch.in_app?.enabled,
      channel_whatsapp: !!ch.whatsapp?.enabled,
      channel_email: !!ch.email?.enabled,
    });
    setShowModal(true);
  };

  if (loading) return <TableSkeleton rows={5} cols={3} />;

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "templates", label: "תבניות", icon: Mail },
    { key: "logs", label: "יומן שליחות", icon: Send },
    { key: "channels", label: "ערוצים", icon: MessageSquare },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("nav.notifications")}</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="default" onClick={openBroadcast}>
            <Megaphone className="me-1 h-4 w-4" />שלח הודעה לכולם
          </Button>
          {activeTab === "templates" && (
            <Button size="sm" variant="outline" onClick={() => {
              setEditingTemplate(null);
              setForm({ name: "", event_type_code: "", is_active: true, body_he: "", body_en: "", channel_push: true, channel_in_app: true, channel_whatsapp: false, channel_email: false });
              setShowModal(true);
            }}>
              <Plus className="me-1 h-4 w-4" />תבנית חדשה
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b pb-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1 rounded-md px-4 py-2 text-sm ${
              activeTab === key ? "bg-primary-500 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* Templates */}
      {activeTab === "templates" && (
        <div className="space-y-3">
          {templates.length === 0 ? (
            <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-lg font-medium">אין תבניות התראה</p>
              <p className="text-sm mt-1">צור תבנית כדי לשלוח התראות אוטומטיות לחיילים</p>
            </CardContent></Card>
          ) : templates.map(tmpl => {
            const eventLabel = KNOWN_EVENT_TYPES.find(e => e.code === tmpl.event_type_code)?.label || tmpl.event_type_code;
            const enabledChannels = Object.entries(tmpl.channels || {}).filter(([_, v]: any) => v?.enabled !== false).map(([k]) => k);
            return (
            <Card key={tmpl.id} className="hover:shadow-md transition-all group">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tmpl.is_active ? "bg-primary-100 dark:bg-primary-900/30" : "bg-gray-100 dark:bg-gray-800"}`}>
                    <Bell className={`h-5 w-5 ${tmpl.is_active ? "text-primary-500" : "text-gray-400"}`} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold">{tmpl.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">🎯 {eventLabel}</span>
                      {enabledChannels.length > 0 && (
                        <div className="flex gap-1">
                          {enabledChannels.map(ch => (
                            <span key={ch} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                              {ch === "push" ? "🔔" : ch === "in_app" ? "📱" : ch === "whatsapp" ? "💬" : ch === "email" ? "📧" : ch}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={tmpl.is_active ? "success" : "default"}>
                    {tmpl.is_active ? "פעיל" : "מושבת"}
                  </Badge>
                  <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity min-h-[40px] min-w-[40px]" onClick={() => openEditTemplate(tmpl)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* Logs */}
      {activeTab === "logs" && (
        <LogsPanel logs={logs} />
      )}

      {/* Channels */}
      {activeTab === "channels" && (
        <div className="space-y-6">
          {/* Push Notifications Control Panel */}
          <Card className="border-primary-200 dark:border-primary-800">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-primary-500" />
                </div>
                <div>
                  <h3 className="font-bold text-base">התראות Push בדפדפן</h3>
                  <p className="text-xs text-muted-foreground">קבל התראות ישירות בדפדפן גם כשהאפליקציה סגורה</p>
                </div>
              </div>

              {/* Clear status display */}
              <div className="rounded-lg border p-3 text-sm font-medium">
                {pushStatus === 'active' && (
                  <span className="text-green-700 dark:text-green-400">✅ התראות Push פעילות</span>
                )}
                {pushStatus === 'ios-not-installed' && (
                  <span className="text-primary-700 dark:text-primary-400">📱 הוסף למסך הבית לקבלת התראות</span>
                )}
                {pushStatus === 'prompt' && (
                  <span className="text-amber-700 dark:text-amber-400">🔔 לחץ להפעלת התראות</span>
                )}
                {pushStatus === 'denied' && (
                  <span className="text-red-700 dark:text-red-400">❌ התראות חסומות — שנה בהגדרות הדפדפן</span>
                )}
                {pushStatus === 'unsupported' && (
                  <span className="text-gray-700 dark:text-gray-400">⚠️ הדפדפן לא תומך בהתראות Push</span>
                )}
              </div>

              {/* iOS not installed to Home Screen — show instructions */}
              {pushStatus === 'ios-not-installed' && (
                <div className="rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 p-4 text-sm text-primary-700 dark:text-primary-300 space-y-2">
                  <p className="font-bold">📱 כדי לקבל התראות Push באייפון, הוסף את שבצק למסך הבית</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>לחץ על כפתור השיתוף (Share) <span className="font-mono">⎙</span> בתחתית Safari</li>
                    <li>גלול למטה ולחץ על &quot;Add to Home Screen&quot;</li>
                    <li>לחץ &quot;Add&quot; — האפליקציה תופיע במסך הבית</li>
                    <li>פתח את שבצק מהאייקון במסך הבית והפעל התראות</li>
                  </ol>
                </div>
              )}

              {/* Push unsupported */}
              {pushStatus === 'unsupported' && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-300">
                  ⚠️ הדפדפן שלך לא תומך בהתראות Push. נסה Chrome, Edge, או Safari 16.4+.
                </div>
              )}

              {/* Push supported and not iOS-blocked */}
              {pushStatus !== 'unsupported' && pushStatus !== 'ios-not-installed' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm">סטטוס הרשאה:</span>
                    <Badge className={
                      pushPermission === "granted" ? "bg-green-100 text-green-700" :
                      pushPermission === "denied" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-700"
                    }>
                      {pushPermission === "granted" ? "✅ מאושר" :
                       pushPermission === "denied" ? "❌ חסום" :
                       "⏳ לא נשאל"}
                    </Badge>
                    {pushSubscribed && <Badge className="bg-primary-100 text-primary-700">📡 מנוי פעיל</Badge>}
                  </div>

                  {pushPermission === "denied" && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-3 text-sm text-red-700 dark:text-red-300">
                      ❌ ההתראות חסומות בדפדפן. כדי להפעיל, לחץ על 🔒 ליד שורת הכתובת → הרשאות → התראות → אפשר
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {!pushSubscribed ? (
                      <Button size="sm" onClick={handleEnablePush} disabled={pushLoading || pushPermission === "denied"}>
                        {pushLoading ? "מפעיל..." : "🔔 הפעל התראות Push"}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={handleDisablePush} disabled={pushLoading}>
                        {pushLoading ? "מכבה..." : "🔕 כבה התראות Push"}
                      </Button>
                    )}
                    {pushSubscribed && (
                      <Button size="sm" variant="outline" onClick={handleTestPush}>
                        🧪 שלח התראת בדיקה
                      </Button>
                    )}
                  </div>

                  {/* Debug info — show last error if exists */}
                  {getLastPushError() && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm">
                      <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">🔍 שגיאה אחרונה:</p>
                      <p className="text-amber-700 dark:text-amber-300 font-mono text-xs break-all">{getLastPushError()}</p>
                    </div>
                  )}

                  {/* Push Debug Log — visible diagnostic panel */}
                  <div className="border-t pt-3">
                    <button
                      type="button"
                      onClick={() => { setDebugLog(getPushDebugLog()); setShowDebug(!showDebug); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      🔧 {showDebug ? "הסתר" : "הצג"} יומן Push Debug
                    </button>
                    {showDebug && (
                      <div className="mt-2 rounded-lg bg-gray-950 dark:bg-gray-900 border border-gray-700 p-3 text-xs font-mono space-y-0.5 max-h-48 overflow-y-auto" dir="ltr">
                        {debugLog.length === 0 ? (
                          <p className="text-gray-500">No push events yet. Click "הפעל התראות Push" to start.</p>
                        ) : debugLog.map((entry, i) => (
                          <div key={i} className={entry.includes('❌') ? 'text-red-400' : 'text-green-400'}>
                            {entry}
                          </div>
                        ))}
                        {debugLog.length > 0 && (
                          <button
                            type="button"
                            onClick={() => { clearPushDebugLog(); setDebugLog([]); }}
                            className="mt-2 text-gray-500 hover:text-gray-300 text-[10px]"
                          >
                            [clear log]
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Channel configs from backend */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {channels.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">אין ערוצים מוגדרים</CardContent></Card>
            ) : channels.map(ch => (
              <Card key={ch.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium capitalize">{ch.channel}</h3>
                      {ch.cost_per_message_usd && (
                        <p className="text-xs text-muted-foreground">עלות: ${ch.cost_per_message_usd}/הודעה</p>
                      )}
                    </div>
                    <Badge variant={ch.is_enabled ? "success" : "default"}>
                      {ch.is_enabled ? "פעיל" : "מושבת"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Broadcast Modal — Multi-Step */}
      <Dialog open={showBroadcast} onOpenChange={setShowBroadcast}>
        <DialogContent className="max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              📢 שליחת הודעה — שלב {broadcastStep} מתוך 4
            </DialogTitle>
            <div className="flex gap-1 mt-2">
              {[1,2,3,4].map(s => (
                <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= broadcastStep ? "bg-primary-500" : "bg-muted"}`} />
              ))}
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Step 1: Choose Target */}
            {broadcastStep === 1 && (
              <div className="space-y-3">
                <Label className="text-base font-bold">בחר יעד שליחה</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "all", label: "כל החיילים", icon: "👥", desc: "שלח לכולם" },
                    { value: "present", label: "נוכחים בלבד", icon: "✅", desc: "רק מי שבסטטוס נוכח" },
                    { value: "by_status", label: "לפי סטטוס", icon: "📊", desc: "בחר סטטוס ספציפי" },
                    { value: "by_work_role", label: "לפי תפקיד עבודה", icon: "🔧", desc: "נהגים, חובשים..." },
                    { value: "by_window", label: "לפי לוח עבודה", icon: "📅", desc: "חיילים בלוח מסוים" },
                    { value: "custom", label: "בחירה ידנית", icon: "✋", desc: "בחר חיילים ספציפיים" },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBroadcastForm({...broadcastForm, target: opt.value, soldier_ids: []})}
                      className={`rounded-xl border p-3 text-start transition-all ${
                        broadcastForm.target === opt.value
                          ? "ring-2 ring-primary-500 border-primary-300 bg-primary-50 dark:bg-primary-900/20"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="text-xl mb-1">{opt.icon}</div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Filter (if needed) */}
            {broadcastStep === 2 && (
              <div className="space-y-4">
                <Label className="text-base font-bold">
                  {broadcastForm.target === "by_status" && "בחר סטטוס"}
                  {broadcastForm.target === "by_work_role" && "בחר תפקיד עבודה"}
                  {broadcastForm.target === "by_window" && "בחר לוח עבודה"}
                  {broadcastForm.target === "custom" && `בחר חיילים (${broadcastForm.soldier_ids.length} נבחרו)`}
                  {(broadcastForm.target === "all" || broadcastForm.target === "present") && "אישור יעד"}
                </Label>

                {broadcastForm.target === "by_status" && (
                  <div className="grid grid-cols-2 gap-2">
                    {["present", "home", "going_home", "returning_home", "sick", "training", "released"].map(st => (
                      <button key={st} type="button"
                        onClick={() => setBroadcastForm({...broadcastForm, status_filter: st})}
                        className={`rounded-lg border p-2.5 text-sm text-start ${broadcastForm.status_filter === st ? "ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20" : "hover:bg-muted/50"}`}>
                        {st === "present" ? "✅ נוכח" : st === "home" ? "🏠 בבית" : st === "going_home" ? "🚪 יוצא הביתה" : st === "returning_home" ? "🔙 חוזר" : st === "sick" ? "🤒 חולה" : st === "training" ? "📚 הכשרה" : "🎖️ שוחרר"}
                      </button>
                    ))}
                  </div>
                )}

                {broadcastForm.target === "by_work_role" && (
                  <div className="space-y-2">
                    {workRoles.map((wr: any) => (
                      <button key={wr.id} type="button"
                        onClick={() => setBroadcastForm({...broadcastForm, work_role_id: wr.id})}
                        className={`w-full rounded-lg border p-3 text-start flex items-center gap-2 ${broadcastForm.work_role_id === wr.id ? "ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20" : "hover:bg-muted/50"}`}>
                        <div className="h-3 w-3 rounded-full" style={{backgroundColor: wr.color || "#999"}} />
                        <span className="text-sm font-medium">{wr.name?.he || wr.name?.en || wr.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {broadcastForm.target === "by_window" && (
                  <div className="space-y-2">
                    {scheduleWindows.map((w: any) => (
                      <button key={w.id} type="button"
                        onClick={() => setBroadcastForm({...broadcastForm, schedule_window_id: w.id})}
                        className={`w-full rounded-lg border p-3 text-start ${broadcastForm.schedule_window_id === w.id ? "ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20" : "hover:bg-muted/50"}`}>
                        <div className="text-sm font-medium">{w.name}</div>
                        <div className="text-xs text-muted-foreground">{w.start_date} — {w.end_date} ({w.employee_count} חיילים)</div>
                      </button>
                    ))}
                  </div>
                )}

                {broadcastForm.target === "custom" && (
                  <div className="max-h-60 overflow-y-auto rounded-md border p-2 space-y-1">
                    {soldiers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">טוען...</p>
                    ) : soldiers.map((s: any) => (
                      <button key={s.id} type="button" onClick={() => toggleSoldier(s.id)}
                        className={`w-full flex items-center gap-2 rounded px-3 py-2 text-sm text-start ${broadcastForm.soldier_ids.includes(s.id) ? "bg-primary-100 dark:bg-primary-900" : "hover:bg-accent"}`}>
                        <div className={`h-4 w-4 rounded border flex items-center justify-center ${broadcastForm.soldier_ids.includes(s.id) ? "bg-primary-500 border-primary-500" : "border-input"}`}>
                          {broadcastForm.soldier_ids.includes(s.id) && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <span>{s.full_name}</span>
                        <Badge className="mr-auto text-[10px]" variant="default">{s.status === "present" ? "✅" : s.status === "home" ? "🏠" : s.status}</Badge>
                      </button>
                    ))}
                  </div>
                )}

                {(broadcastForm.target === "all" || broadcastForm.target === "present") && (
                  <div className="rounded-lg bg-muted/30 border p-4 text-center">
                    <p className="text-sm">
                      {broadcastForm.target === "all" ? `📢 ההודעה תישלח לכל ${soldiers.length} החיילים הפעילים` : `✅ ההודעה תישלח רק לחיילים בסטטוס "נוכח"`}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Write Message */}
            {broadcastStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-base font-bold">כתוב את ההודעה</Label>
                  <Input value={broadcastForm.title} onChange={e => setBroadcastForm({...broadcastForm, title: e.target.value})} placeholder="כותרת ההודעה" />
                </div>
                <div className="space-y-2">
                  <Label>תוכן ההודעה</Label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
                    value={broadcastForm.body}
                    onChange={e => setBroadcastForm({...broadcastForm, body: e.target.value})}
                    placeholder="הקלד את תוכן ההודעה..."
                  />
                </div>
              </div>
            )}

            {/* Step 4: Preview & Send */}
            {broadcastStep === 4 && (
              <div className="space-y-4">
                <Label className="text-base font-bold">תצוגה מקדימה</Label>
                <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-primary-500" />
                    <span className="font-bold">{broadcastForm.title || "ללא כותרת"}</span>
                  </div>
                  <p className="text-sm">{broadcastForm.body || "ללא תוכן"}</p>
                  <div className="border-t pt-2 text-xs text-muted-foreground space-y-1">
                    <p>🎯 יעד: {
                      broadcastForm.target === "all" ? "כל החיילים" :
                      broadcastForm.target === "present" ? "נוכחים בלבד" :
                      broadcastForm.target === "by_status" ? `סטטוס: ${broadcastForm.status_filter}` :
                      broadcastForm.target === "by_work_role" ? `תפקיד: ${workRoles.find((wr: any) => wr.id === broadcastForm.work_role_id)?.name?.he || ""}` :
                      broadcastForm.target === "by_window" ? `לוח: ${scheduleWindows.find((w: any) => w.id === broadcastForm.schedule_window_id)?.name || ""}` :
                      `${broadcastForm.soldier_ids.length} חיילים נבחרו`
                    }</p>
                    <p>📡 ערוץ: Push Notification</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            {broadcastStep > 1 && (
              <Button variant="outline" onClick={() => setBroadcastStep((broadcastStep - 1) as any)}>
                → חזור
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowBroadcast(false)}>ביטול</Button>
            {broadcastStep < 4 ? (
              <Button onClick={() => {
                // Validate current step
                if (broadcastStep === 1) {
                  // Target chosen, check if step 2 needs filter or skip
                  if (broadcastForm.target === "all" || broadcastForm.target === "present") {
                    setBroadcastStep(2); // Show confirmation
                  } else {
                    setBroadcastStep(2); // Show filter
                  }
                } else if (broadcastStep === 2) {
                  // Validate filter
                  if (broadcastForm.target === "by_status" && !broadcastForm.status_filter) {
                    toast("error", "יש לבחור סטטוס"); return;
                  }
                  if (broadcastForm.target === "by_work_role" && !broadcastForm.work_role_id) {
                    toast("error", "יש לבחור תפקיד"); return;
                  }
                  if (broadcastForm.target === "by_window" && !broadcastForm.schedule_window_id) {
                    toast("error", "יש לבחור לוח עבודה"); return;
                  }
                  if (broadcastForm.target === "custom" && broadcastForm.soldier_ids.length === 0) {
                    toast("error", "יש לבחור חיילים"); return;
                  }
                  setBroadcastStep(3);
                } else if (broadcastStep === 3) {
                  if (!broadcastForm.title || !broadcastForm.body) {
                    toast("error", "יש למלא כותרת ותוכן"); return;
                  }
                  setBroadcastStep(4);
                }
              }}>
                ← המשך
              </Button>
            ) : (
              <Button onClick={sendBroadcast} disabled={broadcastSending} className="bg-green-600 hover:bg-green-700">
                {broadcastSending ? "שולח..." : "📤 שלח עכשיו"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Template Modal */}
      <Dialog open={showModal} onOpenChange={(open) => { setShowModal(open); if (!open) setEditingTemplate(null); }}>
        <DialogContent className="max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {editingTemplate ? "✏️ עריכת תבנית התראה" : "➕ תבנית התראה חדשה"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            {/* Basic Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-muted-foreground">📝 פרטי התבנית</h3>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">שם התבנית <span className="text-red-500">*</span></Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="לדוגמה: התראת שיבוץ חדש"
                  className="min-h-[44px] text-base"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">סוג אירוע (טריגר) <span className="text-red-500">*</span></Label>
                <select
                  value={form.event_type_code}
                  onChange={e => setForm({...form, event_type_code: e.target.value})}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm min-h-[44px]"
                >
                  <option value="">בחר אירוע שמפעיל את ההתראה...</option>
                  <optgroup label="📋 שיבוצים">
                    {KNOWN_EVENT_TYPES.filter(e => e.code.startsWith("assignment.") || e.code.startsWith("mission.")).map(e => (
                      <option key={e.code} value={e.code}>{e.label} ({e.code})</option>
                    ))}
                  </optgroup>
                  <optgroup label="🔄 החלפות">
                    {KNOWN_EVENT_TYPES.filter(e => e.code.startsWith("swap.")).map(e => (
                      <option key={e.code} value={e.code}>{e.label} ({e.code})</option>
                    ))}
                  </optgroup>
                  <optgroup label="📊 מערכת">
                    {KNOWN_EVENT_TYPES.filter(e => !e.code.startsWith("assignment.") && !e.code.startsWith("mission.") && !e.code.startsWith("swap.")).map(e => (
                      <option key={e.code} value={e.code}>{e.label} ({e.code})</option>
                    ))}
                  </optgroup>
                  {/* API event types not in known list */}
                  {eventTypes.filter((e: any) => !KNOWN_EVENT_TYPES.find(k => k.code === e.code)).length > 0 && (
                    <optgroup label="🔧 מותאם אישית">
                      {eventTypes.filter((e: any) => !KNOWN_EVENT_TYPES.find(k => k.code === e.code)).map((e: any) => (
                        <option key={e.code} value={e.code}>{e.label?.[lang] || e.label?.he || e.code}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>

            {/* Channels */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-muted-foreground">📡 ערוצי שליחה</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  { key: "channel_push", label: "🔔 Push", desc: "התראת דפדפן" },
                  { key: "channel_in_app", label: "📱 באפליקציה", desc: "התראה פנימית" },
                  { key: "channel_whatsapp", label: "💬 WhatsApp", desc: "הודעת וואטסאפ" },
                  { key: "channel_email", label: "📧 אימייל", desc: "שליחת מייל" },
                ] as const).map(ch => {
                  const isEnabled = form[ch.key];
                  const tenantHasChannel = ch.key === "channel_push" || ch.key === "channel_in_app" || channels.some((c: any) => c.channel === ch.key.replace("channel_", "") && c.is_enabled);
                  return (
                    <button
                      key={ch.key}
                      type="button"
                      disabled={!tenantHasChannel}
                      onClick={() => setForm({...form, [ch.key]: !isEnabled})}
                      className={`rounded-xl border p-3 text-start transition-all ${
                        !tenantHasChannel
                          ? "opacity-40 cursor-not-allowed bg-muted"
                          : isEnabled
                            ? "ring-2 ring-primary-500 border-primary-300 bg-primary-50 dark:bg-primary-900/20"
                            : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="text-sm font-medium">{ch.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{ch.desc}</div>
                      {!tenantHasChannel && <div className="text-[10px] text-red-500 mt-1">ערוץ לא מופעל</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message Body with Variable Picker */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-muted-foreground">✍️ תוכן ההודעה</h3>
              {form.event_type_code && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground">🏷️ בנק משתנים — לחץ להוספה במיקום הסמן:</Label>
                  <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
                    {VARIABLE_BANK.map(group => {
                      // Filter to only show vars relevant to selected event type
                      const eventVars = getEventVars(form.event_type_code);
                      const relevantVars = group.vars.filter(v => eventVars.includes(v.code));
                      if (relevantVars.length === 0) return null;
                      return (
                        <div key={group.category}>
                          <p className="text-[11px] font-bold text-muted-foreground mb-1.5 border-b border-muted pb-1">
                            {group.category}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {relevantVars.map(v => (
                              <button
                                key={v.code}
                                type="button"
                                onClick={() => insertVariable(v.code)}
                                className="group/chip flex flex-col items-center gap-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2.5 py-1.5 rounded-lg border border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-800/50 hover:scale-105 transition-all cursor-pointer"
                              >
                                <span className="text-[10px] text-primary-500 dark:text-primary-400 leading-none">{v.label}</span>
                                <span className="text-xs font-mono font-medium leading-none">{v.code}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {/* Also show any API-provided vars not in our bank */}
                    {(() => {
                      const eventVars = getEventVars(form.event_type_code);
                      const bankCodes = VARIABLE_BANK.flatMap(g => g.vars.map(v => v.code));
                      const extra = eventVars.filter(v => !bankCodes.includes(v));
                      if (extra.length === 0) return null;
                      return (
                        <div>
                          <p className="text-[11px] font-bold text-muted-foreground mb-1.5 border-b border-muted pb-1">נוסף</p>
                          <div className="flex flex-wrap gap-1.5">
                            {extra.map(v => (
                              <button key={v} type="button" onClick={() => insertVariable(v)}
                                className="text-xs bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 transition-colors font-mono">
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">הודעה (עברית) <span className="text-red-500">*</span></Label>
                <textarea
                  ref={bodyHeRef}
                  value={form.body_he}
                  onChange={e => setForm({...form, body_he: e.target.value})}
                  placeholder="לדוגמה: שלום {employee.name}, שובצת למשימה {mission.name} בתאריך {mission.date}"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm min-h-[80px] resize-y"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">הודעה (אנגלית) <span className="text-xs text-muted-foreground">(אופציונלי)</span></Label>
                <textarea
                  value={form.body_en}
                  onChange={e => setForm({...form, body_en: e.target.value})}
                  placeholder="e.g. Hi {employee.name}, you've been assigned to {mission.name} on {mission.date}"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm min-h-[60px] resize-y"
                  dir="ltr"
                />
              </div>

              {/* Live Preview */}
              {form.body_he && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Eye className="h-3 w-3" /> תצוגה מקדימה (עם נתוני דוגמה):
                  </Label>
                  <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1.5 text-xs text-muted-foreground">
                      <Bell className="h-3 w-3" />
                      <span className="font-medium">{form.name || "שם התבנית"}</span>
                    </div>
                    <p className="text-foreground">{getPreviewText()}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3 pt-2 border-t">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm({...form, is_active: e.target.checked})}
                  className="rounded accent-primary-500"
                />
                <span className="text-sm font-medium">תבנית פעילה</span>
              </label>
              <span className="text-xs text-muted-foreground">
                {form.is_active ? "ההתראה תישלח אוטומטית כשהאירוע מתרחש" : "התבנית מושבתת — לא תישלח"}
              </span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowModal(false); setEditingTemplate(null); }} className="min-h-[44px]">
              ביטול
            </Button>
            <Button onClick={saveTemplate} className="min-h-[44px]">
              {editingTemplate ? "💾 עדכן תבנית" : "➕ צור תבנית"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
