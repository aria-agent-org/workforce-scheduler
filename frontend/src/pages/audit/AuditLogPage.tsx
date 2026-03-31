import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Clock, Filter, ChevronLeft, ChevronRight, X } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

const actionColors: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  assign: "bg-purple-100 text-purple-700",
  set_attendance: "bg-yellow-100 text-yellow-700",
  bulk_import: "bg-orange-100 text-orange-700",
  reset: "bg-red-100 text-red-700",
  import_template: "bg-teal-100 text-teal-700",
  import_employees: "bg-teal-100 text-teal-700",
  override_conflict: "bg-amber-100 text-amber-700",
  mark_activated: "bg-indigo-100 text-indigo-700",
  update_attendance: "bg-yellow-100 text-yellow-700",
};

const actionLabels: Record<string, string> = {
  create: "יצירה",
  update: "עדכון",
  delete: "מחיקה",
  assign: "שיבוץ",
  set_attendance: "עדכון נוכחות",
  bulk_import: "ייבוא",
  reset: "איפוס",
  import_template: "ייבוא תבנית",
  import_employees: "ייבוא עובדים",
  override_conflict: "דריסת קונפליקט",
  mark_activated: "הפעלה",
  update_attendance: "עדכון נוכחות",
};

const entityLabels: Record<string, string> = {
  employee: "עובדים",
  schedule_window: "לוחות עבודה",
  mission: "משימות",
  mission_assignment: "שיבוצים",
  rule: "חוקים",
  attendance: "נוכחות",
  setting: "הגדרות",
  attendance_status_definition: "הגדרות נוכחות",
  daily_board_template: "תבניות לוח",
  mission_type: "סוגי משימות",
};

