import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

export default function WebhooksPage() {
  const { toast } = useToast();
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", url: "", events: "" as string, secret: "", is_active: true });

  const load = useCallback(async () => {
    try {
      const res = await api.get(tenantApi("/outgoing-webhooks"));
      setWebhooks(res.data.items || res.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const payload = { ...form, events: form.events.split(",").map(e => e.trim()).filter(Boolean) };
      if (editing) {
        await api.patch(tenantApi(`/outgoing-webhooks/${editing.id}`), payload);
        toast("success", "Webhook עודכן");
      } else {
        await api.post(tenantApi("/outgoing-webhooks"), payload);
        toast("success", "Webhook נוצר");
      }
      setShowModal(false); setEditing(null); load();
    } catch (e: any) { toast("error", e?.response?.data?.detail || "שגיאה"); }
  };

  const remove = async (id: string) => {
    if (!confirm("למחוק webhook זה?")) return;
    try {
      await api.delete(tenantApi(`/outgoing-webhooks/${id}`));
      toast("success", "Webhook נמחק"); load();
    } catch (e: any) { toast("error", "שגיאה במחיקה"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2"><ExternalLink className="h-5 w-5" /> Webhooks יוצאים</h1>
        <Button size="sm" onClick={() => { setEditing(null); setForm({ name: "", url: "", events: "", secret: "", is_active: true }); setShowModal(true); }}>
          <Plus className="me-1 h-4 w-4" /> חדש
        </Button>
      </div>

      {loading ? <p className="text-center py-8 text-muted-foreground">טוען...</p> : webhooks.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ExternalLink className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>אין Webhooks מוגדרים</p>
          <p className="text-xs mt-1">Webhooks שולחים התראות HTTP לשירותים חיצוניים בזמן אמת</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map(wh => (
            <Card key={wh.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm truncate">{wh.name || wh.url}</h3>
                    <Badge className={wh.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                      {wh.is_active ? "פעיל" : "מושבת"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5" dir="ltr">{wh.url}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {(wh.events || []).map((ev: string) => <Badge key={ev} className="text-[10px] bg-blue-50 text-blue-700">{ev}</Badge>)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="min-h-[40px] min-w-[40px]" onClick={() => {
                    setEditing(wh); setForm({ name: wh.name || "", url: wh.url, events: (wh.events || []).join(", "), secret: "", is_active: wh.is_active });
                    setShowModal(true);
                  }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="min-h-[40px] min-w-[40px] text-red-500" onClick={() => remove(wh.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px]">
          <DialogHeader><DialogTitle>{editing ? "עריכת Webhook" : "Webhook חדש"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>שם</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Slack notifications" /></div>
            <div className="space-y-2"><Label>URL</Label><Input value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="https://hooks.slack.com/..." dir="ltr" /></div>
            <div className="space-y-2"><Label>אירועים (מופרדים בפסיק)</Label><Input value={form.events} onChange={e => setForm({...form, events: e.target.value})} placeholder="mission.created, assignment.changed, schedule.published" /></div>
            <div className="space-y-2"><Label>Secret (HMAC)</Label><Input value={form.secret} onChange={e => setForm({...form, secret: e.target.value})} placeholder="(ריק = ללא חתימה)" dir="ltr" type="password" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>ביטול</Button>
            <Button onClick={save}>{editing ? "עדכן" : "צור"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
