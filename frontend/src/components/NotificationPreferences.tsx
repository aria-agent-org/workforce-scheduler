import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Bell, Save } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

interface NotificationSetting {
  event_type: string;
  event_label: string;
  channels: Record<string, boolean>;
}

const EVENT_TYPES = [
  { key: "mission_assigned", he: "שובצתי למשימה", en: "Assigned to mission" },
  { key: "mission_removed", he: "הוסרתי ממשימה", en: "Removed from mission" },
  { key: "schedule_published", he: "לוח פורסם", en: "Schedule published" },
  { key: "swap_requested", he: "בקשת החלפה חדשה", en: "New swap request" },
  { key: "swap_approved", he: "החלפה אושרה", en: "Swap approved" },
  { key: "swap_rejected", he: "החלפה נדחתה", en: "Swap rejected" },
  { key: "reminder", he: "תזכורת משימה", en: "Mission reminder" },
  { key: "attendance_conflict", he: "קונפליקט נוכחות", en: "Attendance conflict" },
];

const CHANNELS = [
  { key: "push", he: "Push", en: "Push" },
  { key: "email", he: "אימייל", en: "Email" },
  { key: "whatsapp", he: "WhatsApp", en: "WhatsApp" },
  { key: "telegram", he: "Telegram", en: "Telegram" },
];

export default function NotificationPreferences() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(tenantApi("/my/notification-settings"));
      if (Array.isArray(data) && data.length > 0) {
        setSettings(data);
      } else {
        // Initialize with defaults
        setSettings(EVENT_TYPES.map(et => ({
          event_type: et.key,
          event_label: lang === "he" ? et.he : et.en,
          channels: CHANNELS.reduce((acc, ch) => ({ ...acc, [ch.key]: true }), {}),
        })));
      }
    } catch {
      // Initialize with defaults on error
      setSettings(EVENT_TYPES.map(et => ({
        event_type: et.key,
        event_label: lang === "he" ? et.he : et.en,
        channels: CHANNELS.reduce((acc, ch) => ({ ...acc, [ch.key]: true }), {}),
      })));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { load(); }, [load]);

  const toggleChannel = (eventType: string, channel: string) => {
    setSettings(prev => prev.map(s => {
      if (s.event_type !== eventType) return s;
      return { ...s, channels: { ...s.channels, [channel]: !s.channels[channel] } };
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(tenantApi("/my/notification-settings"), { settings });
      toast("success", t("notificationPrefs.saved"));
    } catch {
      toast("error", t("notificationPrefs.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted rounded" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t("notificationPrefs.title")}
          </CardTitle>
          <Button size="sm" onClick={handleSave} disabled={saving} className="min-h-[36px]">
            <Save className="me-1 h-4 w-4" />
            {saving ? "..." : t("save")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-start text-xs font-medium text-muted-foreground min-w-[180px]">
                  {t("notificationPrefs.eventType")}
                </th>
                {CHANNELS.map(ch => (
                  <th key={ch.key} className="py-2 text-center text-xs font-medium text-muted-foreground px-2">
                    {lang === "he" ? ch.he : ch.en}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {settings.map(setting => {
                const eventDef = EVENT_TYPES.find(e => e.key === setting.event_type);
                return (
                  <tr key={setting.event_type} className="border-b hover:bg-muted/10">
                    <td className="py-3 text-sm">
                      {eventDef ? (lang === "he" ? eventDef.he : eventDef.en) : setting.event_label || setting.event_type}
                    </td>
                    {CHANNELS.map(ch => (
                      <td key={ch.key} className="py-3 text-center">
                        <button
                          onClick={() => toggleChannel(setting.event_type, ch.key)}
                          className={`w-10 h-6 rounded-full transition-colors relative inline-flex items-center ${
                            setting.channels[ch.key]
                              ? "bg-primary-500"
                              : "bg-gray-300 dark:bg-gray-600"
                          }`}
                          role="switch"
                          aria-checked={setting.channels[ch.key]}
                        >
                          <span
                            className="absolute top-[2px] w-4 h-4 rounded-full bg-white shadow-sm transition-all"
                            style={{ insetInlineStart: setting.channels[ch.key] ? '18px' : '2px' }}
                          />
                        </button>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">{t("notificationPrefs.description")}</p>
      </CardContent>
    </Card>
  );
}
