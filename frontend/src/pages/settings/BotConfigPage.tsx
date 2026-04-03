import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  Bot, MessageCircle, Send, Key, Plus, Copy, Trash2, Save, Sparkles, ToggleLeft, ToggleRight, Loader2
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import HelpTooltip from "@/components/common/HelpTooltip";

interface BotPlatformConfig {
  is_enabled: boolean;
  bot_name: string;
  welcome_message: string;
  token: string;
}

interface RegistrationToken {
  id: string;
  token: string;
  employee_id: string;
  employee_name?: string;
  platform: string;
  expires_at: string;
  used_at: string | null;
}

const BOT_ACTIONS = [
  { key: "check_schedule", label_he: "צפייה בלוח שיבוצים", label_en: "View Schedule" },
  { key: "report_absence", label_he: "דיווח היעדרות", label_en: "Report Absence" },
  { key: "swap_request", label_he: "בקשת החלפה", label_en: "Swap Request" },
  { key: "check_attendance", label_he: "צפייה בנוכחות", label_en: "View Attendance" },
  { key: "update_status", label_he: "עדכון סטטוס", label_en: "Update Status" },
  { key: "get_notifications", label_he: "קבלת התראות", label_en: "Get Notifications" },
  { key: "contact_commander", label_he: "פנייה למפקד", label_en: "Contact Commander" },
  { key: "help", label_he: "עזרה", label_en: "Help" },
];

