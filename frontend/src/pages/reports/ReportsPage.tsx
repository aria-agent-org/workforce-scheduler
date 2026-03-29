import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { BarChart3, Download, Users, Calendar, DollarSign, ClipboardList } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

type ReportType = "workload" | "missions" | "attendance" | "costs";

export default function ReportsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [activeReport, setActiveReport] = useState<ReportType>("workload");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);

  const loadReport = async (type: ReportType) => {
    setLoading(true);
    try {
      const res = await api.get(tenantApi(`/reports/${type}`), {
        params: { date_from: dateFrom, date_to: dateTo },
      });
      setData(res.data);
    } catch (e) {
      toast("error", "שגיאה בטעינת דוח");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReport(activeReport); }, [activeReport, dateFrom, dateTo]);

  const exportCSV = () => {
    if (!data) return;
    let csv = "";
    if (activeReport === "workload" && data.employees) {
      csv = "שם,מספר עובד,שיבוצים,שעות\n";
      csv += data.employees.map((e: any) => `${e.employee_name},${e.employee_number},${e.assignments_count},${e.total_hours}`).join("\n");
    } else {
      csv = JSON.stringify(data, null, 2);
    }
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `report-${activeReport}.csv`; a.click();
  };

  const reports: { key: ReportType; label: string; icon: any }[] = [
    { key: "workload", label: "עומסי עבודה", icon: Users },
    { key: "missions", label: "משימות", icon: Calendar },
    { key: "attendance", label: "נוכחות", icon: ClipboardList },
    { key: "costs", label: "עלויות", icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("nav.reports")}</h1>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="me-1 h-4 w-4" />ייצוא
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          {reports.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveReport(key)}
              className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm ${
                activeReport === key ? "bg-primary-500 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ms-auto">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
          <span>—</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
        </div>
      </div>

      {loading ? <TableSkeleton rows={8} cols={4} /> : (
        <>
          {/* Workload Report */}
          {activeReport === "workload" && data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">ממוצע שעות</p>
                    <p className="text-3xl font-bold">{data.average_hours}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">סה"כ שעות</p>
                    <p className="text-3xl font-bold">{data.total_hours}</p>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50 text-sm">
                        <th className="px-4 py-3 text-start">עובד</th>
                        <th className="px-4 py-3 text-start">מספר</th>
                        <th className="px-4 py-3 text-center">שיבוצים</th>
                        <th className="px-4 py-3 text-center">שעות</th>
                        <th className="px-4 py-3 text-start">פילוג</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.employees?.map((emp: any) => (
                        <tr key={emp.employee_id} className="border-b">
                          <td className="px-4 py-3">{emp.employee_name}</td>
                          <td className="px-4 py-3 font-mono text-sm">{emp.employee_number}</td>
                          <td className="px-4 py-3 text-center">{emp.assignments_count}</td>
                          <td className="px-4 py-3 text-center">{emp.total_hours}</td>
                          <td className="px-4 py-3">
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary-500 rounded-full"
                                style={{ width: `${Math.min(100, (emp.total_hours / (data.average_hours * 2 || 1)) * 100)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Missions Report */}
          {activeReport === "missions" && data && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">סה"כ משימות</p>
                  <p className="text-3xl font-bold">{data.total_missions}</p>
                </CardContent>
              </Card>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Object.entries(data.by_status || {}).map(([status, count]) => (
                  <Card key={status}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground capitalize">{status}</p>
                      <p className="text-2xl font-bold">{count as number}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Attendance Report */}
          {activeReport === "attendance" && data && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">סה"כ עובדים פעילים</p>
                  <p className="text-3xl font-bold">{data.total_employees}</p>
                </CardContent>
              </Card>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Object.entries(data.by_status || {}).map(([status, count]) => (
                  <Card key={status}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">{status}</p>
                      <p className="text-2xl font-bold">{count as number}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Costs Report */}
          {activeReport === "costs" && data && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">סה"כ עלות</p>
                  <p className="text-3xl font-bold">${data.total_cost_usd}</p>
                </CardContent>
              </Card>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Object.entries(data.by_channel || {}).map(([channel, info]: [string, any]) => (
                  <Card key={channel}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground capitalize">{channel}</p>
                      <p className="text-xl font-bold">{info.count} הודעות</p>
                      <p className="text-sm">${info.cost_usd}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
