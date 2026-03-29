import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Save, Calendar } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

const statusColors: Record<string, string> = {
  present: "bg-green-200 text-green-800",
  home: "bg-blue-200 text-blue-800",
  sick: "bg-red-200 text-red-800",
  vacation: "bg-yellow-200 text-yellow-800",
  reserve: "bg-purple-200 text-purple-800",
  training: "bg-orange-200 text-orange-800",
};

export default function AttendancePage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [windows, setWindows] = useState<any[]>([]);
  const [selectedWindow, setSelectedWindow] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [statusDefs, setStatusDefs] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Generate date range for week view
  const getWeekDates = (centerDate: string) => {
    const d = new Date(centerDate);
    const dates: string[] = [];
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay()); // Sunday
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      dates.push(day.toISOString().split("T")[0]);
    }
    return dates;
  };

  const weekDates = getWeekDates(selectedDate);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, winRes, statusRes] = await Promise.all([
        api.get(tenantApi("/employees"), { params: { page_size: 200, is_active: true } }),
        api.get(tenantApi("/schedule-windows")),
        api.get(tenantApi("/attendance/statuses")),
      ]);
      setEmployees(empRes.data.items || []);
      setWindows(winRes.data);
      if (winRes.data.length > 0 && !selectedWindow) {
        setSelectedWindow(winRes.data[0].id);
      }
      setStatusDefs(statusRes.data);

      // Load attendance for the week
      if (winRes.data.length > 0) {
        const wId = selectedWindow || winRes.data[0].id;
        const attRes = await api.get(tenantApi("/attendance"), {
          params: { window_id: wId, date_from: weekDates[0], date_to: weekDates[6] },
        });
        const map: Record<string, string> = {};
        for (const r of attRes.data) {
          map[`${r.employee_id}_${r.date}`] = r.status_code;
        }
        setAttendance(map);

        // Load conflicts
        const confRes = await api.get(tenantApi("/attendance/conflicts"));
        setConflicts(confRes.data);
      }
    } catch (e) {
      toast("error", "שגיאה בטעינת נוכחות");
    } finally {
      setLoading(false);
    }
  }, [selectedWindow, selectedDate]);

  useEffect(() => { load(); }, [load]);

  const updateAttendance = (empId: string, date: string, status: string) => {
    setAttendance(prev => ({ ...prev, [`${empId}_${date}`]: status }));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Group by date
      const byDate: Record<string, Array<{ employee_id: string; status_code: string }>> = {};
      for (const [key, status] of Object.entries(attendance)) {
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

  const dayNames = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

  if (loading) return <TableSkeleton rows={10} cols={8} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("nav.attendance")}</h1>
        <div className="flex gap-2">
          <Button onClick={saveAll} disabled={saving}>
            <Save className="me-1 h-4 w-4" />
            {saving ? "שומר..." : "שמור הכל"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="space-y-1">
          <Label>לוח עבודה</Label>
          <Select value={selectedWindow} onChange={e => setSelectedWindow(e.target.value)}>
            {windows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>שבוע</Label>
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
        </div>
      </div>

      {/* Status Legend */}
      <div className="flex flex-wrap gap-2">
        {statusDefs.length > 0 ? statusDefs.map(s => (
          <span key={s.code} className={`rounded-full px-3 py-1 text-xs ${statusColors[s.code] || "bg-gray-200"}`}>
            {s.icon} {s.name[lang] || s.name.he || s.code}
          </span>
        )) : (
          Object.entries(statusColors).map(([code, cls]) => (
            <span key={code} className={`rounded-full px-3 py-1 text-xs ${cls}`}>{code}</span>
          ))
        )}
      </div>

      {/* Attendance Grid */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-start font-medium sticky start-0 bg-muted/50 z-10 min-w-[150px]">עובד</th>
                {weekDates.map((date, i) => (
                  <th key={date} className={`px-2 py-3 text-center font-medium min-w-[100px] ${
                    date === new Date().toISOString().split("T")[0] ? "bg-primary-50" : ""
                  }`}>
                    <div className="text-xs">{dayNames[i]}</div>
                    <div className="text-xs text-muted-foreground">{date.slice(5)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-2 font-medium sticky start-0 bg-background z-10">
                    <div className="text-sm">{emp.full_name}</div>
                    <div className="text-xs text-muted-foreground">{emp.employee_number}</div>
                  </td>
                  {weekDates.map(date => {
                    const key = `${emp.id}_${date}`;
                    const current = attendance[key] || "";
                    const hasConflict = conflicts.some(c => c.employee_id === emp.id && c.date === date);
                    return (
                      <td key={date} className={`px-1 py-1 text-center ${
                        date === new Date().toISOString().split("T")[0] ? "bg-primary-50/50" : ""
                      } ${hasConflict ? "ring-2 ring-red-400 ring-inset" : ""}`}>
                        <select
                          value={current}
                          onChange={e => updateAttendance(emp.id, date, e.target.value)}
                          className={`w-full rounded px-1 py-1 text-xs text-center cursor-pointer ${
                            statusColors[current] || "bg-gray-50"
                          }`}
                        >
                          <option value="">—</option>
                          <option value="present">נוכח</option>
                          <option value="home">בית</option>
                          <option value="sick">חולה</option>
                          <option value="vacation">חופשה</option>
                          <option value="reserve">מילואים</option>
                          <option value="training">הדרכה</option>
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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
              {conflicts.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded bg-red-50 px-3 py-2 text-sm">
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
