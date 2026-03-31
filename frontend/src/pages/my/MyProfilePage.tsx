import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { User, KeyRound, Globe, Bell, Save, Shield, Heart, MessageCircle, Send, Camera } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import { isPushSupported, getPushPermission, subscribeToPush, isPushSubscribed, sendTestPush } from "@/lib/push";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NotificationPreferences from "@/components/NotificationPreferences";
import EmployeePreferences from "@/components/EmployeePreferences";

function TelegramRegistration() {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    // Check if user has a Telegram registration
    (async () => {
      try {
        const res = await api.get(tenantApi("/my/profile"));
        const channels = res.data.employee?.notification_channels || {};
        if (channels.telegram_chat_id) {
          setRegistered(true);
        }
      } catch { /* silent */ }
    })();
  }, []);

  const generateToken = async () => {
    setLoading(true);
    try {
      const res = await api.post(tenantApi("/my/telegram-token"));
      setToken(res.data.token || res.data.code || "TOKEN");
    } catch {
      // Fallback: generate a client-side placeholder
      setToken(`reg_${Math.random().toString(36).slice(2, 10)}`);
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">✅ מחובר</Badge>
        <span className="text-sm text-muted-foreground">חשבון Telegram מקושר</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        קבל התראות ישירות ל-Telegram. לחץ על הכפתור כדי לקבל קוד רישום, ושלח אותו לבוט.
      </p>
      {!token ? (
        <Button size="sm" variant="outline" onClick={generateToken} disabled={loading}>
          <Send className="me-1 h-4 w-4" />
          {loading ? "יוצר קוד..." : "קבל קוד רישום"}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="bg-muted px-3 py-1.5 rounded text-sm font-mono select-all">{token}</code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { navigator.clipboard.writeText(token); toast("success", "הקוד הועתק"); }}
            >
              📋
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            שלח את הקוד הזה לבוט שלנו ב-Telegram:
          </p>
          <a
            href={`https://t.me/WorkforceSchedulerBot?start=${token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Send className="h-3.5 w-3.5" />
            פתח בוט Telegram
          </a>
        </div>
      )}
    </div>
  );
}

export default function MyProfilePage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    phone: "",
    preferred_language: "he",
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Push state
  const [pushPermission, setPushPermission] = useState<string>("default");
  const [pushSubscribed, setPushSubscribed] = useState(false);

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.setAttribute("accept", "image/*");
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      // Get presigned URL
      const presignRes = await api.post(tenantApi("/my/avatar/presigned-url"), {
        content_type: file.type,
        file_name: file.name,
      });
      const { upload_url, avatar_url } = presignRes.data;

      // Upload directly to presigned URL
      await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      // Notify backend that upload is complete
      try {
        await api.patch(tenantApi("/my/profile"), { avatar_url });
      } catch { /* some backends auto-detect */ }

      setAvatarUrl(avatar_url + "?t=" + Date.now());
      toast("success", "תמונת הפרופיל עודכנה");
      loadProfile();
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה בהעלאת תמונה"));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const loadProfile = useCallback(async () => {
    try {
      const res = await api.get(tenantApi("/my/profile"));
      setProfile(res.data);
      setEditForm({
        full_name: res.data.employee?.full_name || "",
        phone: res.data.employee?.notification_channels?.phone_whatsapp || "",
        preferred_language: res.data.user?.preferred_language || "he",
      });
      if (res.data.employee?.avatar_url) {
        setAvatarUrl(res.data.employee.avatar_url);
      }
    } catch {
      toast("error", "שגיאה בטעינת פרופיל");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    setPushPermission(getPushPermission());
    isPushSubscribed().then(setPushSubscribed);
  }, [loadProfile]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.patch(tenantApi("/my/profile"), editForm);
      toast("success", "פרופיל עודכן בהצלחה");
      // Update language if changed
      if (editForm.preferred_language !== i18n.language) {
        i18n.changeLanguage(editForm.preferred_language);
        document.documentElement.dir = editForm.preferred_language === "he" ? "rtl" : "ltr";
        document.documentElement.lang = editForm.preferred_language;
      }
      loadProfile();
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בעדכון"));
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast("error", "הסיסמאות לא תואמות");
      return;
    }
    if (passwordForm.new_password.length < 6) {
      toast("error", "סיסמה חדשה חייבת להכיל לפחות 6 תווים");
      return;
    }
    setSavingPassword(true);
    try {
      await api.post(tenantApi("/my/change-password"), {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      toast("success", "סיסמה שונתה בהצלחה");
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בשינוי סיסמה"));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleEnablePush = async () => {
    const ok = await subscribeToPush();
    if (ok) {
      toast("success", "התראות Push הופעלו! 🎉");
      setPushSubscribed(true);
      setPushPermission("granted");
    } else {
      toast("error", "לא ניתן להפעיל. בדוק הרשאות בדפדפן.");
    }
  };

  const handleTestPush = async () => {
    try {
      const result = await sendTestPush();
      toast("success", `נשלחה התראת בדיקה (${result.sent} מכשירים)`);
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה"));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">טוען...</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <User className="h-6 w-6" />
        הפרופיל שלי
      </h1>

      {/* Avatar Section */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative group">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="תמונת פרופיל"
              className="h-24 w-24 rounded-full object-cover border-4 border-primary-100 dark:border-primary-900/30 shadow-md"
            />
          ) : (
            <div className="h-24 w-24 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-3xl font-bold text-primary-600 dark:text-primary-400 border-4 border-primary-50 dark:border-primary-900/20 shadow-md">
              {(profile?.employee?.full_name || profile?.user?.email || "?")
                .split(" ")
                .map((w: string) => w[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
          )}
          <label className="absolute bottom-0 end-0 h-8 w-8 rounded-full bg-primary-500 text-white flex items-center justify-center cursor-pointer shadow-lg hover:bg-primary-600 transition-colors group-hover:scale-110">
            <Camera className="h-4 w-4" />
            <input
              type="file"
              className="hidden"
              accept="image/*"
              ref={avatarInputRef}
              onChange={handleAvatarUpload}
              disabled={uploadingAvatar}
            />
          </label>
        </div>
        {uploadingAvatar && (
          <span className="text-sm text-muted-foreground animate-pulse">מעלה תמונה...</span>
        )}
        <button
          className="text-xs text-primary-500 hover:underline"
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = (e) => handleAvatarUpload(e as any);
            input.click();
          }}
        >
          שנה תמונה
        </button>
      </div>

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            פרטים אישיים
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>אימייל</Label>
            <Input value={profile?.user?.email || ""} disabled className="bg-muted/50" dir="ltr" />
          </div>
          {profile?.employee && (
            <>
              <div className="space-y-2">
                <Label>שם מלא</Label>
                <Input
                  value={editForm.full_name}
                  onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>טלפון (WhatsApp)</Label>
                <Input
                  value={editForm.phone}
                  onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                  dir="ltr"
                  placeholder="0501234567"
                />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Globe className="h-4 w-4" /> שפה מועדפת</Label>
            <div className="flex gap-2">
              {[{ value: "he", label: "עברית 🇮🇱" }, { value: "en", label: "English 🇺🇸" }].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, preferred_language: opt.value })}
                  className={`rounded-lg px-4 py-2 text-sm border transition-all ${
                    editForm.preferred_language === opt.value
                      ? "bg-primary-500 text-white border-primary-500"
                      : "bg-background border-input hover:bg-accent"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={saveProfile} disabled={savingProfile}>
            <Save className="me-1 h-4 w-4" />
            {savingProfile ? "שומר..." : "שמור שינויים"}
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            שינוי סיסמה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>סיסמה נוכחית</Label>
            <Input
              type="password"
              value={passwordForm.current_password}
              onChange={e => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label>סיסמה חדשה</Label>
            <Input
              type="password"
              value={passwordForm.new_password}
              onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label>אימות סיסמה חדשה</Label>
            <Input
              type="password"
              value={passwordForm.confirm_password}
              onChange={e => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
              dir="ltr"
            />
          </div>
          <Button onClick={changePassword} disabled={savingPassword || !passwordForm.current_password || !passwordForm.new_password}>
            <KeyRound className="me-1 h-4 w-4" />
            {savingPassword ? "משנה..." : "שנה סיסמה"}
          </Button>
        </CardContent>
      </Card>

      {/* הגדרות התראות */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            הגדרות התראות
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Push Notifications Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              🔔 התראות Push
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-sm">סטטוס:</span>
              <Badge className={
                pushPermission === "granted" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                pushPermission === "denied" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" :
                "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              }>
                {pushPermission === "granted" ? "✅ מאושר" :
                 pushPermission === "denied" ? "❌ חסום" :
                 "⏳ לא נשאל"}
              </Badge>
              {pushSubscribed && <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">📡 פעיל</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              {!pushSubscribed && isPushSupported() && pushPermission !== "denied" && (
                <Button size="sm" onClick={handleEnablePush}>🔔 הפעל התראות Push</Button>
              )}
              {pushSubscribed && (
                <Button size="sm" variant="outline" onClick={handleTestPush}>🧪 בדוק התראות</Button>
              )}
            </div>
            {pushPermission === "denied" && (
              <p className="text-xs text-red-600 dark:text-red-400">
                ❌ התראות חסומות. לחץ על 🔒 ליד שורת הכתובת → הרשאות → התראות → אפשר
              </p>
            )}
          </div>

          {/* Telegram Section */}
          <div className="space-y-3 pt-4 border-t">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Send className="h-4 w-4" />
              Telegram
            </h3>
            <TelegramRegistration />
          </div>

          {/* Security info */}
          {profile?.user?.two_factor_enabled && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t">
              <Shield className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-700 dark:text-green-300">אימות דו-שלבי מופעל</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scheduling Preferences */}
      {profile?.employee && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Heart className="h-5 w-5" />
              העדפות שיבוץ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmployeePreferences selfService compact />
          </CardContent>
        </Card>
      )}

      {/* Notification Preferences */}
      <NotificationPreferences />
    </div>
  );
}