function JsonDiffView({ before, after }: { before: any; after: any }) {
  const allKeys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);

  return (
    <div className="grid grid-cols-2 gap-3 text-xs font-mono" dir="ltr">
      <div>
        <p className="font-semibold text-red-600 mb-1 font-sans" dir="rtl">לפני:</p>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 space-y-1 max-h-[300px] overflow-y-auto">
          {before ? (
            Array.from(allKeys).map(key => {
              const changed = JSON.stringify(before[key]) !== JSON.stringify(after?.[key]);
              return (
                <div key={key} className={changed ? "text-red-700 font-bold" : "text-gray-600"}>
                  <span className="text-gray-400">{key}:</span> {JSON.stringify(before[key]) ?? "—"}
                </div>
              );
            })
          ) : (
            <span className="text-gray-400">אין נתונים</span>
          )}
        </div>
      </div>
      <div>
        <p className="font-semibold text-green-600 mb-1 font-sans" dir="rtl">אחרי:</p>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 space-y-1 max-h-[300px] overflow-y-auto">
          {after ? (
            Array.from(allKeys).map(key => {
              const changed = JSON.stringify(before?.[key]) !== JSON.stringify(after[key]);
              return (
                <div key={key} className={changed ? "text-green-700 font-bold" : "text-gray-600"}>
                  <span className="text-gray-400">{key}:</span> {JSON.stringify(after[key]) ?? "—"}
                </div>
              );
            })
          ) : (
            <span className="text-gray-400">אין נתונים</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;

  // Filters
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Users for filter dropdown
  const [users, setUsers] = useState<any[]>([]);

  // Diff dialog
  const [selectedLog, setSelectedLog] = useState<any>(null);

  // Load users for dropdown
  useEffect(() => {
    api.get(tenantApi("/users")).then(res => {
      setUsers(Array.isArray(res.data) ? res.data : res.data?.items || []);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, page_size: pageSize };
      if (entityFilter) params.entity_type = entityFilter;
      if (actionFilter) params.action = actionFilter;
      if (userFilter) params.user_id = userFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const { data } = await api.get(tenantApi("/audit-logs"), { params });
      setLogs(data.items);
      setTotal(data.total);
    } catch (e) {
      toast("error", "שגיאה בטעינת יומן");
    } finally {
      setLoading(false);
    }
  }, [page, entityFilter, actionFilter, userFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  const clearFilters = () => {
    setEntityFilter("");
    setActionFilter("");
    setUserFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasActiveFilters = entityFilter || actionFilter || userFilter || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">יומן פעולות</h1>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">סינון</span>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-primary-500 hover:underline flex items-center gap-1">
                <X className="h-3 w-3" />נקה הכל
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Date From */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">מתאריך</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                className="text-sm"
              />
            </div>
            {/* Date To */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">עד תאריך</label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1); }}
                className="text-sm"
              />
            </div>
            {/* User */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">משתמש</label>
              <Select value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(1); }}>
                <option value="">כל המשתמשים</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.email || u.full_name || u.id}</option>
                ))}
              </Select>
            </div>
            {/* Entity Type */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">סוג ישות</label>
              <Select value={entityFilter} onChange={e => { setEntityFilter(e.target.value); setPage(1); }}>
                <option value="">כל הישויות</option>
                {Object.entries(entityLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Select>
            </div>
            {/* Action */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">פעולה</label>
              <Select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}>
                <option value="">כל הפעולות</option>
                {Object.entries(actionLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? <TableSkeleton rows={10} cols={4} /> : (
        <div className="space-y-2">
          {/* Results count */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{total} רשומות</span>
            {totalPages > 1 && (
              <span className="text-sm text-muted-foreground">עמוד {page} מתוך {totalPages}</span>
            )}
          </div>

          {logs.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">אין רשומות</CardContent></Card>
          ) : logs.map(log => (
            <Card
              key={log.id}
              className="hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => setSelectedLog(log)}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={actionColors[log.action] || "bg-gray-100"}>
                        {actionLabels[log.action] || log.action}
                      </Badge>
                      <span className="text-sm font-medium">
                        {entityLabels[log.entity_type] || log.entity_type}
                      </span>
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
                          <div className="bg-red-50 dark:bg-red-900/20 rounded px-2 py-1 max-w-[45%] truncate">
                            <span className="font-medium">לפני:</span> {JSON.stringify(log.before_state).slice(0, 80)}
                          </div>
                        )}
                        {log.after_state && (
                          <div className="bg-green-50 dark:bg-green-900/20 rounded px-2 py-1 max-w-[45%] truncate">
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <span className="text-sm text-muted-foreground">{total} רשומות סה״כ</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  className="min-h-[36px]"
                >
                  ראשון
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="min-h-[36px]"
                >
                  <ChevronRight className="h-4 w-4" />
                  הקודם
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`h-8 w-8 rounded text-sm transition-colors ${
                          page === pageNum
                            ? "bg-primary-500 text-white"
                            : "hover:bg-muted"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="min-h-[36px]"
                >
                  הבא
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="min-h-[36px]"
                >
                  אחרון
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail / Diff Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => { if (!open) setSelectedLog(null); }}>
        <DialogContent className="max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>פרטי פעולה</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 py-4">
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">פעולה</p>
                  <Badge className={actionColors[selectedLog.action] || "bg-gray-100"}>
                    {actionLabels[selectedLog.action] || selectedLog.action}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">סוג ישות</p>
                  <p className="font-medium">{entityLabels[selectedLog.entity_type] || selectedLog.entity_type}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">משתמש</p>
                  <p>{selectedLog.user_email || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">תאריך</p>
                  <p>{selectedLog.created_at?.replace("T", " ").slice(0, 19)}</p>
                </div>
                {selectedLog.ip_address && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">כתובת IP</p>
                    <p dir="ltr" className="font-mono text-xs">{selectedLog.ip_address}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">מזהה ישות</p>
                  <p dir="ltr" className="font-mono text-xs truncate" title={selectedLog.entity_id}>{selectedLog.entity_id}</p>
                </div>
              </div>

              {/* JSON Diff */}
              {(selectedLog.before_state || selectedLog.after_state) && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">השוואת שינויים</h3>
                  <JsonDiffView
                    before={selectedLog.before_state}
                    after={selectedLog.after_state}
                  />
                </div>
              )}

              {/* No changes */}
              {!selectedLog.before_state && !selectedLog.after_state && (
                <p className="text-sm text-muted-foreground text-center py-4">אין נתוני שינויים לרשומה זו</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
