import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { User, KeyRound, Globe, Bell, Save, Shield, Heart } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { isPushSupported, getPushPermission, subscribeToPush, isPushSubscribed, sendTestPush } from "@/lib/push";
import NotificationPreferences from "@/components/NotificationPreferences";
import EmployeePreferences from "@/components/EmployeePreferences";

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

  const loadProfile = useCallback(async () => {
    try {
      const res = await api.get(tenantApi("/my/profile"));
      setProfile(res.data);
      setEditForm({
        full_name: res.data.employee?.full_name || "",
        phone: res.data.employee?.notification_channels?.phone_whatsapp || "",
        preferred_language: res.data.user?.preferred_language || "he",
      });
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
      toast("error", e.response?.data?.detail || "שגיאה בעדכון");
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
      toast("error", e.response?.data?.detail || "שגיאה בשינוי סיסמה");
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
      toast("error", e.response?.data?.detail || "שגיאה");
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

      {/* Push Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            העדפות התראות
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm">התראות Push:</span>
            <Badge className={
              pushPermission === "granted" ? "bg-green-100 text-green-700" :
              pushPermission === "denied" ? "bg-red-100 text-red-700" :
              "bg-gray-100 text-gray-700"
            }>
              {pushPermission === "granted" ? "✅ מאושר" :
               pushPermission === "denied" ? "❌ חסום" :
               "⏳ לא נשאל"}
            </Badge>
            {pushSubscribed && <Badge className="bg-blue-100 text-blue-700">📡 פעיל</Badge>}
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
            <p className="text-xs text-red-600">
              ❌ התראות חסומות. לחץ על 🔒 ליד שורת הכתובת → הרשאות → התראות → אפשר
            </p>
          )}

          {/* Security info */}
          {profile?.user?.two_factor_enabled && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t">
              <Shield className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-700">אימות דו-שלבי מופעל</span>
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
