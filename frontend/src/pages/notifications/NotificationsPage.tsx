import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Bell, Plus, Pencil, Mail, MessageSquare, Send, Megaphone, Check, Eye, Zap, X } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

type Tab = "templates" | "logs" | "channels";

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

  // Broadcast state
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({
    title: "",
    body: "",
    target: "all" as "all" | "present" | "custom",
    soldier_ids: [] as string[],
  });
  const [soldiers, setSoldiers] = useState<any[]>([]);
  const [broadcastSending, setBroadcastSending] = useState(false);

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

  const openBroadcast = () => {
    setBroadcastForm({ title: "", body: "", target: "all", soldier_ids: [] });
    setShowBroadcast(true);
    loadSoldiers();
  };

  const sendBroadcast = async () => {
    if (!broadcastForm.title || !broadcastForm.body) {
      toast("error", "יש למלא כותרת ותוכן");
      return;
    }
    if (broadcastForm.target === "custom" && broadcastForm.soldier_ids.length === 0) {
      toast("error", "יש לבחור חיילים");
      return;
    }
    setBroadcastSending(true);
    try {
      const res = await api.post(tenantApi("/notifications/broadcast"), broadcastForm);
      toast("success", `ההודעה נשלחה ל-${res.data.sent} חיילים`);
      setShowBroadcast(false);
      load();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה בשליחה");
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
    { code: "assignment.created", label: "שיבוץ חדש", vars: ["{employee.name}", "{mission.name}", "{mission.date}", "{mission.start_time}"] },
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
    setForm(prev => ({ ...prev, body_he: prev.body_he + " " + variable }));
  };

  const getPreviewText = () => {
    let text = form.body_he;
    const sampleData: Record<string, string> = {
      "{employee.name}": "יוסי כהן",
      "{mission.name}": "שמירה צפונית",
      "{mission.date}": "2026-04-01",
      "{mission.start_time}": "08:00",
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
      toast("error", e.response?.data?.detail || "שגיאה");
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
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tmpl.is_active ? "bg-blue-100 dark:bg-blue-900/30" : "bg-gray-100 dark:bg-gray-800"}`}>
                    <Bell className={`h-5 w-5 ${tmpl.is_active ? "text-blue-500" : "text-gray-400"}`} />
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
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50 text-sm">
                  <th className="px-4 py-3 text-start">ערוץ</th>
                  <th className="px-4 py-3 text-start">אירוע</th>
                  <th className="px-4 py-3 text-start">סטטוס</th>
                  <th className="px-4 py-3 text-start">נשלח</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(logs) ? logs : []).length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">אין רשומות</td></tr>
                ) : (Array.isArray(logs) ? logs : []).map((log: any) => (
                  <tr key={log.id} className="border-b">
                    <td className="px-4 py-3">{log.channel}</td>
                    <td className="px-4 py-3">{log.event_type_code}</td>
                    <td className="px-4 py-3">
                      <Badge variant={log.status === "sent" ? "success" : log.status === "failed" ? "destructive" : "default"}>
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{log.sent_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Channels */}
      {activeTab === "channels" && (
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
      )}

      {/* Broadcast Modal */}
      <Dialog open={showBroadcast} onOpenChange={setShowBroadcast}>
        <DialogContent>
          <DialogHeader><DialogTitle>שלח הודעה לכולם</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>כותרת</Label>
              <Input value={broadcastForm.title} onChange={e => setBroadcastForm({...broadcastForm, title: e.target.value})} placeholder="כותרת ההודעה" />
            </div>
            <div className="space-y-2">
              <Label>תוכן ההודעה</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                value={broadcastForm.body}
                onChange={e => setBroadcastForm({...broadcastForm, body: e.target.value})}
                placeholder="הקלד את תוכן ההודעה..."
              />
            </div>
            <div className="space-y-2">
              <Label>יעד</Label>
              <div className="flex gap-2">
                {([
                  { value: "all", label: "כולם" },
                  { value: "present", label: "נוכחים בלבד" },
                  { value: "custom", label: "בחירה ידנית" },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setBroadcastForm({...broadcastForm, target: opt.value, soldier_ids: []})}
                    className={`rounded-md px-4 py-2 text-sm border ${
                      broadcastForm.target === opt.value
                        ? "bg-primary-500 text-white border-primary-500"
                        : "bg-background text-foreground border-input hover:bg-accent"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {broadcastForm.target === "custom" && (
              <div className="space-y-2">
                <Label>בחר חיילים ({broadcastForm.soldier_ids.length} נבחרו)</Label>
                <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                  {soldiers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">טוען...</p>
                  ) : soldiers.map((s: any) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSoldier(s.id)}
                      className={`w-full flex items-center gap-2 rounded px-3 py-2 text-sm text-start ${
                        broadcastForm.soldier_ids.includes(s.id)
                          ? "bg-primary-100 dark:bg-primary-900"
                          : "hover:bg-accent"
                      }`}
                    >
                      <div className={`h-4 w-4 rounded border flex items-center justify-center ${
                        broadcastForm.soldier_ids.includes(s.id) ? "bg-primary-500 border-primary-500" : "border-input"
                      }`}>
                        {broadcastForm.soldier_ids.includes(s.id) && <Check className="h-3 w-3 text-white" />}
                      </div>
                      {s.full_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBroadcast(false)}>ביטול</Button>
            <Button onClick={sendBroadcast} disabled={broadcastSending}>
              {broadcastSending ? "שולח..." : "שלח"}
            </Button>
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
              {form.event_type_code && getEventVars(form.event_type_code).length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">משתנים זמינים — לחץ להוספה:</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {getEventVars(form.event_type_code).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors font-mono"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">הודעה (עברית) <span className="text-red-500">*</span></Label>
                <textarea
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
