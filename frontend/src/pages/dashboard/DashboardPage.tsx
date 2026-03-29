import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Calendar, AlertTriangle, CheckCircle, Clock, BarChart3 } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

interface DashboardStats {
  total_employees: number;
  present_today: number;
  missions_today: number;
  conflicts: number;
  active_windows: number;
}

export default function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [missions, setMissions] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const [statsRes, missionsRes, activityRes] = await Promise.all([
          api.get(tenantApi("/reports/dashboard")),
          api.get(tenantApi("/missions"), { params: { date_from: today, date_to: today } }),
          api.get(tenantApi("/audit-logs"), { params: { page_size: 10 } }).catch(() => ({ data: { items: [] } })),
        ]);
        setStats(statsRes.data);
        setMissions(missionsRes.data || []);
        setRecentActivity(activityRes.data.items || []);
      } catch (e) {
        console.error("Failed to load dashboard", e);
        setStats({ total_employees: 0, present_today: 0, missions_today: 0, conflicts: 0, active_windows: 0 });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  const statCards = [
    { key: "totalSoldiers", value: stats?.total_employees ?? 0, icon: Users, color: "text-blue-500 bg-blue-50", link: "/soldiers" },
    { key: "present", value: stats?.present_today ?? 0, icon: CheckCircle, color: "text-green-500 bg-green-50", link: "/attendance" },
    { key: "missionsToday", value: stats?.missions_today ?? 0, icon: Calendar, color: "text-purple-500 bg-purple-50", link: "/scheduling" },
    { key: "conflicts", value: stats?.conflicts ?? 0, icon: AlertTriangle, color: "text-red-500 bg-red-50", link: "/scheduling" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ key, value, icon: Icon, color, link }) => (
          <Card key={key} className="hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]" onClick={() => navigate(link)}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`rounded-full p-3 ${color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t(`stats.${key}`)}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("quickActions")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={() => navigate("/scheduling")} size="sm">
              <Calendar className="me-1 h-4 w-4" />
              {t("viewFullSchedule")}
            </Button>
            <Button onClick={() => navigate("/soldiers")} variant="outline" size="sm">
              <Users className="me-1 h-4 w-4" />
              {t("addSoldier")}
            </Button>
            <Button onClick={() => navigate("/scheduling")} variant="outline" size="sm">
              <Clock className="me-1 h-4 w-4" />
              {t("createMission")}
            </Button>
            <Button onClick={() => navigate("/reports")} variant="outline" size="sm">
              <BarChart3 className="me-1 h-4 w-4" />
              דוחות
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
                  <div key={m.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="font-medium">{m.name}</p>
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
      {recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">📋 פעילות אחרונה</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentActivity.slice(0, 10).map((a: any, i: number) => {
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
          </CardContent>
        </Card>
      )}

      {/* Active Schedule Windows */}
      {(stats?.active_windows ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">לוחות עבודה פעילים</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{stats?.active_windows} לוחות פעילים</p>
            <Button variant="link" size="sm" onClick={() => navigate("/scheduling")} className="mt-2">
              צפה בלוחות →
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
