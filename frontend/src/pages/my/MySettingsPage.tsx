import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { User, Shield, Bell, Lock, Palette, Fingerprint, Sun, Moon, Monitor, Save, Trash2, Smartphone, Laptop, RefreshCw } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useThemeStore } from "@/stores/themeStore";
import { getErrorMessage } from "@/lib/errorUtils";
import NotificationPreferences from "@/components/NotificationPreferences";

type SettingsTab = "profile" | "security" | "notifications" | "password" | "theme";

const supportsWebAuthn = typeof window !== "undefined" && !!window.PublicKeyCredential;

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function MySettingsPage() {
  const { toast } = useToast();
  const user = useAuthStore(s => s.user);
  const fetchUser = useAuthStore(s => s.fetchUser);
  const { theme, setTheme } = useThemeStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [saving, setSaving] = useState(false);

  // Profile
  const [email, setEmail] = useState(user?.email || "");
  const [language, setLanguage] = useState(user?.preferred_language || "he");

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Security keys
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeys, setPasskeys] = useState<Array<{ id: string; device_name: string; created_at: string | null; last_used_at: string | null; backed_up: boolean }>>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setEmail(user.email || "");
      setLanguage(user.preferred_language || "he");
    }
  }, [user]);

  const fetchPasskeys = useCallback(async () => {
    if (!supportsWebAuthn) return;
    setPasskeysLoading(true);
    try {
      const { data } = await api.get("/auth/webauthn/credentials");
      setPasskeys(Array.isArray(data) ? data : []);
    } catch {
      // silently ignore
    } finally {
      setPasskeysLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "security") {
      fetchPasskeys();
    }
  }, [activeTab, fetchPasskeys]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.patch("/auth/me", { preferred_language: language });
      await fetchUser();
      toast("success", "הפרופיל עודכן בהצלחה");
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בעדכון פרופיל"));
    } finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (newPassword !== confirmPassword) { toast("error", "הסיסמאות לא תואמות"); return; }
    if (newPassword.length < 8) { toast("error", "סיסמה חייבת להכיל לפחות 8 תווים"); return; }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: currentPassword, new_password: newPassword });
      toast("success", "הסיסמה שונתה בהצלחה");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בשינוי סיסמה"));
    } finally { setSaving(false); }
  };

  const registerPasskey = async () => {
    setPasskeyLoading(true);
    try {
      const { data: options } = await api.post("/auth/webauthn/register/begin");
      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        challenge: base64urlToBuffer(options.challenge),
        rp: { id: options.rp.id, name: options.rp.name },
        user: {
          id: base64urlToBuffer(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        excludeCredentials: (options.excludeCredentials || []).map((c: any) => ({
          id: base64urlToBuffer(c.id), type: c.type, transports: c.transports,
        })),
        authenticatorSelection: options.authenticatorSelection,
        attestation: options.attestation || "none",
      };

      const credential = await navigator.credentials.create({ publicKey: publicKeyOptions }) as PublicKeyCredential;
      if (!credential) { toast("error", "הפעולה בוטלה"); return; }

      const response = credential.response as AuthenticatorAttestationResponse;
      await api.post("/auth/webauthn/register/finish", {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          attestationObject: bufferToBase64url(response.attestationObject),
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
        },
        device_name: navigator.userAgent.includes("Mobile") ? "טלפון נייד" : "מחשב",
      });
      toast("success", "מפתח האבטחה נרשם בהצלחה! 🔑");
      await fetchPasskeys();
    } catch (err: any) {
      if (err?.name === "NotAllowedError") toast("error", "הפעולה בוטלה");
      else toast("error", err?.response?.data?.detail || "שגיאה ברישום מפתח אבטחה");
    } finally { setPasskeyLoading(false); }
  };

  const deletePasskey = async (id: string) => {
    setDeletingPasskeyId(id);
    try {
      await api.delete(`/auth/webauthn/credentials/${id}`);
      toast("success", "מפתח האבטחה נמחק");
      setPasskeys(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה במחיקת מפתח אבטחה"));
    } finally {
      setDeletingPasskeyId(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
    } catch { return dateStr; }
  };

  const tabs: Array<{ key: SettingsTab; label: string; icon: any }> = [
    { key: "profile", label: "פרופיל", icon: User },
    { key: "security", label: "אבטחה", icon: Shield },
    { key: "notifications", label: "התראות", icon: Bell },
    { key: "password", label: "סיסמה", icon: Lock },
    { key: "theme", label: "עיצוב", icon: Palette },
  ];

  return (
    <div className="space-y-4 pb-20">
      <h2 className="text-xl font-bold">הגדרות</h2>

      {/* Tab Navigation */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2" role="tablist" aria-label="טאבים הגדרות">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all min-h-[44px] ${
              activeTab === key
                ? "bg-primary-500 text-white shadow-elevation-2"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <Card className="shadow-elevation-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" /> פרופיל אישי
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>אימייל</Label>
              <Input value={email} disabled dir="ltr" className="min-h-[44px] bg-muted/50" aria-label="כתובת אימייל" />
              <p className="text-xs text-muted-foreground">לא ניתן לשנות אימייל. פנה למנהל.</p>
            </div>
            <div className="space-y-2">
              <Label>שפה</Label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[44px]"
                aria-label="בחירת שפה"
              >
                <option value="he">עברית</option>
                <option value="en">English</option>
              </select>
            </div>
            <Button onClick={saveProfile} disabled={saving} className="min-h-[44px]">
              <Save className="h-4 w-4 me-2" />
              {saving ? "שומר..." : "שמור שינויים"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Security Tab */}
      {activeTab === "security" && (
        <Card className="shadow-elevation-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" /> אבטחה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* WebAuthn / Passkey */}
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-primary-500" />
                  <h3 className="font-semibold">מפתחות אבטחה (Passkeys)</h3>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="min-h-[36px]" onClick={fetchPasskeys} disabled={passkeysLoading} title="רענן">
                    <RefreshCw className={`h-4 w-4 ${passkeysLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                הוסף מפתח אבטחה פיזי או ביומטרי לכניסה מהירה ובטוחה. מקסימום 5 מפתחות.
              </p>

              {/* Existing passkeys list */}
              {passkeys.length > 0 && (
                <div className="space-y-2">
                  {passkeys.map((pk) => (
                    <div key={pk.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {pk.device_name?.includes("טלפון") || pk.device_name?.includes("Mobile") ? (
                          <Smartphone className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <Laptop className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{pk.device_name || "מפתח אבטחה"}</p>
                          <p className="text-xs text-muted-foreground">
                            נוסף: {formatDate(pk.created_at)}
                            {pk.last_used_at && ` · שימוש אחרון: ${formatDate(pk.last_used_at)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {pk.backed_up && <Badge className="bg-green-100 text-green-700 text-xs">מגובה</Badge>}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-[36px] text-red-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => deletePasskey(pk.id)}
                          disabled={deletingPasskeyId === pk.id}
                          title="מחק מפתח"
                        >
                          {deletingPasskeyId === pk.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {passkeys.length === 0 && !passkeysLoading && supportsWebAuthn && (
                <p className="text-sm text-muted-foreground text-center py-2">אין מפתחות אבטחה רשומים</p>
              )}

              {supportsWebAuthn ? (
                <Button
                  onClick={registerPasskey}
                  disabled={passkeyLoading || passkeys.length >= 5}
                  variant="outline"
                  className="min-h-[44px]"
                >
                  <Fingerprint className="h-4 w-4 me-2" />
                  {passkeyLoading ? "רושם..." : passkeys.length >= 5 ? "הגעת למקסימום מפתחות (5)" : "הוסף מפתח אבטחה"}
                </Button>
              ) : (
                <p className="text-sm text-amber-600">הדפדפן שלך לא תומך במפתחות אבטחה</p>
              )}
            </div>

            {/* 2FA Status */}
            <div className="rounded-xl border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  <h3 className="font-semibold">אימות דו-שלבי (2FA)</h3>
                </div>
                <Badge className={user?.two_factor_enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                  {user?.two_factor_enabled ? "✓ מופעל" : "לא מופעל"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {user?.two_factor_enabled
                  ? "אימות דו-שלבי מופעל. הכניסה שלך מוגנת."
                  : "הפעל אימות דו-שלבי להגנה נוספת. ניתן להפעיל דרך דף האבטחה המלא."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notifications Tab */}
      {activeTab === "notifications" && (
        <Card className="shadow-elevation-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5" /> הגדרות התראות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationPreferences />
          </CardContent>
        </Card>
      )}

      {/* Password Tab */}
      {activeTab === "password" && (
        <Card className="shadow-elevation-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="h-5 w-5" /> שינוי סיסמה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-pw">סיסמה נוכחית</Label>
              <Input
                id="current-pw"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                dir="ltr"
                className="min-h-[44px]"
                aria-label="סיסמה נוכחית"
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pw">סיסמה חדשה</Label>
              <Input
                id="new-pw"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                dir="ltr"
                className="min-h-[44px]"
                aria-label="סיסמה חדשה"
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">לפחות 8 תווים</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pw">אישור סיסמה</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                dir="ltr"
                className={`min-h-[44px] ${confirmPassword && newPassword !== confirmPassword ? "border-red-500" : ""}`}
                aria-label="אישור סיסמה חדשה"
                autoComplete="new-password"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-600" role="alert">הסיסמאות לא תואמות</p>
              )}
            </div>
            <Button
              onClick={changePassword}
              disabled={saving || !currentPassword || !newPassword || newPassword !== confirmPassword}
              className="min-h-[44px]"
            >
              <Lock className="h-4 w-4 me-2" />
              {saving ? "משנה..." : "שנה סיסמה"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Theme Tab */}
      {activeTab === "theme" && (
        <Card className="shadow-elevation-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Palette className="h-5 w-5" /> עיצוב
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "light" as const, icon: Sun, label: "בהיר", desc: "מצב יום" },
                { key: "dark" as const, icon: Moon, label: "כהה", desc: "מצב לילה" },
                { key: "system" as const, icon: Monitor, label: "מערכת", desc: "לפי ההגדרות" },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setTheme(opt.key)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all min-h-[44px] ${
                    theme === opt.key
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-elevation-2"
                      : "border-muted hover:border-primary-300"
                  }`}
                  role="radio"
                  aria-checked={theme === opt.key}
                  aria-label={`ערכת נושא: ${opt.label}`}
                >
                  <opt.icon className={`h-8 w-8 ${theme === opt.key ? "text-primary-500" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.desc}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
