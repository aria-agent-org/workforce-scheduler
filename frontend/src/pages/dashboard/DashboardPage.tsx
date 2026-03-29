import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users, Calendar, AlertTriangle, CheckCircle } from "lucide-react";

const stats = [
  { key: "totalEmployees", value: 0, icon: Users, color: "text-blue-500" },
  { key: "present", value: 0, icon: CheckCircle, color: "text-green-500" },
  { key: "missionsToday", value: 0, icon: Calendar, color: "text-purple-500" },
  { key: "conflicts", value: 0, icon: AlertTriangle, color: "text-red-500" },
];

export default function DashboardPage() {
  const { t } = useTranslation("dashboard");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ key, value, icon: Icon, color }) => (
          <Card key={key}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`rounded-full bg-muted p-3 ${color}`}>
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

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("quickActions")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <button className="rounded-md bg-primary-500 px-4 py-2 text-sm text-white hover:bg-primary-600">
            {t("viewFullSchedule")}
          </button>
          <button className="rounded-md bg-primary-500 px-4 py-2 text-sm text-white hover:bg-primary-600">
            {t("addEmployee")}
          </button>
          <button className="rounded-md bg-primary-500 px-4 py-2 text-sm text-white hover:bg-primary-600">
            {t("createMission")}
          </button>
        </CardContent>
      </Card>

      {/* Today's Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("todaySchedule")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t("noMissionsToday")}</p>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("recentActivity")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t("common:noData")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
