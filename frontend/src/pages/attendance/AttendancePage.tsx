import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
// Badge available for future use
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Save, Download, Search, ChevronLeft, ChevronRight } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import * as XLSX from "xlsx";

type ViewMode = "weekly" | "monthly" | "period";

interface StatusDef {
  id: string;
  code: string;
  name: Record<string, string>;
  color: string | null;
  icon: string | null;
  counts_as_present: boolean;
  is_schedulable: boolean;
}

export default function AttendancePage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [windows, setWindows] = useState<any[]>([]);
  const [selectedWindow, setSelectedWindow] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [statusDefs, setStatusDefs] = useState<StatusDef[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [workRoles, setWorkRoles] = useState<any[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);

  // Generate dates based on view mode
  const dates = useMemo(() => {
    const d = new Date(selectedDate);
    const result: string[] = [];

    if (viewMode === "weekly") {
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay());
      for (let i = 0; i < 7; i++) {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        result.push(day.toISOString().split("T")[0]);
      }
    } else if (viewMode === "monthly") {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
        result.push(new Date(cur).toISOString().split("T")[0]);
      }
    } else {
      // Period view — use schedule window dates
      const win = windows.find(w => w.id === selectedWindow);
      if (win) {
        const start = new Date(win.start_date);
        const end = new Date(win.end_date);
        for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
          result.push(new Date(cur).toISOString().split("T")[0]);
        }
      }
    }
    return result;
  }, [selectedDate, viewMode, selectedWindow, windows]);

  const dayNames = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    let result = employees;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.full_name.toLowerCase().includes(q) ||
        (e.employee_number || "").toLowerCase().includes(q)
      );
    }
    if (filterRole) {
      result = result.filter(e => e.work_role_id === filterRole);
    }
    if (filterStatus) {
      result = result.filter(e => {
        return dates.some(date => attendance[`${e.id}_${date}`] === filterStatus);
      });
    }
    return result;
  }, [employees, searchQuery, filterRole, filterStatus, dates, attendance]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, winRes, statusRes, rolesRes] = await Promise.all([
        api.get(tenantApi("/employees"), { params: { page_size: 500, is_active: true } }),
        api.get(tenantApi("/schedule-windows")),
        api.get(tenantApi("/attendance/statuses")),
        api.get(tenantApi("/settings/work-roles")).catch(() => ({ data: [] })),
      ]);
      setEmployees(empRes.data.items || empRes.data || []);
      setWindows(winRes.data || []);
      if (winRes.data?.length > 0 && !selectedWindow) {
        setSelectedWindow(winRes.data[0].id);
      }
      setStatusDefs(statusRes.data || []);
      setWorkRoles(rolesRes.data || []);
    } catch (e) {
      toast("error", "שגיאה בטעינת נוכחות");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load attendance data when dates change
  useEffect(() => {
    if (!selectedWindow || dates.length === 0) return;
    const loadAttendance = async () => {
      try {
        const attRes = await api.get(tenantApi("/attendance"), {
          params: {
            window_id: selectedWindow,
            date_from: dates[0],
            date_to: dates[dates.length - 1],
          },
        });
        const map: Record<string, string> = {};
        for (const r of attRes.data) {
          map[`${r.employee_id}_${r.date}`] = r.status_code;
        }
        setAttendance(map);

        const confRes = await api.get(tenantApi("/attendance/conflicts")).catch(() => ({ data: [] }));
        setConflicts(confRes.data || []);
      } catch (e) {
        // ignore
      }
    };
    loadAttendance();
  }, [selectedWindow, dates.join(",")]);

  useEffect(() => { load(); }, [load]);

  const updateAttendance = (empId: string, date: string, status: string) => {
    setAttendance(prev => ({ ...prev, [`${empId}_${date}`]: status }));
    setEditingCell(null);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const byDate: Record<string, Array<{ employee_id: string; status_code: string }>> = {};
      for (const [key, status] of Object.entries(attendance)) {
        if (!status) continue;
        const [empId, date] = key.split("_");
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push({ employee_id: empId, status_code: status });
      }

      for (const [date, entries] of Object.entries(byDate)) {
        await api.post(tenantApi("/attendance/bulk"), {
          schedule_window_id: selectedWindow,
          date,
          entries,
        });
      }
      toast("success", "נוכחות נשמרה בהצלחה");
    } catch (e) {
      toast("error", "שגיאה בשמירת נוכחות");
    } finally {
      setSaving(false);
    }
  };

  const exportToExcel = () => {
    const rows = filteredEmployees.map(emp => {
      const row: Record<string, string> = {
        "שם": emp.full_name,
        "מספר אישי": emp.employee_number || "",
      };
      for (const date of dates) {
        const status = attendance[`${emp.id}_${date}`] || "";
        const def = statusDefs.find(s => s.code === status);
        row[date] = def ? (def.name[lang] || def.name.he || def.code) : status;
      }
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `attendance-${selectedDate}.xlsx`);
  };

  const exportToCSV = () => {
    let csv = "\uFEFF" + "שם,מספר אישי," + dates.join(",") + "\n";
    for (const emp of filteredEmployees) {
      const row = [emp.full_name, emp.employee_number || ""];
      for (const date of dates) {
        row.push(attendance[`${emp.id}_${date}`] || "");
      }
      csv += row.join(",") + "\n";
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance-${selectedDate}.csv`; a.click();
  };

  const navigateDate = (direction: number) => {
    const d = new Date(selectedDate);
    if (viewMode === "weekly") d.setDate(d.getDate() + direction * 7);
    else if (viewMode === "monthly") d.setMonth(d.getMonth() + direction);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const getStatusStyle = (code: string) => {
    const def = statusDefs.find(s => s.code === code);
    if (def?.color) {
      return { backgroundColor: def.color + "30", color: def.color, borderColor: def.color };
    }
    const fallback: Record<string, string> = {
      present: "#22c55e", home: "#3b82f6", sick: "#ef4444",
      vacation: "#eab308", reserve: "#a855f7", training: "#f97316",
    };
    const c = fallback[code] || "#6b7280";
    return { backgroundColor: c + "30", color: c, borderColor: c };
  };

  const getStatusIcon = (code: string) => {
    const def = statusDefs.find(s => s.code === code);
    return def?.icon || "";
  };

  const today = new Date().toISOString().split("T")[0];

  if (loading) return <TableSkeleton rows={10} cols={8} />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{t("nav.attendance")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="me-1 h-4 w-4" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="me-1 h-4 w-4" />Excel
          </Button>
          <Button onClick={saveAll} disabled={saving}>
            <Save className="me-1 h-4 w-4" />
            {saving ? "שומר..." : "שמור הכל"}
          </Button>
        </div>
      </div>

      {/* Controls Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">לוח עבודה</Label>
          <Select value={selectedWindow} onChange={e => setSelectedWindow(e.target.value)} className="w-40">
            {windows.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </div>

        {/* View Toggle */}
        <div className="space-y-1">
          <Label className="text-xs">תצוגה</Label>
          <div className="flex rounded-lg border overflow-hidden">
            {(["weekly", "monthly", "period"] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-sm ${viewMode === mode ? "bg-primary-500 text-white" : "bg-background hover:bg-accent"}`}
              >
                {mode === "weekly" ? "שבועי" : mode === "monthly" ? "חודשי" : "תקופה"}
              </button>
            ))}
          </div>
        </div>

        {/* Date Navigation */}
        <div className="space-y-1">
          <Label className="text-xs">{viewMode === "weekly" ? "שבוע" : viewMode === "monthly" ? "חודש" : "תאריך"}</Label>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigateDate(-1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-36" />
            <Button variant="ghost" size="sm" onClick={() => navigateDate(1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="space-y-1">
          <Label className="text-xs">חיפוש</Label>
          <div className="relative">
            <Search className="absolute start-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="שם / מספר..."
              className="w-40 ps-8"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-1">
          <Label className="text-xs">תפקיד</Label>
          <Select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="w-32">
            <option value="">הכל</option>
            {workRoles.map((r: any) => (
              <option key={r.id} value={r.id}>{r.name?.[lang] || r.name?.he}</option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">סטטוס</Label>
          <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-32">
            <option value="">הכל</option>
            {statusDefs.map(s => (
              <option key={s.code} value={s.code}>{s.icon} {s.name[lang] || s.name.he || s.code}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Status Legend */}
      <div className="flex flex-wrap gap-2">
        {statusDefs.map(s => (
          <span
            key={s.code}
            className="rounded-full px-3 py-1 text-xs font-medium border"
            style={getStatusStyle(s.code)}
          >
            {s.icon} {s.name[lang] || s.name.he || s.code}
          </span>
        ))}
      </div>

      {/* Attendance Grid */}
      <Card>
        <CardContent className="p-0">
          <div ref={tableRef} className="overflow-x-auto max-h-[calc(100vh-350px)]">
            <table className="w-full border-collapse" style={{ minWidth: `${150 + dates.length * 80}px` }}>
              <thead className="sticky top-0 z-20 bg-background">
                <tr className="border-b">
                  <th className="sticky start-0 z-30 bg-muted/80 backdrop-blur px-4 py-3 text-start font-medium min-w-[180px] border-e">
                    עובד ({filteredEmployees.length})
                  </th>
                  {dates.map(date => {
                    const d = new Date(date);
                    const dayIdx = d.getDay();
                    const isToday = date === today;
                    const isShabbat = dayIdx === 6;
                    return (
                      <th
                        key={date}
                        className={`px-1 py-2 text-center font-medium min-w-[80px] text-xs ${
                          isToday ? "bg-primary-50 dark:bg-primary-900/20" : isShabbat ? "bg-yellow-50 dark:bg-yellow-900/10" : ""
                        }`}
                      >
                        <div className="font-bold">{dayNames[dayIdx]}</div>
                        <div className="text-muted-foreground">{date.slice(5)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map(emp => (
                  <tr key={emp.id} className="border-b hover:bg-muted/10 transition-colors">
                    <td className="sticky start-0 z-10 bg-background border-e px-4 py-2">
                      <div className="font-medium text-sm">{emp.full_name}</div>
                      <div className="text-xs text-muted-foreground">{emp.employee_number}</div>
                    </td>
                    {dates.map(date => {
                      const key = `${emp.id}_${date}`;
                      const current = attendance[key] || "";
                      const hasConflict = conflicts.some(c => c.employee_id === emp.id && c.date === date);
                      const isToday = date === today;
                      const isEditing = editingCell === key;
                      const style = current ? getStatusStyle(current) : {};
                      const icon = current ? getStatusIcon(current) : "";

                      return (
                        <td
                          key={date}
                          className={`px-0.5 py-0.5 text-center relative ${
                            isToday ? "bg-primary-50/30 dark:bg-primary-900/10" : ""
                          } ${hasConflict ? "ring-2 ring-red-400 ring-inset" : ""}`}
                        >
                          {isEditing ? (
                            <div className="absolute inset-0 z-40 bg-background border-2 border-primary-500 rounded shadow-lg p-1 flex flex-col gap-0.5 overflow-y-auto max-h-[200px]">
                              <button
                                onClick={() => updateAttendance(emp.id, date, "")}
                                className="rounded px-2 py-1 text-xs hover:bg-muted text-start"
                              >
                                — ריק
                              </button>
                              {statusDefs.map(s => (
                                <button
                                  key={s.code}
                                  onClick={() => updateAttendance(emp.id, date, s.code)}
                                  className="rounded px-2 py-1 text-xs hover:bg-muted text-start flex items-center gap-1"
                                  style={{ color: s.color || undefined }}
                                >
                                  <span>{s.icon}</span>
                                  <span>{s.name[lang] || s.name.he || s.code}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          <button
                            onClick={() => setEditingCell(isEditing ? null : key)}
                            className="w-full h-full min-h-[32px] rounded text-xs font-medium cursor-pointer border transition-colors"
                            style={current ? {
                              backgroundColor: (style as any).backgroundColor,
                              color: (style as any).color,
                              borderColor: (style as any).borderColor,
                            } : { borderColor: "transparent" }}
                          >
                            {icon && <span className="text-sm">{icon}</span>}
                            {!icon && current && <span>{current}</span>}
                            {!current && <span className="text-muted-foreground">—</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-red-600">⚠ קונפליקטים ({conflicts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {conflicts.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between rounded bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm">
                  <span>{c.employee_name} — {c.date}</span>
                  <span>מערכת: {c.system_value} | גיליון: {c.sheets_value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