export default function BotConfigPage() {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [whatsapp, setWhatsapp] = useState<BotPlatformConfig>({
    is_enabled: false,
    bot_name: "שבצק בוט",
    welcome_message: "שלום! אני הבוט של שבצק. איך אוכל לעזור?",
    token: "",
  });

  const [telegram, setTelegram] = useState<BotPlatformConfig>({
    is_enabled: false,
    bot_name: "ShavtzakBot",
    welcome_message: "Hello! I'm the Shavtzak bot.",
    token: "",
  });

  const [allowedActions, setAllowedActions] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    BOT_ACTIONS.forEach(a => { defaults[a.key] = true; });
    return defaults;
  });

  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("אתה עוזר צבאי ידידותי. עזור לחיילים עם שאלות לגבי שיבוצים, נוכחות ולוח זמנים.");
  const [aiModel, setAiModel] = useState("gpt-4o-mini");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiOnlyRegistered, setAiOnlyRegistered] = useState(true);
  const [testingApi, setTestingApi] = useState(false);
  const [tokens, setTokens] = useState<RegistrationToken[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bulkCount, setBulkCount] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, tokensRes] = await Promise.all([
        api.get(tenantApi("/settings")).catch(() => ({ data: [] })),
        api.get(tenantApi("/settings/bot-tokens")).catch(() => ({ data: [] })),
      ]);

      // Load from settings
      const settings = settingsRes.data || [];
      for (const s of settings) {
        if (s.key === "bot_whatsapp") setWhatsapp(prev => ({ ...prev, ...s.value }));
        if (s.key === "bot_telegram") setTelegram(prev => ({ ...prev, ...s.value }));
        if (s.key === "bot_allowed_actions") setAllowedActions(prev => ({ ...prev, ...s.value }));
        if (s.key === "bot_ai_enabled") setAiEnabled(s.value === true);
        if (s.key === "bot_ai_prompt") setAiPrompt(s.value || aiPrompt);
        if (s.key === "bot_ai_model") setAiModel(s.value || "gpt-4o-mini");
        if (s.key === "bot_ai_api_key") setAiApiKey(s.value || "");
        if (s.key === "bot_ai_only_registered") setAiOnlyRegistered(s.value !== false);
      }

      setTokens(tokensRes.data || []);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveAll = async () => {
    setSaving(true);
    try {
      const pairs = [
        { key: "bot_whatsapp", value: whatsapp, group: "bot" },
        { key: "bot_telegram", value: telegram, group: "bot" },
        { key: "bot_allowed_actions", value: allowedActions, group: "bot" },
        { key: "bot_ai_enabled", value: aiEnabled, group: "bot" },
        { key: "bot_ai_prompt", value: aiPrompt, group: "bot" },
        { key: "bot_ai_model", value: aiModel, group: "bot" },
        { key: "bot_ai_api_key", value: aiApiKey, group: "bot" },
        { key: "bot_ai_only_registered", value: aiOnlyRegistered, group: "bot" },
      ];
      for (const pair of pairs) {
        await api.post(tenantApi("/settings"), pair).catch(() =>
          api.patch(tenantApi(`/settings/${pair.key}`), pair).catch(() => {})
        );
      }
      toast("success", "הגדרות בוט נשמרו");
    } catch (e) {
      toast("error", "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  const testApiKey = async () => {
    if (!aiApiKey) { toast("error", "הזן מפתח API תחילה"); return; }
    setTestingApi(true);
    try {
      const res = await api.post(tenantApi("/settings/ai-bot-config/test"), {
        model: aiModel,
        api_key: aiApiKey,
      }).catch(async () => {
        // Fallback: try a generic endpoint or just validate format
        return null;
      });
      if (res?.data?.success) {
        toast("success", `✅ מפתח API תקין — ${res.data.message || "הבדיקה עברה בהצלחה"}`);
      } else {
        // Basic format check
        const isOpenAI = aiApiKey.startsWith("sk-");
        const isAnthropic = aiApiKey.startsWith("sk-ant-");
        const isGoogle = aiApiKey.startsWith("AIza");
        if (isOpenAI || isAnthropic || isGoogle) {
          toast("success", "✅ פורמט המפתח נראה תקין (בדיקת חיבור לא זמינה)");
        } else {
          toast("error", "⚠️ פורמט המפתח לא נראה תקין. בדוק שוב.");
        }
      }
    } catch {
      toast("error", "שגיאה בבדיקת המפתח");
    } finally {
      setTestingApi(false);
    }
  };

  const generateToken = async () => {
    try {
      const res = await api.post(tenantApi("/settings/bot-tokens"), { count: 1 });
      setTokens(prev => [...prev, ...(res.data || [])]);
      toast("success", "טוקן נוצר");
    } catch (e) {
      toast("error", "שגיאה");
    }
  };

  const generateBulkTokens = async () => {
    try {
      const res = await api.post(tenantApi("/settings/bot-tokens"), { count: bulkCount });
      setTokens(prev => [...prev, ...(res.data || [])]);
      toast("success", `${bulkCount} טוקנים נוצרו`);
    } catch (e) {
      toast("error", "שגיאה");
    }
  };

  const deleteToken = async (tokenId: string) => {
    try {
      await api.delete(tenantApi(`/settings/bot-tokens/${tokenId}`));
      setTokens(prev => prev.filter(t => t.id !== tokenId));
      toast("success", "טוקן נמחק");
    } catch (e) {
      toast("error", "שגיאה");
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast("success", "טוקן הועתק");
  };

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-40 bg-muted rounded-lg" /><div className="h-40 bg-muted rounded-lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-amber-600" />
            {lang === "he" ? "הגדרות בוט" : "Bot Configuration"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "he" ? "הגדר בוטים של WhatsApp ו-Telegram" : "Configure WhatsApp and Telegram bots"}
          </p>
        </div>
        <Button onClick={saveAll} disabled={saving}>
          <Save className="me-1 h-4 w-4" />{saving ? "שומר..." : "שמור הכל"}
        </Button>
      </div>

      {/* WhatsApp Config */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-500" /> WhatsApp Bot
            </CardTitle>
            <button onClick={() => setWhatsapp(prev => ({ ...prev, is_enabled: !prev.is_enabled }))}>
              {whatsapp.is_enabled ? <ToggleRight className="h-8 w-8 text-green-500" /> : <ToggleLeft className="h-8 w-8 text-muted-foreground" />}
            </button>
          </div>
        </CardHeader>
        {whatsapp.is_enabled && (
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>שם הבוט</Label>
                <Input value={whatsapp.bot_name} onChange={e => setWhatsapp(prev => ({ ...prev, bot_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>הודעת פתיחה</Label>
                <Input value={whatsapp.welcome_message} onChange={e => setWhatsapp(prev => ({ ...prev, welcome_message: e.target.value }))} />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Telegram Config */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary-500" /> Telegram Bot
            </CardTitle>
            <button onClick={() => setTelegram(prev => ({ ...prev, is_enabled: !prev.is_enabled }))}>
              {telegram.is_enabled ? <ToggleRight className="h-8 w-8 text-green-500" /> : <ToggleLeft className="h-8 w-8 text-muted-foreground" />}
            </button>
          </div>
        </CardHeader>
        {telegram.is_enabled && (
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>שם הבוט</Label>
                <Input value={telegram.bot_name} onChange={e => setTelegram(prev => ({ ...prev, bot_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  Bot Token
                  <HelpTooltip content={{ he: "קבל טוקן מ-@BotFather בטלגרם", en: "Get a token from @BotFather on Telegram" }} />
                </Label>
                <Input
                  value={telegram.token}
                  onChange={e => setTelegram(prev => ({ ...prev, token: e.target.value }))}
                  placeholder="123456:ABC-DEF..."
                  dir="ltr"
                  type="password"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Allowed Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{lang === "he" ? "פעולות מותרות" : "Allowed Actions"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {BOT_ACTIONS.map(action => (
              <label key={action.key} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={allowedActions[action.key] ?? true}
                  onChange={e => setAllowedActions(prev => ({ ...prev, [action.key]: e.target.checked }))}
                  className="h-4 w-4"
                />
                <span className="text-sm">{lang === "he" ? action.label_he : action.label_en}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI Bot Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              {lang === "he" ? "בוט AI — הגדרות" : "AI Bot Configuration"}
            </CardTitle>
            <button onClick={() => setAiEnabled(!aiEnabled)}>
              {aiEnabled ? <ToggleRight className="h-8 w-8 text-green-500" /> : <ToggleLeft className="h-8 w-8 text-muted-foreground" />}
            </button>
          </div>
        </CardHeader>
        {aiEnabled && (
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-primary-50 dark:bg-primary-900/30 p-3 text-sm text-primary-800 dark:text-primary-200">
              💡 {lang === "he" ? "הבוט ישתמש ב-AI רק אם גם ערוץ תקשורת (Telegram/WhatsApp) מוגדר ופעיל" : "The bot uses AI only if a communication channel (Telegram/WhatsApp) is configured and enabled"}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{lang === "he" ? "מודל AI" : "AI Model"}</Label>
                <select
                  value={aiModel}
                  onChange={e => setAiModel(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="gpt-4o-mini">GPT-4o Mini (OpenAI) — מהיר וחסכוני</option>
                  <option value="gpt-4o">GPT-4o (OpenAI) — חזק ביותר</option>
                  <option value="claude-3-haiku-20240307">Claude 3 Haiku (Anthropic) — מהיר</option>
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Anthropic) — חכם</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Google) — חסכוני</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (Google) — חזק</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{lang === "he" ? "מפתח API" : "API Key"}</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={aiApiKey}
                    onChange={e => setAiApiKey(e.target.value)}
                    placeholder="sk-... / AIza... / claude-..."
                    dir="ltr"
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={testApiKey}
                    disabled={testingApi || !aiApiKey}
                    className="min-h-[44px] whitespace-nowrap"
                  >
                    {testingApi ? <Loader2 className="h-4 w-4 animate-spin" /> : "🧪 בדוק"}
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>System Prompt {lang === "he" ? "(הנחיות לבוט)" : "(Bot instructions)"}</Label>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                dir="rtl"
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer rounded-lg border p-3 hover:bg-muted/50">
              <input
                type="checkbox"
                checked={aiOnlyRegistered}
                onChange={e => setAiOnlyRegistered(e.target.checked)}
                className="h-4 w-4"
              />
              <div>
                <p className="text-sm font-medium">{lang === "he" ? "הגב רק למשתמשים רשומים" : "Reply only to registered users"}</p>
                <p className="text-xs text-muted-foreground">{lang === "he" ? "הבוט יתעלם ממי שאינו רשום במערכת" : "Bot will ignore unregistered users"}</p>
              </div>
            </label>
          </CardContent>
        )}
      </Card>

      {/* Registration Tokens */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {lang === "he" ? "טוקני הרשמה" : "Registration Tokens"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={generateToken}>
                <Plus className="me-1 h-4 w-4" />טוקן בודד
              </Button>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={bulkCount}
                  onChange={e => setBulkCount(parseInt(e.target.value) || 10)}
                  className="w-16 text-center"
                />
                <Button size="sm" onClick={generateBulkTokens}>יצירה בכמות</Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">אין טוקנים</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {tokens.map(tok => (
                <div key={tok.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div className="flex items-center gap-3">
                    <code className="rounded bg-muted px-2 py-1 text-xs font-mono">{tok.token.slice(0, 12)}...</code>
                    <Badge>{tok.platform}</Badge>
                    {tok.used_at ? (
                      <Badge className="bg-green-100 text-green-700">נוצל</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700">פעיל</Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => copyToken(tok.token)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteToken(tok.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
