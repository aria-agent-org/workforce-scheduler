import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Clock, Filter } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

const actionColors: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  assign: "bg-purple-100 text-purple-700",
  set_attendance: "bg-yellow-100 text-yellow-700",
  bulk_import: "bg-orange-100 text-orange-700",
};

export default function AuditLogPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, page_size: 30 };
      if (entityFilter) params.entity_type = entityFilter;
      if (actionFilter) params.action = actionFilter;
      const { data } = await api.get(tenantApi("/audit-logs"), { params });
      setLogs(data.items);
      setTotal(data.total);
    } catch (e) {
      toast("error", "שגיאה בטעינת יומן");
    } finally {
      setLoading(false);
    }
  }, [page, entityFilter, actionFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">יומן פעולות</h1>

      <div className="flex items-center gap-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={entityFilter} onChange={e => { setEntityFilter(e.target.value); setPage(1); }}>
          <option value="">כל הישויות</option>
          <option value="employee">עובדים</option>
          <option value="schedule_window">לוחות עבודה</option>
          <option value="mission">משימות</option>
          <option value="mission_assignment">שיבוצים</option>
          <option value="rule">חוקים</option>
          <option value="attendance">נוכחות</option>
          <option value="setting">הגדרות</option>
        </Select>
        <Select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}>
          <option value="">כל הפעולות</option>
          <option value="create">יצירה</option>
          <option value="update">עדכון</option>
          <option value="delete">מחיקה</option>
          <option value="assign">שיבוץ</option>
        </Select>
      </div>

      {loading ? <TableSkeleton rows={10} cols={4} /> : (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">אין רשומות</CardContent></Card>
          ) : logs.map(log => (
            <Card key={log.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={actionColors[log.action] || "bg-gray-100"}>{log.action}</Badge>
                      <span className="text-sm font-medium">{log.entity_type}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{log.user_email}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {log.created_at?.replace("T", " ").slice(0, 19)}
                      {log.ip_address && ` · IP: ${log.ip_address}`}
                    </div>
                    {(log.before_state || log.after_state) && (
                      <div className="mt-2 flex gap-4 text-xs">
                        {log.before_state && (
                          <div className="bg-red-50 rounded px-2 py-1">
                            <span className="font-medium">לפני:</span> {JSON.stringify(log.before_state).slice(0, 80)}
                          </div>
                        )}
                        {log.after_state && (
                          <div className="bg-green-50 rounded px-2 py-1">
                            <span className="font-medium">אחרי:</span> {JSON.stringify(log.after_state).slice(0, 80)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {total > 30 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-sm text-muted-foreground">{total} רשומות</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>הקודם</Button>
                <Button variant="outline" size="sm" disabled={logs.length < 30} onClick={() => setPage(p => p + 1)}>הבא</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
