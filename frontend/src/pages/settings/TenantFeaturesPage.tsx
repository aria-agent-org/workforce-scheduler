import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Save, Palette, Globe, Zap, Loader2 } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";

interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  icon: string;
  enabled: boolean;
}

const DEFAULT_FEATURES: FeatureFlag[] = [
  { key: "channel_whatsapp", label: "WhatsApp", description: "אפשר לדייר להגדיר WhatsApp משלו", icon: "💬", enabled: true },
  { key: "channel_telegram", label: "Telegram Bot", description: "אפשר לדייר להגדיר בוט Telegram משלו", icon: "📨", enabled: true },
  { key: "channel_email", label: "אימייל מותאם", description: "אפשר שליחה מדומיין הדייר", icon: "✉️", enabled: true },
  { key: "channel_sms", label: "SMS", description: "אפשר שליחת SMS", icon: "📱", enabled: false },
  { key: "ai_bot", label: "בוט AI", description: "אפשר בוט AI חכם למשתמשים", icon: "🤖", enabled: false },
  { key: "custom_domain", label: "דומיין מותאם", description: "אפשר הגדרת דומיין מותאם", icon: "🌐", enabled: false },
  { key: "custom_branding", label: "מיתוג מלא", description: "לוגו, צבעים, דף כניסה מותאמים", icon: "🎨", enabled: false },
  { key: "advanced_scheduling", label: "שיבוץ מתקדם", description: "אלגוריתם שיבוץ מתקדם עם AI", icon: "⚡", enabled: true },
  { key: "google_sheets", label: "Google Sheets", description: "סנכרון עם Google Sheets", icon: "📊", enabled: true },
  { key: "auto_assign", label: "שיבוץ אוטומטי", description: "שיבוץ אוטומטי של חיילים", icon: "🎯", enabled: true },
];

