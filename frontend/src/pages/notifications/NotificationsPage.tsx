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
import { Bell, Plus, Pencil, Mail, MessageSquare, Send } from "lucide-react";
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
  const [form, setForm] = useState({ name: "", event_type_code: "", is_active: true });

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

  const createTemplate = async () => {
    try {
      await api.post(tenantApi("/notifications/templates"), {
        name: form.name,
        event_type_code: form.event_type_code,
        channels: { in_app: { he: "התראה חדשה", en: "New notification" } },
        is_active: form.is_active,
      });
      toast("success", "תבנית נוצרה בהצלחה");
      setShowModal(false);
      load();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
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
        {activeTab === "templates" && (
          <Button size="sm" onClick={() => { setForm({ name: "", event_type_code: "", is_active: true }); setShowModal(true); }}>
            <Plus className="me-1 h-4 w-4" />תבנית חדשה
          </Button>
        )}
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
            <Card><CardContent className="p-8 text-center text-muted-foreground">אין תבניות התראה</CardContent></Card>
          ) : templates.map(tmpl => (
            <Card key={tmpl.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-blue-500" />
                  <div>
                    <h3 className="font-medium">{tmpl.name}</h3>
                    <p className="text-xs text-muted-foreground">אירוע: {tmpl.event_type_code}</p>
                  </div>
                </div>
                <Badge variant={tmpl.is_active ? "success" : "default"}>
                  {tmpl.is_active ? "פעיל" : "מושבת"}
                </Badge>
              </CardContent>
            </Card>
          ))}
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

      {/* Create Template Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>תבנית התראה חדשה</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>שם</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div className="space-y-2">
              <Label>סוג אירוע</Label>
              <Input value={form.event_type_code} onChange={e => setForm({...form, event_type_code: e.target.value})} placeholder="assignment.created" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>ביטול</Button>
            <Button onClick={createTemplate}>צור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
