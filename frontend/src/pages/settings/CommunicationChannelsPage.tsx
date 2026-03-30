import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Save, Smartphone, MessageCircle, Mail, MessageSquare, Send } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

interface Channel {
  key: string;
  label: string;
  description: string;
  icon: any;
  color: string;
  enabled: boolean;
  costPerMessage: number;
  isFree: boolean;
}

const defaultChannels: Channel[] = [
  {
    key: "pwa_push",
    label: "PWA Push",
    description: "התראות Push באפליקציה — ללא עלות, מומלץ",
    icon: Smartphone,
    color: "#3b82f6",
    enabled: true,
    costPerMessage: 0,
    isFree: true,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    description: "הודעות WhatsApp — מחייב חשבון WhatsApp Business API",
    icon: MessageCircle,
    color: "#25d366",
    enabled: false,
    costPerMessage: 0.05,
    isFree: false,
  },
  {
    key: "email",
    label: "Email",
    description: "התראות באימייל — ללא עלות, דורש SMTP",
    icon: Mail,
    color: "#f59e0b",
    enabled: false,
    costPerMessage: 0,
    isFree: true,
  },
  {
    key: "sms",
    label: "SMS",
    description: "הודעות SMS — מחייב ספק SMS",
    icon: MessageSquare,
    color: "#ef4444",
    enabled: false,
    costPerMessage: 0.03,
    isFree: false,
  },
  {
    key: "telegram",
    label: "Telegram",
    description: "הודעות Telegram — ללא עלות, דורש בוט",
    icon: Send,
    color: "#0088cc",
    enabled: false,
    costPerMessage: 0,
    isFree: true,
  },
];

export default function CommunicationChannelsPage() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>(defaultChannels);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(tenantApi("/notifications/channels")).catch(() => null);
      if (res?.data) {
        setChannels(prev => prev.map(ch => {
          const saved = res.data.find((s: any) => s.key === ch.key);
          if (saved) return { ...ch, enabled: saved.enabled, costPerMessage: saved.cost_per_message ?? ch.costPerMessage };
          return ch;
        }));
      }
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleChannel = (key: string) => {
    setChannels(prev => prev.map(ch =>
      ch.key === key ? { ...ch, enabled: !ch.enabled } : ch
    ));
  };

  const updateCost = (key: string, cost: number) => {
    setChannels(prev => prev.map(ch =>
      ch.key === key ? { ...ch, costPerMessage: cost } : ch
    ));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      await api.put(tenantApi("/notifications/channels"), {
        channels: channels.map(ch => ({
          key: ch.key,
          enabled: ch.enabled,
          cost_per_message: ch.costPerMessage,
        })),
      });
      toast("success", "ערוצי תקשורת עודכנו");
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = channels.filter(c => c.enabled).length;
  const monthlyCostEstimate = channels
    .filter(c => c.enabled && !c.isFree)
    .reduce((sum, c) => sum + c.costPerMessage * 100, 0); // est. 100 msgs/month

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary-500">{enabledCount}</p>
            <p className="text-xs text-muted-foreground">ערוצים פעילים</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{channels.filter(c => c.enabled && c.isFree).length}</p>
            <p className="text-xs text-muted-foreground">ערוצים חינמיים</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-orange-500">${monthlyCostEstimate.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">עלות חודשית משוערת*</p>
          </CardContent>
        </Card>
      </div>

      {/* Channel cards */}
      <div className="space-y-3">
        {channels.map(ch => {
          const Icon = ch.icon;
          return (
            <Card key={ch.key} className={`transition-all ${ch.enabled ? "ring-2 ring-primary-200 dark:ring-primary-800" : "opacity-70"}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: ch.color }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{ch.label}</h3>
                        {ch.isFree ? (
                          <Badge className="bg-green-100 text-green-700 text-[10px]">חינם</Badge>
                        ) : (
                          <Badge className="bg-orange-100 text-orange-700 text-[10px]">בתשלום</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{ch.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleChannel(ch.key)}
                    className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                      ch.enabled ? "bg-primary-500" : "bg-muted"
                    }`}
                  >
                    <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      ch.enabled ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5 rtl:-translate-x-0.5"
                    }`} />
                  </button>
                </div>

                {ch.enabled && !ch.isFree && (
                  <div className="mt-3 pt-3 border-t flex items-center gap-3">
                    <Label className="text-xs whitespace-nowrap">עלות להודעה ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={ch.costPerMessage}
                      onChange={e => updateCost(ch.key, Number(e.target.value))}
                      className="w-28"
                      dir="ltr"
                    />
                    <span className="text-xs text-muted-foreground">× 100 הודעות = ${(ch.costPerMessage * 100).toFixed(2)}/חודש</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">* הערכה מבוססת על 100 הודעות/חודש לכל ערוץ בתשלום</p>

      <Button onClick={saveAll} disabled={saving} className="w-full sm:w-auto min-h-[44px]">
        <Save className="me-1 h-4 w-4" />
        {saving ? "שומר..." : "שמור הגדרות ערוצים"}
      </Button>
    </div>
  );
}
