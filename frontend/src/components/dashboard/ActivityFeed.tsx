import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { getTenantSlug } from "@/lib/api";

interface ActivityItem {
  id: string;
  action: string;
  description: string;
  icon: string;
  user_name: string;
  timestamp: string;
}

interface ActivityFeedData {
  items: ActivityItem[];
  total: number;
  stats: Record<string, number>;
}

export default function ActivityFeed() {
  const [data, setData] = useState<ActivityFeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

  const load = useCallback(async () => {
    try {
      const slug = getTenantSlug();
      const res = await api.get(`/api/v1/${slug}/activity-feed`, { params: { hours, limit: 30 } });
      setData(res.data);
    } catch {
      // silently fail — activity feed is non-critical
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="bg-card rounded-2xl border p-4 space-y-3">
        <h3 className="font-bold text-sm">📡 פעילות אחרונה</h3>
        <div className="space-y-2">
          {[1,2,3].map(i => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="bg-card rounded-2xl border p-4">
        <h3 className="font-bold text-sm">📡 פעילות אחרונה</h3>
        <p className="text-sm text-muted-foreground mt-2">אין פעילות ב-{hours} השעות האחרונות</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">📡 פעילות אחרונה ({data.total})</h3>
        <select
          value={hours}
          onChange={e => setHours(Number(e.target.value))}
          className="text-xs bg-muted rounded-lg px-2 py-1 border-0"
        >
          <option value={6}>6 שעות</option>
          <option value={12}>12 שעות</option>
          <option value={24}>24 שעות</option>
          <option value={48}>יומיים</option>
          <option value={168}>שבוע</option>
        </select>
      </div>

      {/* Stats Summary */}
      {Object.keys(data.stats).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(data.stats).slice(0, 5).map(([action, count]) => (
            <span key={action} className="text-xs bg-muted px-2 py-1 rounded-full">
              {_actionLabel(action)}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Feed Items */}
      <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-hide">
        {data.items.map(item => (
          <div key={item.id} className="flex items-start gap-2 p-2 rounded-xl hover:bg-muted/50 transition-colors">
            <span className="text-lg flex-shrink-0">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-tight">{item.description}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {item.user_name && (
                  <span className="text-xs text-muted-foreground">{item.user_name}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {_formatTime(item.timestamp)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function _actionLabel(action: string): string {
  const labels: Record<string, string> = {
    "mission.created": "משימות חדשות",
    "mission.assigned": "שיבוצים",
    "swap.requested": "בקשות החלפה",
    "attendance.recorded": "נוכחות",
    "user.login": "כניסות",
    "employee.created": "חיילים חדשים",
  };
  return labels[action] || action.split(".")[0];
}

function _formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "עכשיו";
    if (mins < 60) return `לפני ${mins} דק׳`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `לפני ${hours} שע׳`;
    return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}
