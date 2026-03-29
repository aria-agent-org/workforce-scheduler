import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Wand2, Send } from "lucide-react";

export default function SchedulingPage() {
  const { t } = useTranslation("scheduling");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Wand2 className="me-1 h-4 w-4" />
            {t("autoAssign")}
          </Button>
          <Button variant="outline" size="sm">
            <Send className="me-1 h-4 w-4" />
            {t("publish")}
          </Button>
          <Button size="sm">
            <Plus className="me-1 h-4 w-4" />
            {t("createWindow")}
          </Button>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex gap-2">
        <button className="rounded-md bg-primary-500 px-4 py-2 text-sm text-white">
          {t("dailyBoard")}
        </button>
        <button className="rounded-md bg-muted px-4 py-2 text-sm text-muted-foreground hover:bg-accent">
          {t("weeklyView")}
        </button>
        <button className="rounded-md bg-muted px-4 py-2 text-sm text-muted-foreground hover:bg-accent">
          {t("missionTypes")}
        </button>
        <button className="rounded-md bg-muted px-4 py-2 text-sm text-muted-foreground hover:bg-accent">
          {t("templates")}
        </button>
      </div>

      {/* Schedule Windows */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("scheduleWindows")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t("common:noData")}</p>
        </CardContent>
      </Card>

      {/* Daily Board Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5" />
            {t("dailyBoard")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25">
            <p className="text-muted-foreground">
              {t("common:noData")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Conflicts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("conflicts.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-green-600">{t("conflicts.noConflicts")} ✓</p>
        </CardContent>
      </Card>
    </div>
  );
}
