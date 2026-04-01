import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Label unused but kept for future use
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Download, Users, Calendar, DollarSign, ClipboardList } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from "recharts";
import * as XLSX from "xlsx";

type ReportType = "workload" | "missions" | "attendance" | "costs";

// Hebrew translations for mission statuses from backend
const STATUS_HE: Record<string, string> = {
  draft: "טיוטה",
  active: "פעיל",
  approved: "מאושר",
  completed: "הושלם",
  cancelled: "בוטל",
  proposed: "מוצע",
  paused: "מושהה",
  archived: "בארכיון",
  assigned: "משובץ",
  present: "נוכח",
  home: "בבית",
  sick: "חולה",
  vacation: "חופשה",
  training: "הכשרה",
  reserve: "מילואים",
};

const hebrewStatus = (status: string) => STATUS_HE[status] || status;

const COLORS = ["#2563eb", "#22c55e", "#ef4444", "#eab308", "#a855f7", "#f97316", "#06b6d4", "#ec4899"];

export default function ReportsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeReport, setActiveReport] = useState<ReportType>("workload");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
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

  const exportExcel = () => {
    if (!data) return;
    let rows: any[] = [];
    if (activeReport === "workload" && data.employees) {
      rows = data.employees.map((e: any) => ({
        "שם": e.employee_name,
        "מספר עובד": e.employee_number,
        "שיבוצים": e.assignments_count,
        "שעות": e.total_hours,
      }));
    } else if (activeReport === "missions") {
      rows = Object.entries(data.by_status || {}).map(([status, count]) => ({
        "סטטוס": status, "כמות": count,
      }));
    } else if (activeReport === "attendance") {
      rows = Object.entries(data.by_status || {}).map(([status, count]) => ({
        "סטטוס": status, "כמות": count,
      }));
    } else if (activeReport === "costs") {
      rows = Object.entries(data.by_channel || {}).map(([channel, info]: [string, any]) => ({
        "ערוץ": channel, "הודעות": info.count, "עלות $": info.cost_usd,
      }));
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeReport);
    XLSX.writeFile(wb, `report-${activeReport}-${dateFrom}-${dateTo}.xlsx`);
  };

  const exportCSV = () => {
    if (!data) return;
    let csv = "\uFEFF";
    if (activeReport === "workload" && data.employees) {
      csv += "שם,מספר עובד,שיבוצים,שעות\n";
      csv += data.employees.map((e: any) =>
        `${e.employee_name},${e.employee_number},${e.assignments_count},${e.total_hours}`
      ).join("\n");
    } else {
      csv = JSON.stringify(data, null, 2);
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `report-${activeReport}.csv`; a.click();
  };

  const exportPDF = () => {
    toast("info", "ייצוא PDF — יפתח חלון הדפסה");
    window.print();
  };

  const reports: { key: ReportType; label: string; icon: any }[] = [
    { key: "workload", label: "עומסי עבודה", icon: Users },
    { key: "missions", label: "משימות", icon: Calendar },
    { key: "attendance", label: "נוכחות", icon: ClipboardList },
    { key: "costs", label: "עלויות", icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{t("nav.reports")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="me-1 h-4 w-4" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <Download className="me-1 h-4 w-4" />Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <Download className="me-1 h-4 w-4" />PDF
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide pb-1">
          {reports.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveReport(key)}
              className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm whitespace-nowrap min-h-[44px] transition-colors ${
                activeReport === key ? "bg-primary-500 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ms-auto w-full sm:w-auto">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="flex-1 sm:w-36 min-h-[44px]" />
          <span>—</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="flex-1 sm:w-36 min-h-[44px]" />
        </div>
      </div>

      {loading ? <TableSkeleton rows={8} cols={4} /> : (
        <>
          {/* Workload Report */}
          {activeReport === "workload" && data && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">ממוצע שעות</p>
                    <p className="text-3xl font-bold text-primary-500">{data.average_hours}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">סה"כ שעות</p>
                    <p className="text-3xl font-bold">{data.total_hours}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">עובדים</p>
                    <p className="text-3xl font-bold">{data.employees?.length || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">תקופה</p>
                    <p className="text-sm font-medium">{data.period?.from} → {data.period?.to}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Workload Bar Chart */}
              <Card>
                <CardHeader><CardTitle className="text-lg">עומס שעות לעובד</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={data.employees?.slice(0, 20) || []} layout="vertical" margin={{ left: 100 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" label={{ value: "שעות", position: "insideBottom", offset: -5 }} />
                      <YAxis dataKey="employee_name" type="category" width={100} tick={{ fontSize: 12 }} />
                      <RechartsTooltip formatter={(value: any) => [`${value} שעות`, "שעות"]} labelFormatter={(label: any) => `עובד: ${label}`} />
                      <Bar dataKey="total_hours" fill="#2563eb" radius={[0, 4, 4, 0]} name="שעות עבודה">
                        {(data.employees || []).map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Detailed Workload Table with Overtime & Night Shifts */}
              <Card>
                <CardHeader><CardTitle className="text-lg">פירוט שעות עבודה</CardTitle></CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50 text-sm">
                        <th className="px-4 py-3 text-start">עובד</th>
                        <th className="px-4 py-3 text-center">שיבוצים</th>
                        <th className="px-4 py-3 text-center">שעות שבועיות</th>
                        <th className="px-4 py-3 text-center">שעות חודשיות</th>
                        <th className="px-4 py-3 text-center">שעות נוספות</th>
                        <th className="px-4 py-3 text-center">שעות לילה</th>
                        <th className="px-4 py-3 text-center">ימים ללא מנוחה</th>
                        <th className="px-4 py-3 text-start">עומס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.employees?.map((emp: any) => {
                        const ratio = data.average_hours > 0 ? emp.total_hours / (data.average_hours * 2) : 0;
                        const hue = ratio > 0.7 ? 0 : ratio > 0.4 ? 40 : 120;
                        return (
                          <tr key={emp.employee_id} className="border-b">
                            <td className="px-4 py-3 font-medium">{emp.employee_name}</td>
                            <td className="px-4 py-3 text-center">{emp.assignments_count}</td>
                            <td className="px-4 py-3 text-center">{emp.weekly_hours ?? emp.total_hours}</td>
                            <td className="px-4 py-3 text-center font-bold">{emp.monthly_hours ?? emp.total_hours}</td>
                            <td className="px-4 py-3 text-center">
                              {(emp.overtime_hours ?? 0) > 0 ? (
                                <span className="text-red-600 font-bold">{emp.overtime_hours}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {(emp.night_shift_hours ?? 0) > 0 ? (
                                <span className="text-purple-600 font-medium">🌙 {emp.night_shift_hours}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {(emp.days_since_rest ?? 0) >= 6 ? (
                                <span className="text-red-600 font-bold">⚠️ {emp.days_since_rest}</span>
                              ) : (
                                <span>{emp.days_since_rest ?? 0}</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="h-4 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(100, ratio * 100)}%`,
                                    backgroundColor: `hsl(${hue}, 70%, 50%)`,
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Overtime Bar Chart */}
              {data.employees?.some((e: any) => (e.overtime_hours ?? 0) > 0 || (e.night_shift_hours ?? 0) > 0) && (
                <Card>
                  <CardHeader><CardTitle className="text-lg">שעות נוספות ולילה</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart
                        data={data.employees?.filter((e: any) => (e.overtime_hours ?? 0) > 0 || (e.night_shift_hours ?? 0) > 0).slice(0, 15) || []}
                        layout="vertical"
                        margin={{ left: 100 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" label={{ value: "שעות", position: "insideBottom", offset: -5 }} />
                        <YAxis dataKey="employee_name" type="category" width={100} tick={{ fontSize: 12 }} />
                        <RechartsTooltip />
                        <Legend />
                        <Bar dataKey="overtime_hours" fill="#ef4444" name="שעות נוספות (>8/יום)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="night_shift_hours" fill="#8b5cf6" name="שעות לילה" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Missions Report */}
          {activeReport === "missions" && data && (
            <div className="space-y-6">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">סה"כ משימות</p>
                  <p className="text-3xl font-bold">{data.total_missions}</p>
                </CardContent>
              </Card>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Pie Chart */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">פילוג לפי סטטוס</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={Object.entries(data.by_status || {}).map(([name, value]) => ({ name: hebrewStatus(name), value }))}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, percent }: any) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                          dataKey="value"
                        >
                          {Object.keys(data.by_status || {}).map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Bar Chart */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">היסטוגרמה — משימות לפי סטטוס</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={Object.entries(data.by_status || {}).map(([name, value]) => ({ name: hebrewStatus(name), count: value }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" label={{ value: "סטטוס", position: "insideBottom", offset: -5 }} />
                        <YAxis label={{ value: "כמות", angle: -90, position: "insideLeft" }} />
                        <RechartsTooltip formatter={(value: any) => [`${value}`, "כמות"]} />
                        <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} name="כמות">
                          {Object.keys(data.by_status || {}).map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Status Cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Object.entries(data.by_status || {}).map(([status, count], i) => (
                  <Card key={status}>
                    <CardContent className="p-4 text-center">
                      <div className="h-2 w-full rounded-full mb-2" style={{ backgroundColor: COLORS[i % COLORS.length] + "40" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${data.total_missions > 0 ? ((count as number) / data.total_missions * 100) : 0}%`,
                            backgroundColor: COLORS[i % COLORS.length],
                          }}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground capitalize">{hebrewStatus(status)}</p>
                      <p className="text-2xl font-bold">{count as number}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Attendance Report */}
          {activeReport === "attendance" && data && (
            <div className="space-y-6">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">סה"כ עובדים פעילים</p>
                  <p className="text-3xl font-bold">{data.total_employees}</p>
                </CardContent>
              </Card>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Pie */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">פילוג נוכחות</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={Object.entries(data.by_status || {}).map(([name, value]) => ({ name: hebrewStatus(name), value }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          label={({ name, value }) => `${name}: ${value}`}
                          dataKey="value"
                        >
                          {Object.keys(data.by_status || {}).map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Area Chart */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">דפוסי נוכחות</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={Object.entries(data.by_status || {}).map(([name, value]) => ({ name: hebrewStatus(name), count: value }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" label={{ value: "סטטוס", position: "insideBottom", offset: -5 }} />
                        <YAxis label={{ value: "כמות", angle: -90, position: "insideLeft" }} />
                        <RechartsTooltip formatter={(value: any) => [`${value}`, "כמות"]} />
                        <Area type="monotone" dataKey="count" stroke="#2563eb" fill="#2563eb30" name="כמות" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Status Grid */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Object.entries(data.by_status || {}).map(([status, count], i) => (
                  <Card key={status}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">{hebrewStatus(status)}</p>
                      <p className="text-2xl font-bold" style={{ color: COLORS[i % COLORS.length] }}>{count as number}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Costs Report */}
          {activeReport === "costs" && data && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">סה"כ עלות</p>
                    <p className="text-3xl font-bold text-red-500">${data.total_cost_usd}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">ערוצים</p>
                    <p className="text-3xl font-bold">{Object.keys(data.by_channel || {}).length}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Cost Pie */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">עלות לפי ערוץ</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={Object.entries(data.by_channel || {}).map(([name, info]: [string, any]) => ({
                            name, value: info.cost_usd,
                          }))}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, value }) => `${name}: $${value}`}
                          dataKey="value"
                        >
                          {Object.keys(data.by_channel || {}).map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Messages Bar */}
                <Card>
                  <CardHeader><CardTitle className="text-lg">הודעות לפי ערוץ</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={Object.entries(data.by_channel || {}).map(([name, info]: [string, any]) => ({
                        name, messages: info.count, cost: info.cost_usd,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" label={{ value: "ערוץ", position: "insideBottom", offset: -5 }} />
                        <YAxis label={{ value: "כמות הודעות", angle: -90, position: "insideLeft" }} />
                        <RechartsTooltip formatter={(value: any, name?: string | number) => [`${value}`, name === "messages" ? "הודעות" : String(name ?? "")]} />
                        <Legend />
                        <Bar dataKey="messages" fill="#2563eb" name="הודעות" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Channel Detail Cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Object.entries(data.by_channel || {}).map(([channel, info]: [string, any], i) => (
                  <Card key={channel}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground capitalize">{channel}</p>
                      <p className="text-xl font-bold">{info.count} הודעות</p>
                      <p className="text-sm" style={{ color: COLORS[i % COLORS.length] }}>${info.cost_usd}</p>
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
