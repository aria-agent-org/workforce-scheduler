import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Smartphone, Mail, MessageCircle, Save } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import LoadingSpinner from "@/components/common/LoadingSpinner";

interface Notification {
  id: string;
  event_type_code: string;
  channel: string;
  status: string;
  payload: any;
  created_at: string;
}

const eventLabels: Record<string, string> = {
  mission_assigned: "שובצת למשימה",
  mission_updated: "שיבוץ עודכן",
  mission_cancelled: "משימה בוטלה",
  mission_reminder: "תזכורת משימה",
  swap_requested: "בקשת החלפה",
  swap_approved: "החלפה אושרה",
  swap_rejected: "החלפה נדחתה",
  schedule_published: "לוח פורסם",
};

export default function MyNotificationsPage() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Record<string, boolean>>({
    push: true,
    email: false,
    whatsapp: false,
  });
  const [showSettings, setShowSettings] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(tenantApi("/my/notifications"));
      setNotifications(res.data.items || []);
    } catch {
      toast("error", "שגיאה בטעינת התראות");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const savePrefs = async () => {
    try {
      await api.patch(tenantApi("/my/notification-settings"), { channels });
      toast("success", "הגדרות עודכנו");
      setShowSettings(false);
    } catch {
      toast("error", "שגיאה בשמירה");
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary-500" />
          התראות
        </h2>
        <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
          הגדרות
        </Button>
      </div>

      {showSettings && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="font-medium text-sm">ערוצי התראות</p>
            {[
              { key: "push", label: "Push (אפליקציה)", icon: Smartphone },
              { key: "email", label: "אימייל", icon: Mail },
              { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
            ].map(({ key, label, icon: Icon }) => (
              <label key={key} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4" /> {label}
                </span>
                <input
                  type="checkbox"
                  checked={channels[key] || false}
                  onChange={e => setChannels({ ...channels, [key]: e.target.checked })}
                  className="rounded h-5 w-5"
                />
              </label>
            ))}
            <Button size="sm" onClick={savePrefs} className="w-full">
              <Save className="me-1 h-4 w-4" /> שמור הגדרות
            </Button>
          </CardContent>
        </Card>
      )}

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <BellOff className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-lg font-medium">אין התראות</p>
            <p className="text-sm">התראות חדשות יופיעו כאן</p>
          </CardContent>
        </Card>
      ) : (
        notifications.map(n => (
          <Card key={n.id}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{eventLabels[n.event_type_code] || n.event_type_code}</p>
                <p className="text-xs text-muted-foreground">{n.created_at?.slice(0, 16).replace("T", " ")}</p>
              </div>
              <Badge className={
                n.status === "sent" ? "bg-green-100 text-green-700" :
                n.status === "failed" ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-700"
              }>
                {n.channel}
              </Badge>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
