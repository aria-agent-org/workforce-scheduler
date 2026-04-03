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
import { Save, Download, Search, ChevronLeft, ChevronRight, CalendarDays, Printer } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import * as XLSX from "xlsx";

type ViewMode = "weekly" | "monthly" | "period" | "calendar";

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
  const [calendarExpandedDay, setCalendarExpandedDay] = useState<string | null>(null);

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
    } else if (viewMode === "calendar") {
      // Full month with padding for calendar grid
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
      result = result.filter(e =>
        Array.isArray(e.work_roles) && e.work_roles.some((r: any) => r.id === filterRole)
      );
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
        // Prefer the active window, fall back to the first
        const activeWindow = winRes.data.find((w: any) => w.status === "active");
        setSelectedWindow((activeWindow || winRes.data[0]).id);
      }
      setStatusDefs(statusRes.data || []);
      setWorkRoles(rolesRes.data || []);
    } catch (e) {
      setLoadError(true);
      toast("error", "שגיאה בטעינת נוכחות");
    } finally {
      setLoading(false);
    }
  }, []);

  const [loadError, setLoadError] = useState(false);

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

  // Auto-save a single attendance cell change
  const autoSaveCell = async (empId: string, cellDate: string, statusCode: string) => {
    try {
      await api.post(tenantApi("/attendance/bulk"), {
        schedule_window_id: selectedWindow,
        date: cellDate,
        entries: [{ employee_id: empId, status_code: statusCode }],
      });
    } catch (e) {
      console.error("Auto-save failed", e);
      toast("error", "שגיאה בשמירה אוטומטית");
    }
  };

  const updateAttendance = (empId: string, date: string, status: string) => {
    setAttendance(prev => ({ ...prev, [`${empId}_${date}`]: status }));
    setEditingCell(null);
    // Instant auto-save for this cell
    if (selectedWindow && status) {
      autoSaveCell(empId, date, status);
    }
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
    else if (viewMode === "monthly" || viewMode === "calendar") d.setMonth(d.getMonth() + direction);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const getStatusStyle = (code: string) => {
    const def = statusDefs.find(s => s.code === code);
    if (def?.color) {
      return { backgroundColor: def.color + "30", color: def.color, borderColor: def.color };
    }
    const fallback: Record<string, string> = {
      present: "#22c55e", home: "#6B7F3B", sick: "#ef4444",
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

  if (loading) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
      </div>
      <TableSkeleton rows={10} cols={8} />
    </div>
  );

  if (loadError && employees.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <CalendarDays className="h-16 w-16 text-amber-500 mb-4" />
      <h2 className="text-xl font-bold mb-2">שגיאה בטעינת נוכחות</h2>
      <p className="text-muted-foreground mb-4">לא ניתן היה לטעון את הנתונים. נסה שוב.</p>
      <button onClick={load} className="inline-flex items-center gap-2 rounded-lg bg-primary-500 text-white px-4 py-2 text-sm hover:bg-primary-600 transition-colors">
        נסה שוב
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{t("nav.attendance")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="no-print hidden sm:flex min-h-[44px]" onClick={() => window.print()}>
            <Printer className="me-1 h-4 w-4" />הדפס
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:flex min-h-[44px]" onClick={exportToCSV}>
            <Download className="me-1 h-4 w-4" />CSV
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:flex min-h-[44px]" onClick={exportToExcel}>
            <Download className="me-1 h-4 w-4" />Excel
          </Button>
          <Button onClick={saveAll} disabled={saving} className="min-h-[44px]">
            <Save className="me-1 h-4 w-4" />
            {saving ? "שומר..." : "שמור הכל"}
          </Button>
        </div>
      </div>

      {/* Empty state: no windows */}
      {windows.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <div className="h-20 w-20 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-4">
              <CalendarDays className="h-10 w-10 text-primary-400" />
            </div>
            <p className="text-lg font-semibold text-foreground">אין נתוני נוכחות</p>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
              כדי לנהל נוכחות, יש ליצור קודם לוח עבודה בעמוד השיבוצים.
            </p>
            <Button size="sm" className="mt-4" onClick={() => window.location.href = "/scheduling"}>
              <CalendarDays className="me-1 h-4 w-4" />עבור לשיבוצים
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Controls Row */}
      <div className="flex items-center gap-2 md:gap-3 flex-wrap overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        <div className="space-y-1">
          <Label className="text-xs">לוח עבודה</Label>
          <Select value={selectedWindow} onChange={e => setSelectedWindow(e.target.value)} className="w-44">
            {windows.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          {selectedWindow && (
            <p className="text-[10px] text-muted-foreground">
              📋 נוכחות עבור: {windows.find((w: any) => w.id === selectedWindow)?.name}
            </p>
          )}
        </div>

        {/* View Toggle */}
        <div className="space-y-1">
          <Label className="text-xs">תצוגה</Label>
          <div className="flex rounded-lg border overflow-hidden">
            {(["weekly", "monthly", "period", "calendar"] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); if (mode === "calendar") setCalendarExpandedDay(null); }}
                className={`px-3 py-1.5 text-sm flex items-center gap-1 ${viewMode === mode ? "bg-primary-500 text-white" : "bg-background hover:bg-accent"}`}
              >
                {mode === "calendar" && <CalendarDays className="h-3.5 w-3.5" />}
                {mode === "weekly" ? "שבועי" : mode === "monthly" ? "חודשי" : mode === "period" ? "תקופה" : "לוח שנה"}
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

      {/* Mobile Card View for Attendance */}
      <div className={`md:hidden space-y-2 ${viewMode === "calendar" ? "hidden" : ""}`}>
        {filteredEmployees.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">אין עובדים</CardContent></Card>
        ) : filteredEmployees.map(emp => (
          <Card key={emp.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold text-sm">{emp.full_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{emp.employee_number}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {dates.slice(0, viewMode === "weekly" ? 7 : 14).map(date => {
                  const key = `${emp.id}_${date}`;
                  const current = attendance[key] || "";
                  const d = new Date(date);
                  const dayIdx = d.getDay();
                  const isToday = date === today;
                  const style = current ? getStatusStyle(current) : {};
                  const icon = current ? getStatusIcon(current) : "";
                  return (
                    <button
                      key={date}
                      onClick={() => setEditingCell(editingCell === key ? null : key)}
                      className={`flex flex-col items-center rounded-lg p-1.5 min-w-[42px] min-h-[44px] text-xs border transition-colors ${
                        isToday ? "ring-2 ring-primary-300" : ""
                      }`}
                      style={current ? {
                        backgroundColor: (style as any).backgroundColor,
                        color: (style as any).color,
                        borderColor: (style as any).borderColor,
                      } : {}}
                    >
                      <span className="font-bold text-[10px]">{dayNames[dayIdx]}</span>
                      <span className="text-[10px]">{date.slice(8)}</span>
                      {icon && <span className="text-sm">{icon}</span>}
                      {!icon && current && <span className="text-[10px] font-medium">{current.slice(0, 3)}</span>}
                    </button>
                  );
                })}
              </div>
              {editingCell?.startsWith(emp.id + "_") && (
                <div className="mt-2 flex flex-wrap gap-1 p-2 bg-muted/30 rounded-lg animate-in slide-in-from-top-1">
                  <button onClick={() => { updateAttendance(emp.id, editingCell.split("_")[1], ""); }} className="rounded px-2 py-1.5 text-xs hover:bg-muted min-h-[36px]">— ריק</button>
                  {statusDefs.map(s => (
                    <button key={s.code} onClick={() => { updateAttendance(emp.id, editingCell.split("_")[1], s.code); }}
                      className="rounded px-2 py-1.5 text-xs hover:bg-muted min-h-[36px] flex items-center gap-1"
                      style={{ color: s.color || undefined }}>
                      <span>{s.icon}</span><span>{s.name[lang] || s.name.he || s.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop Attendance Grid */}
      <Card className={`hidden ${viewMode === "calendar" ? "" : "md:block"}`}>
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
                          isToday ? "bg-primary-50 dark:bg-primary-900/20" : isShabbat ? "bg-amber-50 dark:bg-amber-900/10" : ""
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

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-2 sm:p-4">
              {/* Calendar Month Header */}
              <div className="text-center mb-3 font-bold text-lg">
                {new Date(selectedDate).toLocaleDateString("he-IL", { month: "long", year: "numeric" })}
              </div>
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {dayNames.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Padding for first day of month */}
                {(() => {
                  const firstDay = new Date(new Date(selectedDate).getFullYear(), new Date(selectedDate).getMonth(), 1).getDay();
                  return Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`pad-${i}`} className="min-h-[60px] sm:min-h-[80px]" />
                  ));
                })()}
                {dates.map(date => {
                  const isToday = date === today;
                  const isExpanded = calendarExpandedDay === date;
                  // Count statuses for this day
                  const statusCounts: Record<string, number> = {};
                  filteredEmployees.forEach(emp => {
                    const code = attendance[`${emp.id}_${date}`];
                    if (code) statusCounts[code] = (statusCounts[code] || 0) + 1;
                  });
                  const totalPresent = Object.entries(statusCounts)
                    .filter(([code]) => statusDefs.find(s => s.code === code)?.counts_as_present)
                    .reduce((sum, [, c]) => sum + c, 0);
                  const totalAbsent = filteredEmployees.length - totalPresent;

                  return (
                    <button
                      key={date}
                      onClick={() => setCalendarExpandedDay(isExpanded ? null : date)}
                      className={`rounded-lg border p-1 sm:p-2 text-start min-h-[60px] sm:min-h-[80px] transition-all hover:shadow-sm ${
                        isToday ? "ring-2 ring-primary-500 bg-primary-50/50 dark:bg-primary-900/10" : "hover:bg-muted/30"
                      } ${isExpanded ? "ring-2 ring-primary-500 bg-primary-50/50 dark:bg-primary-900/10" : ""}`}
                    >
                      <div className="text-xs sm:text-sm font-bold mb-0.5">{parseInt(date.slice(8))}</div>
                      {/* Status dots - compact mobile */}
                      <div className="flex flex-wrap gap-0.5">
                        {Object.entries(statusCounts).slice(0, 4).map(([code, count]) => {
                          const def = statusDefs.find(s => s.code === code);
                          return (
                            <span
                              key={code}
                              className="inline-flex items-center rounded-full px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium"
                              style={{
                                backgroundColor: (def?.color || "#6b7280") + "25",
                                color: def?.color || "#6b7280",
                              }}
                            >
                              {def?.icon || ""}{count}
                            </span>
                          );
                        })}
                      </div>
                      {/* Summary line on desktop */}
                      <div className="hidden sm:block mt-1 text-[10px] text-muted-foreground">
                        {totalPresent > 0 && <span className="text-green-600">נוכחים: {totalPresent}</span>}
                        {totalPresent > 0 && totalAbsent > 0 && " · "}
                        {totalAbsent > 0 && <span className="text-gray-500">אחר: {totalAbsent}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Expanded Day Detail */}
          {calendarExpandedDay && (
            <Card className="animate-in slide-in-from-top-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  {new Date(calendarExpandedDay).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {filteredEmployees.map(emp => {
                    const key = `${emp.id}_${calendarExpandedDay}`;
                    const code = attendance[key] || "";
                    const def = statusDefs.find(s => s.code === code);
                    const style = code ? getStatusStyle(code) : {};
                    return (
                      <div key={emp.id} className="flex items-center justify-between rounded-lg border p-2 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {emp.full_name?.[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{emp.full_name}</p>
                            <p className="text-xs text-muted-foreground">{emp.employee_number}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {code ? (
                            <span
                              className="rounded-full px-2.5 py-1 text-xs font-medium border"
                              style={{
                                backgroundColor: (style as any).backgroundColor,
                                color: (style as any).color,
                                borderColor: (style as any).borderColor,
                              }}
                            >
                              {def?.icon} {def?.name[lang] || def?.name.he || code}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          <Select
                            value={code}
                            onChange={e => updateAttendance(emp.id, calendarExpandedDay, e.target.value)}
                            className="w-28 text-xs"
                          >
                            <option value="">—</option>
                            {statusDefs.map(s => (
                              <option key={s.code} value={s.code}>{s.icon} {s.name[lang] || s.name.he || s.code}</option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                  {filteredEmployees.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">אין עובדים</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
