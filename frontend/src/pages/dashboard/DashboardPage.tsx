import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Calendar, AlertTriangle, CheckCircle, Clock, ArrowLeft } from "lucide-react";
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

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, missionsRes] = await Promise.all([
          api.get(tenantApi("/reports/dashboard")),
          api.get(tenantApi("/missions"), { params: { date_from: new Date().toISOString().split("T")[0], date_to: new Date().toISOString().split("T")[0] } }),
        ]);
        setStats(statsRes.data);
        setMissions(missionsRes.data);
      } catch (e) {
        console.error("Failed to load dashboard", e);
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  const statCards = [
    { key: "totalEmployees", value: stats?.total_employees ?? 0, icon: Users, color: "text-blue-500 bg-blue-50" },
    { key: "present", value: stats?.present_today ?? 0, icon: CheckCircle, color: "text-green-500 bg-green-50" },
    { key: "missionsToday", value: stats?.missions_today ?? 0, icon: Calendar, color: "text-purple-500 bg-purple-50" },
    { key: "conflicts", value: stats?.conflicts ?? 0, icon: AlertTriangle, color: "text-red-500 bg-red-50" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ key, value, icon: Icon, color }) => (
          <Card key={key} className="hover:shadow-md transition-shadow">
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
            <Button onClick={() => navigate("/employees")} variant="outline" size="sm">
              <Users className="me-1 h-4 w-4" />
              {t("addEmployee")}
            </Button>
            <Button onClick={() => navigate("/scheduling")} variant="outline" size="sm">
              <Clock className="me-1 h-4 w-4" />
              {t("createMission")}
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
                {missions.slice(0, 5).map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{m.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {m.start_time?.slice(0, 5)} - {m.end_time?.slice(0, 5)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs ${
                      m.status === "approved" ? "bg-green-100 text-green-700" :
                      m.status === "draft" ? "bg-gray-100 text-gray-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {m.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