export default function TenantFeaturesPage() {
  const { toast } = useToast();
  const [features, setFeatures] = useState<FeatureFlag[]>(DEFAULT_FEATURES);
  const [branding, setBranding] = useState({
    logo_url: "",
    favicon_url: "",
    app_name: "",
    primary_color: "#3b82f6",
    secondary_color: "#6b7280",
    accent_color: "#f59e0b",
    login_background_url: "",
    login_text: "",
    pwa_icon_url: "",
    pwa_name: "",
  });
  const [customDomain, setCustomDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(tenantApi("/channels/features"));
      const serverFeatures = res.data.features || {};
      setFeatures(prev => prev.map(f => ({
        ...f,
        enabled: serverFeatures[f.key] !== undefined ? serverFeatures[f.key] : f.enabled,
      })));
      if (res.data.branding) {
        setBranding(prev => ({ ...prev, ...res.data.branding }));
      }
      if (res.data.custom_domain) {
        setCustomDomain(res.data.custom_domain);
      }
    } catch { /* use defaults */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleFeature = (key: string) => {
    setFeatures(prev => prev.map(f =>
      f.key === key ? { ...f, enabled: !f.enabled } : f
    ));
  };

  const saveFeatures = async () => {
    setSaving(true);
    try {
      const featureMap: Record<string, boolean> = {};
      features.forEach(f => { featureMap[f.key] = f.enabled; });
      await api.put(tenantApi("/channels/features"), { features: featureMap });
      toast("success", "הגדרות פיצ׳רים נשמרו");
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה בשמירה"));
    } finally { setSaving(false); }
  };

  const saveBranding = async () => {
    setSaving(true);
    try {
      await api.put(tenantApi("/channels/branding"), branding);
      toast("success", "מיתוג נשמר בהצלחה");
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה בשמירת מיתוג"));
    } finally { setSaving(false); }
  };

  const saveDomain = async () => {
    setSaving(true);
    try {
      await api.put(tenantApi("/channels/custom-domain"), { domain: customDomain });
      toast("success", "דומיין נשמר");
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה"));
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const enabledCount = features.filter(f => f.enabled).length;

  return (
    <div className="space-y-6">
      {/* Feature Flags */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Zap className="h-5 w-5" />
              פיצ׳רים לדייר
            </h2>
            <p className="text-sm text-muted-foreground">
              {enabledCount}/{features.length} פיצ׳רים פעילים
            </p>
          </div>
          <Button onClick={saveFeatures} disabled={saving}>
            <Save className="me-1 h-4 w-4" />
            {saving ? "שומר..." : "שמור פיצ׳רים"}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {features.map(f => (
            <Card
              key={f.key}
              className={`transition-all cursor-pointer ${f.enabled ? "ring-1 ring-green-200 dark:ring-green-800" : "opacity-60"}`}
              onClick={() => toggleFeature(f.key)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xl flex-shrink-0">{f.icon}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{f.label}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{f.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFeature(f.key); }}
                    aria-label={`${f.label} ${f.enabled ? 'פעיל' : 'כבוי'}`}
                    className={`feature-toggle relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                      f.enabled ? "bg-green-500" : "bg-muted"
                    }`}
                    style={{ minWidth: '44px', minHeight: '28px' }}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      f.enabled ? "translate-x-[18px] rtl:-translate-x-[18px]" : "translate-x-0.5 rtl:-translate-x-0.5"
                    }`} />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Custom Domain */}
      {features.find(f => f.key === "custom_domain")?.enabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              דומיין מותאם
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>דומיין</Label>
              <Input
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="schedule.mycompany.com"
                dir="ltr"
              />
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-sm space-y-2">
                <p className="font-medium text-blue-800 dark:text-blue-200">🌐 הגדרת DNS — הוראות:</p>
                <ol className="space-y-1 text-blue-700 dark:text-blue-300 text-xs list-decimal list-inside">
                  <li>כנס ללוח הניהול של ספק הדומיין שלך (Cloudflare, GoDaddy, וכו׳)</li>
                  <li>הוסף רשומת DNS מסוג CNAME:</li>
                </ol>
                <div className="bg-white dark:bg-gray-900 rounded border p-2 font-mono text-xs" dir="ltr">
                  <div>Type: <strong>CNAME</strong></div>
                  <div>Name: <strong>{customDomain ? customDomain.split('.')[0] : 'schedule'}</strong></div>
                  <div>Target: <strong>shavtzak.site</strong></div>
                  <div>TTL: <strong>Auto</strong></div>
                </div>
                <p className="text-xs text-muted-foreground">⏱ שינויי DNS עשויים לקחת עד 48 שעות להתפשט</p>
              </div>
            </div>
            <Button size="sm" onClick={saveDomain} disabled={saving}>
              <Save className="me-1 h-4 w-4" />שמור דומיין
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Branding */}
      {features.find(f => f.key === "custom_branding")?.enabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4" />
              מיתוג מלא
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שם האפליקציה</Label>
                <Input
                  value={branding.app_name}
                  onChange={(e) => setBranding({ ...branding, app_name: e.target.value })}
                  placeholder="שבצק"
                />
              </div>
              <div className="space-y-2">
                <Label>שם PWA</Label>
                <Input
                  value={branding.pwa_name}
                  onChange={(e) => setBranding({ ...branding, pwa_name: e.target.value })}
                  placeholder="שבצק"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>צבע ראשי</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={branding.primary_color}
                    onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                    className="w-12 h-10 p-1"
                  />
                  <Input
                    value={branding.primary_color}
                    onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                    dir="ltr"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>צבע משני</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={branding.secondary_color}
                    onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                    className="w-12 h-10 p-1"
                  />
                  <Input
                    value={branding.secondary_color}
                    onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                    dir="ltr"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>צבע אקסנט</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={branding.accent_color}
                    onChange={(e) => setBranding({ ...branding, accent_color: e.target.value })}
                    className="w-12 h-10 p-1"
                  />
                  <Input
                    value={branding.accent_color}
                    onChange={(e) => setBranding({ ...branding, accent_color: e.target.value })}
                    dir="ltr"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>URL לוגו</Label>
                <Input
                  value={branding.logo_url}
                  onChange={(e) => setBranding({ ...branding, logo_url: e.target.value })}
                  placeholder="https://..."
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>URL Favicon</Label>
                <Input
                  value={branding.favicon_url}
                  onChange={(e) => setBranding({ ...branding, favicon_url: e.target.value })}
                  placeholder="https://..."
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>טקסט דף כניסה</Label>
              <Input
                value={branding.login_text}
                onChange={(e) => setBranding({ ...branding, login_text: e.target.value })}
                placeholder="ברוכים הבאים למערכת השיבוצים"
              />
            </div>

            <div className="space-y-2">
              <Label>URL רקע דף כניסה</Label>
              <Input
                value={branding.login_background_url}
                onChange={(e) => setBranding({ ...branding, login_background_url: e.target.value })}
                placeholder="https://..."
                dir="ltr"
              />
            </div>

            {/* Preview */}
            {(branding.logo_url || branding.primary_color !== "#3b82f6") && (
              <div className="border rounded-lg p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">תצוגה מקדימה:</p>
                <div className="flex items-center gap-3">
                  {branding.logo_url && (
                    <img src={branding.logo_url} alt="logo" className="h-10 w-10 rounded object-contain" />
                  )}
                  <span className="text-lg font-bold" style={{ color: branding.primary_color }}>
                    {branding.app_name || "שבצק"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="h-8 w-20 rounded" style={{ backgroundColor: branding.primary_color }} />
                  <div className="h-8 w-20 rounded" style={{ backgroundColor: branding.secondary_color }} />
                  <div className="h-8 w-20 rounded" style={{ backgroundColor: branding.accent_color }} />
                </div>
              </div>
            )}

            <Button onClick={saveBranding} disabled={saving}>
              <Save className="me-1 h-4 w-4" />
              {saving ? "שומר..." : "שמור מיתוג"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
