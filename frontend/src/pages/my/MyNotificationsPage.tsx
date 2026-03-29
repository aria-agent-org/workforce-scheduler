import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Smartphone, Mail, MessageCircle, Save, Settings2, Clock, ChevronDown, ChevronUp } from "lucide-react";
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

const eventIcons: Record<string, string> = {
  mission_assigned: "📋",
  mission_updated: "✏️",
  mission_cancelled: "❌",
  mission_reminder: "⏰",
  swap_requested: "🔄",
  swap_approved: "✅",
  swap_rejected: "🚫",
  schedule_published: "📅",
};

const channelConfig = [
  { key: "push", label: "Push", icon: Smartphone, color: "text-blue-500" },
  { key: "email", label: "אימייל", icon: Mail, color: "text-orange-500" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "text-green-500" },
];

export default function MyNotificationsPage() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Notification toggle grid: event_type → channel → enabled
  const [prefs, setPrefs] = useState<Record<string, Record<string, boolean>>>(() => {
    const defaults: Record<string, Record<string, boolean>> = {};
    Object.keys(eventLabels).forEach(evt => {
      defaults[evt] = { push: true, email: false, whatsapp: false };
    });
    return defaults;
  });

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

  const togglePref = (event: string, channel: string) => {
    setPrefs(prev => ({
      ...prev,
      [event]: { ...prev[event], [channel]: !prev[event]?.[channel] },
    }));
  };

  const savePrefs = async () => {
    setSaving(true);
    try {
      await api.patch(tenantApi("/my/notification-settings"), { preferences: prefs });
      toast("success", "הגדרות עודכנו");
      setShowSettings(false);
    } catch {
      toast("error", "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary-500" />
          התראות
        </h2>
        <Button 
          variant={showSettings ? "default" : "outline"} 
          size="sm" 
          onClick={() => setShowSettings(!showSettings)}
          className="min-h-[40px]"
        >
          <Settings2 className="me-1 h-4 w-4" />
          הגדרות
          {showSettings ? <ChevronUp className="ms-1 h-3 w-3" /> : <ChevronDown className="ms-1 h-3 w-3" />}
        </Button>
      </div>

      {/* Notification toggle grid */}
      {showSettings && (
        <Card className="overflow-hidden animate-in slide-in-from-top-2 duration-200">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm">בחר ערוצים לכל סוג אירוע</h3>
            
            {/* Header row */}
            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr repeat(3, 64px)" }}>
              <div />
              {channelConfig.map(ch => (
                <div key={ch.key} className="flex flex-col items-center gap-0.5">
                  <ch.icon className={`h-4 w-4 ${ch.color}`} />
                  <span className="text-[10px] text-muted-foreground">{ch.label}</span>
                </div>
              ))}
            </div>
            
            {/* Event rows */}
            {Object.entries(eventLabels).map(([evt, label]) => (
              <div key={evt} className="grid gap-2 items-center py-1.5 border-t" style={{ gridTemplateColumns: "1fr repeat(3, 64px)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{eventIcons[evt]}</span>
                  <span className="text-sm">{label}</span>
                </div>
                {channelConfig.map(ch => (
                  <div key={ch.key} className="flex justify-center">
                    <button
                      onClick={() => togglePref(evt, ch.key)}
                      className={`h-8 w-8 rounded-lg transition-all active:scale-90 ${
                        prefs[evt]?.[ch.key]
                          ? "bg-primary-500 text-white shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {prefs[evt]?.[ch.key] ? "✓" : "—"}
                    </button>
                  </div>
                ))}
              </div>
            ))}
            
            <Button size="sm" onClick={savePrefs} disabled={saving} className="w-full min-h-[44px]">
              <Save className="me-1 h-4 w-4" />
              {saving ? "שומר..." : "שמור הגדרות"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Notifications list */}
      {notifications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            <BellOff className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-lg font-medium">אין התראות</p>
            <p className="text-sm mt-1">התראות חדשות יופיעו כאן</p>
          </CardContent>
        </Card>
      ) : (
        notifications.map(n => (
          <Card key={n.id} className="overflow-hidden transition-shadow hover:shadow-md">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-lg flex-shrink-0">
                  {eventIcons[n.event_type_code] || "📌"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{eventLabels[n.event_type_code] || n.event_type_code}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {n.created_at?.slice(0, 16).replace("T", " ")}
                    </span>
                    <Badge className={`text-[10px] ${
                      n.status === "sent" ? "bg-green-100 text-green-700" :
                      n.status === "failed" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {n.channel}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
