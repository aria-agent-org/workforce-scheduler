import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ToggleSwitch from "@/components/ui/toggle-switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Save, MessageCircle, Mail, MessageSquare, Send, Settings, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";

interface ChannelConfig {
  id: string | null;
  channel: string;
  provider: string | null;
  is_enabled: boolean;
  config: Record<string, any> | null;
  verified: boolean;
}

const CHANNEL_META: Record<string, { label: string; icon: any; color: string; description: string }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "#25d366", description: "הודעות WhatsApp — Business API או QR Session" },
  telegram: { label: "Telegram", icon: Send, color: "#0088cc", description: "בוט Telegram — ללא עלות" },
  email: { label: "Email", icon: Mail, color: "#f59e0b", description: "אימייל — SMTP, AWS SES, או SendGrid" },
  sms: { label: "SMS", icon: MessageSquare, color: "#ef4444", description: "הודעות SMS — Twilio, AWS SNS" },
};

export default function CommunicationChannelsPage() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editChannel, setEditChannel] = useState<string | null>(null);
  const [editConfig, setEditConfig] = useState<Record<string, any>>({});
  const [editProvider, setEditProvider] = useState("");
  const [editEnabled, setEditEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(tenantApi("/channels"));
      setChannels(res.data);
    } catch {
      // Fallback defaults
      setChannels(["whatsapp", "telegram", "email", "sms"].map(ch => ({
        id: null, channel: ch, provider: null, is_enabled: false, config: null, verified: false,
      })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (ch: ChannelConfig) => {
    setEditChannel(ch.channel);
    setEditConfig(ch.config || {});
    setEditProvider(ch.provider || "");
    setEditEnabled(ch.is_enabled);
  };

  const saveChannel = async () => {
    if (!editChannel) return;
    setSaving(true);
    try {
      await api.put(tenantApi(`/channels/${editChannel}`), {
        channel: editChannel,
        provider: editProvider || null,
        is_enabled: editEnabled,
        config: editConfig,
      });
      toast("success", `ערוץ ${CHANNEL_META[editChannel]?.label} נשמר`);
      setEditChannel(null);
      load();
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה בשמירה"));
    } finally {
      setSaving(false);
    }
  };

  const testChannel = async (channel: string) => {
    setTesting(true);
    try {
      const res = await api.post(tenantApi(`/channels/${channel}/test`));
      if (res.data.verified) {
        toast("success", `✅ ערוץ ${CHANNEL_META[channel]?.label} אומת בהצלחה`);
        load();
      }
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה בבדיקה"));
    } finally {
      setTesting(false);
    }
  };

  const toggleEnabled = async (channel: string, enabled: boolean) => {
    try {
      const ch = channels.find(c => c.channel === channel);
      await api.put(tenantApi(`/channels/${channel}`), {
        channel,
        provider: ch?.provider || null,
        is_enabled: enabled,
        config: ch?.config || {},
      });
      load();
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה"));
    }
  };

  const enabledCount = channels.filter(c => c.is_enabled).length;
  const verifiedCount = channels.filter(c => c.verified).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex gap-2 sm:gap-3">
        <div className="flex-1 rounded-lg border bg-card p-2 sm:p-3 text-center">
          <p className="text-lg sm:text-2xl font-bold text-primary-500">{enabledCount}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">פעילים</p>
        </div>
        <div className="flex-1 rounded-lg border bg-card p-2 sm:p-3 text-center">
          <p className="text-lg sm:text-2xl font-bold text-green-600">{verifiedCount}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">מאומתים</p>
        </div>
        <div className="flex-1 rounded-lg border bg-card p-2 sm:p-3 text-center">
          <p className="text-lg sm:text-2xl font-bold text-blue-600">{channels.length}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">סה״כ</p>
        </div>
      </div>

      {/* Channel cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map(ch => {
            const meta = CHANNEL_META[ch.channel];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <Card
                key={ch.channel}
                className={`transition-all ${ch.is_enabled ? "ring-2 ring-primary-200 dark:ring-primary-800" : "opacity-70"}`}
              >
                <CardContent className="p-2.5 sm:p-4">
                  <div className="flex items-start justify-between gap-2 sm:gap-4">
                    <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-lg sm:rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: meta.color }}>
                        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm sm:text-base">{meta.label}</h3>
                          {ch.is_enabled && (
                            <Badge className="bg-green-100 text-green-700 text-[10px]">פעיל</Badge>
                          )}
                          {ch.verified && (
                            <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                              <CheckCircle2 className="inline h-3 w-3 me-0.5" />מאומת
                            </Badge>
                          )}
                          {ch.is_enabled && !ch.verified && (
                            <Badge className="bg-yellow-100 text-yellow-700 text-[10px]">
                              <AlertTriangle className="inline h-3 w-3 me-0.5" />לא מאומת
                            </Badge>
                          )}
                          {ch.provider && (
                            <Badge className="bg-muted text-foreground text-[10px]">{ch.provider}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{meta.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => openEdit(ch)}>
                        <Settings className="me-1 h-3.5 w-3.5" />הגדר
                      </Button>
                      {ch.is_enabled && ch.config && (
                        <Button variant="outline" size="sm" onClick={() => testChannel(ch.channel)} disabled={testing}>
                          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "🧪 בדוק"}
                        </Button>
                      )}
                      <ToggleSwitch
                        checked={ch.is_enabled}
                        onChange={() => toggleEnabled(ch.channel, !ch.is_enabled)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Channel Dialog */}
      <Dialog open={!!editChannel} onOpenChange={(o) => { if (!o) setEditChannel(null); }}>
        <DialogContent className="max-w-[550px] max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              הגדרות {editChannel && CHANNEL_META[editChannel]?.label}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* WhatsApp Config */}
            {editChannel === "whatsapp" && (
              <>
                <div className="space-y-2">
                  <Label>שיטת חיבור</Label>
                  <Select value={editProvider} onChange={(e) => setEditProvider(e.target.value)}>
                    <option value="">בחר...</option>
                    <option value="business_api">WhatsApp Business API</option>
                    <option value="qr_session">WhatsApp QR Session (ניסיוני)</option>
                  </Select>
                </div>
                {editProvider === "business_api" && (
                  <>
                    <div className="space-y-2">
                      <Label>API Token</Label>
                      <Input
                        value={editConfig.api_token || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, api_token: e.target.value })}
                        placeholder="EAABs..."
                        dir="ltr"
                        type="password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number ID</Label>
                      <Input
                        value={editConfig.phone_number_id || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, phone_number_id: e.target.value })}
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Business Account ID</Label>
                      <Input
                        value={editConfig.business_account_id || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, business_account_id: e.target.value })}
                        dir="ltr"
                      />
                    </div>
                  </>
                )}
                {editProvider === "qr_session" && (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 p-3 text-sm text-yellow-700">
                      ⚠️ חיבור QR — יש לסרוק מטלפון מחובר ל-WhatsApp. החיבור עלול להתנתק אם הטלפון כבוי.
                    </div>
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        const res = await api.get(tenantApi("/channels/whatsapp/qr"));
                        const d = res.data;
                        setEditConfig((prev: Record<string, any>) => ({ ...prev, _qrData: d }));
                      } catch { alert("שגיאה בקבלת QR — ודא שיש הרשאות מתאימות"); }
                    }}>
                      📱 הצג קוד QR לסריקה
                    </Button>
                    {editConfig._qrData && (
                      <div className="flex flex-col items-center gap-3 p-4 rounded-lg border bg-white">
                        {editConfig._qrData.status === "connected" ? (
                          <div className="text-center space-y-2">
                            <div className="text-4xl">✅</div>
                            <p className="font-bold text-green-700">WhatsApp מחובר!</p>
                            <p className="text-sm text-muted-foreground">מספר: {editConfig._qrData.connected_number}</p>
                          </div>
                        ) : editConfig._qrData.status === "error" ? (
                          <div className="text-center space-y-2">
                            <div className="text-4xl">❌</div>
                            <p className="font-bold text-red-700">{editConfig._qrData.message}</p>
                          </div>
                        ) : editConfig._qrData.qr_image ? (
                          <>
                            <img
                              src={editConfig._qrData.qr_image}
                              alt="WhatsApp QR Code"
                              className="rounded-lg"
                              width={250}
                              height={250}
                            />
                            <p className="text-sm font-medium text-center">{editConfig._qrData.message}</p>
                            <ol className="text-xs text-muted-foreground space-y-1 text-start" dir="rtl">
                              {(editConfig._qrData.instructions || []).map((inst: string, i: number) => (
                                <li key={i}>{inst}</li>
                              ))}
                            </ol>
                            <Button size="sm" variant="outline" onClick={async () => {
                              try {
                                const res = await api.get(tenantApi("/channels/whatsapp/qr"));
                                setEditConfig((prev: Record<string, any>) => ({ ...prev, _qrData: res.data }));
                              } catch { /* ignore */ }
                            }}>
                              🔄 רענן QR
                            </Button>
                          </>
                        ) : (
                          <div className="text-center space-y-2">
                            <div className="animate-spin text-2xl">⏳</div>
                            <p className="text-sm">{editConfig._qrData.message || "ממתין לקוד QR..."}</p>
                            <Button size="sm" variant="outline" onClick={async () => {
                              try {
                                const res = await api.get(tenantApi("/channels/whatsapp/qr"));
                                setEditConfig((prev: Record<string, any>) => ({ ...prev, _qrData: res.data }));
                              } catch { /* ignore */ }
                            }}>
                              🔄 נסה שוב
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Telegram Config */}
            {editChannel === "telegram" && (
              <>
                <div className="space-y-2">
                  <Label>Bot Token</Label>
                  <Input
                    value={editConfig.bot_token || ""}
                    onChange={(e) => setEditConfig({ ...editConfig, bot_token: e.target.value })}
                    placeholder="123456:ABC-DEF..."
                    dir="ltr"
                    type="password"
                  />
                  <p className="text-xs text-muted-foreground">
                    קבל את הטוקן מ-@BotFather ב-Telegram
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>שם הבוט</Label>
                  <Input
                    value={editConfig.bot_username || ""}
                    onChange={(e) => setEditConfig({ ...editConfig, bot_username: e.target.value })}
                    placeholder="@MySchedulerBot"
                    dir="ltr"
                  />
                </div>
              </>
            )}

            {/* Email Config */}
            {editChannel === "email" && (
              <>
                <div className="space-y-2">
                  <Label>ספק</Label>
                  <Select value={editProvider} onChange={(e) => setEditProvider(e.target.value)}>
                    <option value="">בחר...</option>
                    <option value="smtp">SMTP</option>
                    <option value="ses">AWS SES</option>
                    <option value="sendgrid">SendGrid</option>
                  </Select>
                </div>
                {editProvider === "smtp" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>SMTP Host</Label>
                        <Input
                          value={editConfig.smtp_host || ""}
                          onChange={(e) => setEditConfig({ ...editConfig, smtp_host: e.target.value })}
                          placeholder="smtp.gmail.com"
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Port</Label>
                        <Input
                          type="number"
                          value={editConfig.smtp_port || 587}
                          onChange={(e) => setEditConfig({ ...editConfig, smtp_port: Number(e.target.value) })}
                          dir="ltr"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input
                        value={editConfig.smtp_username || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, smtp_username: e.target.value })}
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input
                        type="password"
                        value={editConfig.smtp_password || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, smtp_password: e.target.value })}
                        dir="ltr"
                      />
                    </div>
                  </>
                )}
                {editProvider === "ses" && (
                  <>
                    <div className="space-y-2">
                      <Label>AWS Access Key</Label>
                      <Input
                        value={editConfig.aws_access_key || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, aws_access_key: e.target.value })}
                        dir="ltr"
                        type="password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>AWS Secret Key</Label>
                      <Input
                        value={editConfig.aws_secret_key || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, aws_secret_key: e.target.value })}
                        dir="ltr"
                        type="password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Region</Label>
                      <Input
                        value={editConfig.aws_region || "eu-west-1"}
                        onChange={(e) => setEditConfig({ ...editConfig, aws_region: e.target.value })}
                        dir="ltr"
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label>כתובת שולח</Label>
                  <Input
                    value={editConfig.from_address || ""}
                    onChange={(e) => setEditConfig({ ...editConfig, from_address: e.target.value })}
                    placeholder="noreply@example.com"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>שם שולח</Label>
                  <Input
                    value={editConfig.from_name || ""}
                    onChange={(e) => setEditConfig({ ...editConfig, from_name: e.target.value })}
                    placeholder="שבצק — מערכת שיבוצים"
                  />
                </div>
              </>
            )}

            {/* SMS Config */}
            {editChannel === "sms" && (
              <>
                <div className="space-y-2">
                  <Label>ספק</Label>
                  <Select value={editProvider} onChange={(e) => setEditProvider(e.target.value)}>
                    <option value="">בחר...</option>
                    <option value="twilio">Twilio</option>
                    <option value="sns">AWS SNS</option>
                  </Select>
                </div>
                {editProvider === "twilio" && (
                  <>
                    <div className="space-y-2">
                      <Label>Account SID</Label>
                      <Input
                        value={editConfig.account_sid || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, account_sid: e.target.value })}
                        dir="ltr"
                        type="password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Auth Token</Label>
                      <Input
                        value={editConfig.auth_token || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, auth_token: e.target.value })}
                        dir="ltr"
                        type="password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>From Number</Label>
                      <Input
                        value={editConfig.from_number || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, from_number: e.target.value })}
                        placeholder="+972..."
                        dir="ltr"
                      />
                    </div>
                  </>
                )}
                {editProvider === "sns" && (
                  <>
                    <div className="space-y-2">
                      <Label>AWS Access Key</Label>
                      <Input
                        value={editConfig.aws_access_key || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, aws_access_key: e.target.value })}
                        dir="ltr"
                        type="password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>AWS Secret Key</Label>
                      <Input
                        value={editConfig.aws_secret_key || ""}
                        onChange={(e) => setEditConfig({ ...editConfig, aws_secret_key: e.target.value })}
                        dir="ltr"
                        type="password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Region</Label>
                      <Input
                        value={editConfig.aws_region || "eu-west-1"}
                        onChange={(e) => setEditConfig({ ...editConfig, aws_region: e.target.value })}
                        dir="ltr"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {/* Enable toggle */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Label className="font-semibold">ערוץ פעיל</Label>
              <ToggleSwitch checked={editEnabled} onChange={setEditEnabled} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditChannel(null)}>ביטול</Button>
            <Button onClick={saveChannel} disabled={saving}>
              <Save className="me-1 h-4 w-4" />
              {saving ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
