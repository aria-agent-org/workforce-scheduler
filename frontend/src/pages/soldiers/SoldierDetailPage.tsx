import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, User, Phone, Mail, Bell, Calendar, Clock,
  Activity, Heart, History, Shield,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "react-i18next";
import EmployeePreferences from "@/components/EmployeePreferences";

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  on_duty: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  sick: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  leave: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  training: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  reserve: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  absent: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  present: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  home: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const STATUS_LABELS: Record<string, string> = {
  available: "זמין",
  on_duty: "בתורנות",
  sick: "חולה",
  leave: "חופשה",
  training: "הכשרה",
  reserve: "מילואים",
  absent: "נעדר",
  present: "נוכח",
  home: "בבית",
};

type DetailTab = "overview" | "history" | "preferences";

export default function SoldierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { i18n } = useTranslation();
  const lang = i18n.language as "he" | "en";

  const [loading, setLoading] = useState(true);
  const [soldier, setSoldier] = useState<any>(null);
  const [workload, setWorkload] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [liveAttendanceStatus, setLiveAttendanceStatus] = useState<string | null>(null);
  const [liveStatusDef, setLiveStatusDef] = useState<any>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [empRes, workloadRes, assignRes, windowsRes] = await Promise.all([
        api.get(tenantApi(`/employees/${id}`)),
        api.get(tenantApi(`/reports/workload`), { params: { employee_id: id } }).catch(() => ({ data: null })),
        api.get(tenantApi(`/employees/${id}/assignments`), { params: { page_size: 10 } }).catch(() => ({ data: [] })),
        api.get(tenantApi(`/schedule-windows`)).catch(() => ({ data: [] })),
      ]);
      setSoldier(empRes.data);
      setWorkload(workloadRes.data);
      const aData = assignRes.data;
      setAssignments(Array.isArray(aData) ? aData : (aData?.items || []));

      // Fetch live attendance from active board
      const windows: any[] = windowsRes.data || [];
      const activeWindow = windows.find((w: any) => w.status === "active") || windows[0];
      if (activeWindow) {
        const today = new Date().toISOString().split("T")[0];
        const [attRes, statusDefsRes] = await Promise.all([
          api.get(tenantApi(`/attendance`), {
            params: {
              window_id: activeWindow.id,
              employee_id: id,
              date_from: today,
              date_to: today,
            },
          }).catch(() => ({ data: [] })),
          api.get(tenantApi(`/attendance/statuses`)).catch(() => ({ data: [] })),
        ]);
        const todayRecord = (attRes.data || []).find((r: any) => r.date === today);
        if (todayRecord?.status_code) {
          setLiveAttendanceStatus(todayRecord.status_code);
          const def = (statusDefsRes.data || []).find((s: any) => s.code === todayRecord.status_code);
          setLiveStatusDef(def || null);
        } else {
          setLiveAttendanceStatus(null);
          setLiveStatusDef(null);
        }
      }
    } catch (e: any) {
      toast("error", "שגיאה בטעינת פרטי חייל");
      navigate("/soldiers");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!soldier) return null;

  const employeeWorkload = workload?.employees?.find((e: any) => e.employee_id === id) || null;
  const notifChannels = soldier.notification_channels || {};
  // Use live attendance status from active board if available, fall back to static employee.status
  const statusKey = liveAttendanceStatus || soldier.status || "available";
  const colorClass = STATUS_COLORS[statusKey] || STATUS_COLORS.available;
  const statusLabel = liveStatusDef
    ? (liveStatusDef.name?.he || liveStatusDef.name?.en || liveStatusDef.code)
    : (STATUS_LABELS[statusKey] || statusKey);
  const isLiveStatus = !!liveAttendanceStatus;

  const avatarBg = `hsl(${(soldier.full_name?.charCodeAt(0) || 65) * 7 % 360} 60% 55%)`;

  const tabs: { key: DetailTab; label: string; icon: any }[] = [
    { key: "overview", label: "סקירה", icon: User },
    { key: "history", label: "היסטוריה", icon: History },
    { key: "preferences", label: "העדפות", icon: Heart },
  ];

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/soldiers")}>
          <ArrowLeft className="me-1 h-4 w-4" />חזרה לחיילים
        </Button>
      </div>

      {/* Profile Card */}
      <Card className="overflow-hidden">
        <div className="h-2 w-full" style={{ background: `linear-gradient(90deg, ${avatarBg}, hsl(${(soldier.full_name?.charCodeAt(0) || 65) * 7 % 360} 80% 70%))` }} />
        <CardContent className="p-6">
          <div className="flex items-start gap-5 flex-wrap">
            {/* Avatar */}
            {soldier.avatar_url ? (
              <img src={soldier.avatar_url} alt="תמונת פרופיל" className="h-20 w-20 rounded-full object-cover border-4 border-white shadow-md flex-shrink-0" />
            ) : (
              <div className="h-20 w-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-md flex-shrink-0" style={{ background: avatarBg }}>
                {soldier.full_name?.charAt(0)}
              </div>
            )}

            {/* Name & Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{soldier.full_name}</h1>
                <Badge variant={soldier.is_active ? "success" : "destructive"}>
                  {soldier.is_active ? "פעיל" : "לא פעיל"}
                </Badge>
                <Badge className={colorClass + " text-xs"}>
                  <span className={`h-2 w-2 rounded-full bg-current inline-block me-1 ${isLiveStatus ? "animate-pulse" : "opacity-70"}`} />
                  {statusLabel}
                  {isLiveStatus && <span className="ms-1 opacity-70 text-[10px]">🔴 חי</span>}
                </Badge>
              </div>
              <p className="text-muted-foreground font-mono mt-0.5">#{soldier.employee_number}</p>

              {/* Work Roles */}
              {soldier.work_roles && soldier.work_roles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {soldier.work_roles.map((r: any) => (
                    <Badge key={r.id} className="text-xs px-2.5" style={{ backgroundColor: r.color + "20", color: r.color, border: `1px solid ${r.color}40` }}>
                      {r.is_primary && "⭐ "}
                      {r.name?.[lang] || r.name?.he || r.name}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Contact Info */}
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                {notifChannels.phone_whatsapp && (
                  <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{notifChannels.phone_whatsapp}</span>
                )}
                {notifChannels.email && (
                  <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{notifChannels.email}</span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  נוצר {new Date(soldier.created_at).toLocaleDateString("he-IL")}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Strip */}
      {employeeWorkload && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary-600">{employeeWorkload.assignments_count ?? 0}</p>
              <p className="text-xs text-muted-foreground">סה"כ שיבוצים</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{employeeWorkload.weekly_hours ?? employeeWorkload.total_hours ?? 0}</p>
              <p className="text-xs text-muted-foreground">שעות שבועיות</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{employeeWorkload.monthly_hours ?? employeeWorkload.total_hours ?? 0}</p>
              <p className="text-xs text-muted-foreground">שעות חודשיות</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              {employeeWorkload.last_assignment_date ? (
                <p className="text-sm font-bold">{new Date(employeeWorkload.last_assignment_date).toLocaleDateString("he-IL")}</p>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
              <p className="text-xs text-muted-foreground">שיבוץ אחרון</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto scrollbar-hide">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === key
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Notification Channels */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" />ערוצי התראות</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: "phone_whatsapp", label: "WhatsApp", icon: "💬", value: notifChannels.phone_whatsapp },
                  { key: "email", label: "אימייל", icon: "📧", value: notifChannels.email },
                  { key: "push", label: "Push", icon: "🔔", value: notifChannels.push_enabled },
                  { key: "telegram", label: "Telegram", icon: "✈️", value: notifChannels.telegram_chat_id },
                ].map(ch => (
                  <div key={ch.key} className={`rounded-xl border p-3 text-center transition-colors ${ch.value ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800" : "bg-muted/30 border-dashed"}`}>
                    <span className="text-2xl">{ch.icon}</span>
                    <p className="text-xs text-muted-foreground mt-1">{ch.label}</p>
                    <Badge className={`text-[10px] mt-1 ${ch.value ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                      {ch.value ? "מחובר" : "לא מוגדר"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {soldier.notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">הערות</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{soldier.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Recent Assignments Preview */}
          {assignments.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />שיבוצים אחרונים</CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => setActiveTab("history")}>הצג הכל →</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {assignments.slice(0, 3).map((a: any, idx: number) => (
                    <div key={a.id || idx} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">📅</span>
                        <div>
                          <p className="font-medium">{a.mission_name || a.name || "משימה"}</p>
                          {a.slot_label && <p className="text-xs text-muted-foreground">{a.slot_label}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.date && <span className="text-xs text-muted-foreground">{a.date}</span>}
                        <Badge variant={a.status === "assigned" ? "success" : "default"} className="text-[10px]">
                          {a.status === "assigned" ? "שובץ" : a.status || "שובץ"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" />היסטוריית שיבוצים</CardTitle></CardHeader>
          <CardContent className="p-0">
            {assignments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Clock className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>אין שיבוצים עדיין</p>
              </div>
            ) : (
              <div className="divide-y">
                {assignments.map((a: any, idx: number) => (
                  <div key={a.id || idx} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{a.mission_name || a.name || "משימה"}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {a.date && <span>📅 {a.date}</span>}
                          {(a.start_time || a.mission_start_time) && (
                            <span>⏰ {(a.start_time || a.mission_start_time)?.slice(0, 5)}{a.end_time || a.mission_end_time ? ` - ${(a.end_time || a.mission_end_time)?.slice(0, 5)}` : ""}</span>
                          )}
                          {a.slot_label && <span>📍 {a.slot_label}</span>}
                        </div>
                      </div>
                      <Badge variant={a.status === "assigned" ? "success" : "default"} className="text-[10px] flex-shrink-0">
                        {a.status === "assigned" ? "שובץ" : a.status || "שובץ"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Preferences Tab */}
      {activeTab === "preferences" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" />העדפות שיבוץ</CardTitle></CardHeader>
            <CardContent>
              <EmployeePreferences employeeId={id!} compact />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
