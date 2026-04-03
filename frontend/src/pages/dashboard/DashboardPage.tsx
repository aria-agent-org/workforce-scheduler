import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Users, Calendar, AlertTriangle, CheckCircle, Clock, BarChart3, ArrowLeftRight, Zap } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import ActivityFeed from "@/components/dashboard/ActivityFeed";

interface DashboardStats {
  total_employees: number;
  present_today: number;
  missions_today: number;
  conflicts: number;
  active_windows: number;
}

interface UpcomingMission {
  id: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
  date: string;
  status: string;
  assignments?: Array<{ employee_name?: string }>;
  unfilled_slots?: number;
}

export default function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const { toast } = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [missions, setMissions] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [upcoming48h, setUpcoming48h] = useState<UpcomingMission[]>([]);
  const [weeklyWorkload, setWeeklyWorkload] = useState<{ day: string; label: string; count: number }[]>([]);
  const [pendingSwapsCount, setPendingSwapsCount] = useState(0);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
        const today = new Date().toISOString().split("T")[0];
        const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split("T")[0];

        // Compute week range for workload chart
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const [statsRes, missionsRes, activityRes, upcoming48hRes, weekMissionsRes, swapsRes] = await Promise.all([
          api.get(tenantApi("/reports/dashboard")),
          api.get(tenantApi("/missions"), { params: { date_from: today, date_to: today } }),
          api.get(tenantApi("/audit-logs"), { params: { page_size: 5 } }).catch(() => ({ data: { items: [] } })),
          api.get(tenantApi("/missions"), { params: { date_from: today, date_to: in48h } }).catch(() => ({ data: [] })),
          api.get(tenantApi("/missions"), {
            params: { date_from: weekStart.toISOString().split("T")[0], date_to: weekEnd.toISOString().split("T")[0] },
          }).catch(() => ({ data: [] })),
          api.get(tenantApi("/swap-requests")).catch(() => ({ data: [] })),
        ]);
        setStats(statsRes.data);
        setMissions(missionsRes.data || []);
        setRecentActivity(activityRes.data.items || []);

        // Upcoming 48h
        const upcoming = Array.isArray(upcoming48hRes.data) ? upcoming48hRes.data : upcoming48hRes.data.items || [];
        setUpcoming48h(upcoming);

        // Weekly workload chart
        const weekMissions = Array.isArray(weekMissionsRes.data) ? weekMissionsRes.data : weekMissionsRes.data.items || [];
        const dayNames = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
        const workloadMap: Record<string, number> = {};
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekStart);
          d.setDate(weekStart.getDate() + i);
          workloadMap[d.toISOString().split("T")[0]] = 0;
        }
        weekMissions.forEach((m: any) => {
          const d = m.date || m.start_date;
          if (d && workloadMap[d] !== undefined) workloadMap[d]++;
        });
        const workload = Object.entries(workloadMap).map(([day, count]) => ({
          day,
          label: dayNames[new Date(day).getDay()],
          count,
        }));
        setWeeklyWorkload(workload);

        // Pending swaps
        const allSwaps = Array.isArray(swapsRes.data) ? swapsRes.data : swapsRes.data.items || [];
        setPendingSwapsCount(allSwaps.filter((s: any) => s.status === "pending").length);
    } catch (e) {
      console.error("Failed to load dashboard", e);
      setError(true);
      setStats({ total_employees: 0, present_today: 0, missions_today: 0, conflicts: 0, active_windows: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAutoAssign = async () => {
    setAutoAssigning(true);
    try {
      await api.post(tenantApi("/missions/auto-assign"));
      toast("success", t("autoAssignSuccess"));
    } catch (e: any) {
      toast("error", e.response?.data?.detail || t("autoAssignError"));
    } finally {
      setAutoAssigning(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="empty-state">
        <div className="h-20 w-20 rounded-2xl bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center mb-6 shadow-elevation-1">
          <AlertTriangle className="h-10 w-10 text-yellow-500" />
        </div>
        <p className="empty-state-title">שגיאה בטעינת לוח בקרה</p>
        <p className="empty-state-description mb-4">לא ניתן היה לטעון את הנתונים. נסה שוב.</p>
        <Button onClick={load} variant="outline" className="gap-2">
          <Clock className="h-4 w-4" />נסה שוב
        </Button>
      </div>
    );
  }

  const maxWorkload = Math.max(...weeklyWorkload.map(w => w.count), 1);

  // Calculate unfilled slots from today's missions
  const unfilledSlots = missions.reduce((sum: number, m: any) => sum + (m.unfilled_slots || 0), 0);

  const statCards = [
    { key: "missionsToday", value: stats?.missions_today ?? 0, icon: Calendar, gradient: "from-violet-500 to-purple-600", bgLight: "bg-violet-50 dark:bg-violet-900/20", link: "/scheduling", suffix: "היום" },
    { key: "unfilledSlots", value: unfilledSlots, icon: AlertTriangle, gradient: unfilledSlots > 0 ? "from-red-500 to-rose-600" : "from-emerald-500 to-green-600", bgLight: unfilledSlots > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-emerald-50 dark:bg-emerald-900/20", link: "/scheduling", suffix: "משבצות" },
    { key: "totalSoldiers", value: stats?.total_employees ?? 0, icon: Users, gradient: "from-blue-500 to-cyan-600", bgLight: "bg-blue-50 dark:bg-blue-900/20", link: "/soldiers", suffix: "חיילים" },
    { key: "present", value: stats?.present_today ?? 0, icon: CheckCircle, gradient: "from-green-500 to-emerald-600", bgLight: "bg-green-50 dark:bg-green-900/20", link: "/attendance", suffix: "נוכחים" },
    { key: "pendingSwaps_kpi", value: pendingSwapsCount, icon: ArrowLeftRight, gradient: "from-orange-500 to-amber-600", bgLight: "bg-orange-50 dark:bg-orange-900/20", link: "/swaps", suffix: "בקשות" },
  ];

  return (
    <div className="space-y-6">
      {/* Page header with greeting */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map(({ key, value, icon: Icon, gradient, bgLight, link }, idx) => (
          <Card
            key={key}
            className="card-hover cursor-pointer stagger-item overflow-hidden group border-0 shadow-elevation-2"
            onClick={() => navigate(link)}
            role="link"
            aria-label={`${t(`stats.${key === 'pendingSwaps_kpi' ? 'pendingSwaps' : key}`)}: ${value}`}
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            <CardContent className="p-2.5 sm:p-4 relative">
              {/* Gradient accent top bar */}
              <div className={`absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r ${gradient} opacity-80`} />
              
              <div className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-0">
                <div className={`rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 sm:mb-2 ${bgLight} transition-transform group-hover:scale-110 duration-200`}>
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: `var(--tw-gradient-from, currentColor)` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xl sm:text-3xl font-black tracking-tight leading-none">{value}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">{t(`stats.${key === 'pendingSwaps_kpi' ? 'pendingSwaps' : key}`)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity Feed */}
      <ActivityFeed />

      {/* Upcoming 48h + Weekly Workload */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming 48h */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t("upcoming48h")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming48h.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noUpcoming48h")}</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {upcoming48h.slice(0, 12).map((m) => {
                  const hasWarning = (m.unfilled_slots && m.unfilled_slots > 0) ||
                    (!m.assignments || m.assignments.length === 0);
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors cursor-pointer ${
                        hasWarning ? "border-amber-300 dark:border-amber-700" : ""
                      }`}
                      onClick={() => navigate(`/missions/${m.id}`)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {hasWarning && <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                          <p className="font-medium text-sm truncate">{m.name}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {m.date} · {m.start_time?.slice(0, 5) || "—"} - {m.end_time?.slice(0, 5) || "—"}
                          {m.assignments && m.assignments.length > 0 && ` · ${m.assignments.length} משובצים`}
                          {m.unfilled_slots && m.unfilled_slots > 0 && (
                            <span className="text-amber-600 font-medium"> · {m.unfilled_slots} חסרים</span>
                          )}
                        </p>
                      </div>
                      <Badge className={
                        m.status === "approved" ? "bg-green-100 text-green-700" :
                        m.status === "draft" ? "bg-gray-100 text-gray-700" :
                        m.status === "proposed" ? "bg-purple-100 text-purple-700" :
                        "bg-blue-100 text-blue-700"
                      }>
                        {m.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly Workload Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t("weeklyWorkload")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-[200px] pt-4">
              {weeklyWorkload.map(({ day, label, count }) => {
                const height = maxWorkload > 0 ? (count / maxWorkload) * 100 : 0;
                const isToday = day === new Date().toISOString().split("T")[0];
                return (
                  <div key={day} className="flex flex-col items-center flex-1 h-full justify-end">
                    <span className="text-xs font-bold mb-1">{count}</span>
                    <div
                      className={`w-full rounded-t-md transition-all ${
                        isToday ? "bg-primary-500" : "bg-primary-200 dark:bg-primary-800"
                      }`}
                      style={{ height: `${Math.max(height, 4)}%` }}
                    />
                    <span className={`text-xs mt-1 ${isToday ? "font-bold text-primary-600" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions + Today's Schedule */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("quickActions")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => navigate("/scheduling")} size="sm" className="min-h-[44px]">
              <Calendar className="me-1 h-4 w-4" />
              {t("viewFullSchedule")}
            </Button>
            <Button onClick={() => navigate("/soldiers")} variant="outline" size="sm" className="min-h-[44px]">
              <Users className="me-1 h-4 w-4" />
              {t("addSoldier")}
            </Button>
            <Button onClick={() => navigate("/scheduling")} variant="outline" size="sm" className="min-h-[44px]">
              <Clock className="me-1 h-4 w-4" />
              {t("createMission")}
            </Button>
            <Button onClick={() => navigate("/reports")} variant="outline" size="sm" className="min-h-[44px]">
              <BarChart3 className="me-1 h-4 w-4" />
              {t("reports")}
            </Button>
            <Button
              onClick={handleAutoAssign}
              variant="outline"
              size="sm"
              className="min-h-[44px] border-primary-300 text-primary-600 hover:bg-primary-50"
              disabled={autoAssigning}
            >
              <Zap className="me-1 h-4 w-4" />
              {autoAssigning ? "..." : t("autoAssign")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("todaySchedule")}</CardTitle>
          </CardHeader>
          <CardContent>
            {missions.length === 0 ? (
              <p className="text-muted-foreground">{t("noMissionsToday")}</p>
            ) : (
              <div className="space-y-2">
                {missions.slice(0, 8).map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/missions/${m.id}`)}>
                    <div>
                      <p className="font-medium hover:text-primary-600 transition-colors">{m.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {m.start_time?.slice(0, 5)} - {m.end_time?.slice(0, 5)}
                        {m.assignments?.length > 0 && ` · ${m.assignments.length} משובצים`}
                      </p>
                    </div>
                    <Badge className={
                      m.status === "approved" ? "bg-green-100 text-green-700" :
                      m.status === "draft" ? "bg-gray-100 text-gray-700" :
                      m.status === "proposed" ? "bg-purple-100 text-purple-700" :
                      "bg-blue-100 text-blue-700"
                    }>
                      {m.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📋 {t("recentActivity")}</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-muted-foreground text-sm">אין פעילות אחרונה</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.slice(0, 5).map((a: any, i: number) => {
                const actionLabels: Record<string, string> = {
                  create: "יצר", update: "עדכן", delete: "מחק", assign: "שיבץ",
                  deactivate: "השבית", reset_password: "איפס סיסמה", force_logout: "ניתק",
                  broadcast_notification: "שלח הודעה", bulk_import: "ייבא", reset: "איפס",
                };
                const entityLabels: Record<string, string> = {
                  employee: "חייל", user: "משתמש", mission: "משימה", mission_type: "סוג משימה",
                  schedule_window: "לוח עבודה", mission_assignment: "שיבוץ",
                  notification_template: "תבנית התראה", setting: "הגדרה", notification: "התראה",
                };
                return (
                  <div key={a.id || i} className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-muted/30 transition-colors text-sm">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {(a.user_email || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate">
                        <span className="font-medium">{a.user_email?.split("@")[0] || "מערכת"}</span>
                        {" "}{actionLabels[a.action] || a.action}{" "}
                        <span className="text-muted-foreground">{entityLabels[a.entity_type] || a.entity_type}</span>
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {a.created_at ? new Date(a.created_at).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Schedule Windows */}
      {(stats?.active_windows ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("activeWindows")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{stats?.active_windows} {t("activeWindowsCount")}</p>
            <Button variant="link" size="sm" onClick={() => navigate("/scheduling")} className="mt-2">
              {t("viewWindows")} ←
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
