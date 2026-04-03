import { useState, useEffect, useCallback } from "react";
import { tenantApi } from "@/lib/api";
import { BarChart3, TrendingUp, Users, Calendar, RefreshCw } from "lucide-react";

interface Overview {
  period_days: number;
  total_employees: number;
  total_missions: number;
  total_assignments: number;
  total_swap_requests: number;
  coverage_pct: number;
  avg_missions_per_employee: number;
}

interface EmployeeStat {
  id: string;
  name: string;
  assignments: number;
}

interface Fairness {
  average: number;
  max: number;
  min: number;
  deviation_pct: number;
}

interface WeekTrend {
  week_start: string;
  week_end: string;
  missions: number;
  assignments: number;
  coverage_pct: number;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [employeeStats, setEmployeeStats] = useState<EmployeeStat[]>([]);
  const [fairness, setFairness] = useState<Fairness | null>(null);
  const [trends, setTrends] = useState<WeekTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, empRes, trendsRes] = await Promise.all([
        tenantApi("get", `/analytics/overview?days=${days}`),
        tenantApi("get", `/analytics/employee-stats?days=${days}`),
        tenantApi("get", "/analytics/trends"),
      ]);
      setOverview(overviewRes.data);
      setEmployeeStats(empRes.data.employees);
      setFairness(empRes.data.fairness);
      setTrends(trendsRes.data.weeks);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const maxAssignments = Math.max(...employeeStats.map(e => e.assignments), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" /> אנליטיקס
        </h1>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="text-sm bg-muted rounded-xl px-3 py-2 border-0"
          >
            <option value={7}>שבוע</option>
            <option value={14}>שבועיים</option>
            <option value={30}>חודש</option>
            <option value={60}>חודשיים</option>
            <option value={90}>רבעון</option>
          </select>
          <button onClick={loadData} className="p-2 rounded-xl hover:bg-muted">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "חיילים פעילים", value: overview.total_employees, icon: "👥" },
            { label: "משימות", value: overview.total_missions, icon: "📋" },
            { label: "שיבוצים", value: overview.total_assignments, icon: "👤" },
            { label: "כיסוי", value: `${overview.coverage_pct}%`, icon: overview.coverage_pct >= 80 ? "✅" : "⚠️" },
            { label: "בקשות החלפה", value: overview.total_swap_requests, icon: "🔄" },
            { label: "ממוצע לחייל", value: overview.avg_missions_per_employee, icon: "📊" },
          ].map((kpi, i) => (
            <div key={i} className="bg-card rounded-2xl border p-4 text-center">
              <span className="text-2xl">{kpi.icon}</span>
              <p className="text-2xl font-bold mt-1">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Weekly Trends */}
      {trends.length > 0 && (
        <div className="bg-card rounded-2xl border p-6">
          <h2 className="font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> מגמות שבועיות
          </h2>
          <div className="space-y-2">
            {trends.map((week, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">
                  {new Date(week.week_start).toLocaleDateString("he-IL", { day: "numeric", month: "short" })}
                </span>
                <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all"
                    style={{ width: `${Math.min(week.coverage_pct, 100)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                    {week.coverage_pct}% ({week.assignments}/{week.missions})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employee Distribution */}
      <div className="bg-card rounded-2xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold flex items-center gap-2">
            <Users className="h-5 w-5" /> חלוקת משימות לפי חייל
          </h2>
          {fairness && (
            <span className={`text-xs px-3 py-1 rounded-full ${
              fairness.deviation_pct <= 30
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
            }`}>
              סטייה: {fairness.deviation_pct}% | ממוצע: {fairness.average}
            </span>
          )}
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-hide">
          {employeeStats.slice(0, 30).map(emp => (
            <div key={emp.id} className="flex items-center gap-3">
              <span className="text-sm w-28 truncate flex-shrink-0">{emp.name}</span>
              <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-400 rounded-full transition-all"
                  style={{ width: `${(emp.assignments / maxAssignments) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-8 text-left">{emp.assignments}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
