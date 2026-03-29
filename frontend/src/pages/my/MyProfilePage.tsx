import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { UserCircle, Mail, Phone, Globe, Save } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import LoadingSpinner from "@/components/common/LoadingSpinner";

export default function MyProfilePage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", preferred_language: "he" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(tenantApi("/my/profile"));
      setProfile(res.data);
      setForm({
        full_name: res.data.employee?.full_name || "",
        phone: res.data.employee?.notification_channels?.phone_whatsapp || "",
        preferred_language: res.data.user?.preferred_language || "he",
      });
    } catch {
      toast("error", "שגיאה בטעינת פרופיל");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(tenantApi("/my/profile"), form);
      toast("success", "הפרופיל עודכן בהצלחה");
    } catch {
      toast("error", "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <UserCircle className="h-5 w-5 text-primary-500" />
        הפרופיל שלי
      </h2>

      {/* Avatar placeholder */}
      <div className="flex justify-center">
        <div className="h-20 w-20 rounded-full bg-primary-100 flex items-center justify-center">
          <UserCircle className="h-12 w-12 text-primary-500" />
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><UserCircle className="h-3.5 w-3.5" /> שם מלא</Label>
            <Input
              value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })}
              placeholder="השם המלא שלך"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> אימייל</Label>
            <Input value={profile?.user?.email || ""} disabled className="bg-muted" />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> טלפון</Label>
            <Input
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="050-1234567"
              dir="ltr"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> שפה מועדפת</Label>
            <Select
              value={form.preferred_language}
              onChange={e => setForm({ ...form, preferred_language: e.target.value })}
            >
              <option value="he">עברית</option>
              <option value="en">English</option>
            </Select>
          </div>

          {profile?.employee && (
            <div className="rounded bg-muted/50 p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">פרטי חייל</p>
              <p className="text-sm">מספר: {profile.employee.employee_number}</p>
              <p className="text-sm">סטטוס: {profile.employee.status}</p>
            </div>
          )}

          <Button onClick={save} disabled={saving} className="w-full">
            <Save className="me-1 h-4 w-4" />
            {saving ? "שומר..." : "שמור שינויים"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
