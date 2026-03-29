import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserCircle, Mail, Phone, Globe, Save, Shield, Hash } from "lucide-react";
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
    <div className="space-y-5 pb-4 max-w-lg mx-auto">
      <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
        <UserCircle className="h-5 w-5 text-primary-500" />
        הפרופיל שלי
      </h2>

      {/* Avatar + info card */}
      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-l from-primary-400 to-primary-600" />
        <CardContent className="p-4 -mt-10">
          <div className="flex items-end gap-3 mb-4">
            <div className="h-16 w-16 rounded-2xl bg-white dark:bg-card border-4 border-background flex items-center justify-center shadow-md">
              <UserCircle className="h-10 w-10 text-primary-500" />
            </div>
            <div className="pb-1">
              <p className="font-bold text-lg">{profile?.employee?.full_name || profile?.user?.email}</p>
              <p className="text-xs text-muted-foreground">{profile?.user?.email}</p>
            </div>
          </div>

          {/* Quick info badges */}
          {profile?.employee && (
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge className="bg-muted text-foreground gap-1">
                <Hash className="h-3 w-3" /> {profile.employee.employee_number}
              </Badge>
              <Badge className={profile.employee.is_active !== false ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                {profile.employee.is_active !== false ? "פעיל" : "לא פעיל"}
              </Badge>
              {profile.employee.work_roles?.map((r: any) => (
                <Badge key={r.id} style={{ backgroundColor: (r.color || "#6b7280") + "20", color: r.color || "#6b7280" }}>
                  {r.name?.he || r.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit form */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground">עריכת פרטים</h3>
          
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm"><UserCircle className="h-4 w-4 text-muted-foreground" /> שם מלא</Label>
            <Input
              value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })}
              placeholder="השם המלא שלך"
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /> אימייל</Label>
            <Input value={profile?.user?.email || ""} disabled className="bg-muted min-h-[44px]" />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /> טלפון</Label>
            <Input
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="050-1234567"
              dir="ltr"
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm"><Globe className="h-4 w-4 text-muted-foreground" /> שפה מועדפת</Label>
            <Select
              value={form.preferred_language}
              onChange={e => setForm({ ...form, preferred_language: e.target.value })}
              className="min-h-[44px]"
            >
              <option value="he">עברית</option>
              <option value="en">English</option>
            </Select>
          </div>

          <Button onClick={save} disabled={saving} className="w-full min-h-[48px] text-base mt-2">
            <Save className="me-2 h-4 w-4" />
            {saving ? "שומר..." : "שמור שינויים"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
