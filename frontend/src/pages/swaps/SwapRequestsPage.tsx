import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeftRight, Check, X, AlertTriangle, ChevronDown, ChevronUp, Filter, FileSpreadsheet } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import * as XLSX from "xlsx";

interface SwapRequest {
  id: string;
  requester_id: string;
  requester_name: string;
  target_id: string | null;
  target_name: string | null;
  swap_type: "swap" | "handoff";
  mission_id: string | null;
  mission_name: string | null;
  date: string | null;
  status: "pending" | "approved" | "rejected" | "completed";
  reason: string | null;
  validation_result: any | null;
  created_at: string;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "completed";

export default function SwapRequestsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string; action: "approve" | "reject" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(tenantApi("/swap-requests"));
      setSwaps(Array.isArray(data) ? data : data.items || []);
    } catch (e) {
      toast("error", t("swaps.loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredSwaps = useMemo(() => {
    if (statusFilter === "all") return swaps;
    return swaps.filter(s => s.status === statusFilter);
  }, [swaps, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: swaps.length, pending: 0, approved: 0, rejected: 0, completed: 0 };
    swaps.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1; });
    return counts;
  }, [swaps]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setActionLoading(id);
    try {
      await api.post(tenantApi(`/swap-requests/${id}/${action}`));
      toast("success", action === "approve" ? t("swaps.approved") : t("swaps.rejected"));
      load();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || t("error"));
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: "default" | "success" | "warning" | "destructive"; label: string }> = {
      pending: { variant: "warning", label: t("swaps.statusPending") },
      approved: { variant: "success", label: t("swaps.statusApproved") },
      rejected: { variant: "destructive", label: t("swaps.statusRejected") },
      completed: { variant: "default", label: t("swaps.statusCompleted") },
    };
    const cfg = map[status] || { variant: "default" as const, label: status };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch { return d; }
  };

  const exportSwapsExcel = () => {
    const data = filteredSwaps.map(sr => ({
      "מבקש": sr.requester_name,
      "מחליף": sr.target_name || "—",
      "סוג": sr.swap_type === "swap" ? "החלפה" : "מסירה",
      "סיבה": sr.reason || "",
      "סטטוס": sr.status === "pending" ? "ממתין" : sr.status === "approved" ? "אושר" : sr.status === "rejected" ? "נדחה" : "הושלם",
      "תאריך יצירה": formatDate(sr.created_at),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "בקשות החלפה");
    XLSX.writeFile(wb, "swap_requests.xlsx");
  };

  if (loading) return <TableSkeleton rows={5} cols={4} />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{t("swaps.title")}</h1>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {t("swaps.total")}: {swaps.length} | {t("swaps.statusPending")}: {statusCounts.pending}
          </div>
          <Button variant="outline" size="sm" onClick={exportSwapsExcel} className="min-h-[36px]">
            <FileSpreadsheet className="me-1 h-4 w-4" />ייצוא Excel
          </Button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        {(["all", "pending", "approved", "rejected", "completed"] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              statusFilter === f
                ? "bg-primary-500 text-white"
                : "bg-muted/50 hover:bg-muted"
            }`}
          >
            {f === "all" ? t("swaps.filterAll") :
             f === "pending" ? t("swaps.statusPending") :
             f === "approved" ? t("swaps.statusApproved") :
             f === "rejected" ? t("swaps.statusRejected") :
             t("swaps.statusCompleted")}
            <span className={`rounded-full px-1.5 text-xs ${
              statusFilter === f ? "bg-white/20" : "bg-muted-foreground/10"
            }`}>
              {statusCounts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* Swap Cards */}
      {filteredSwaps.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("swaps.noRequests")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSwaps.map(sr => {
            const isExpanded = expandedId === sr.id;
            const hasValidation = sr.validation_result && Object.keys(sr.validation_result).length > 0;
            const hasConflicts = sr.validation_result?.conflicts?.length > 0 ||
              sr.validation_result?.requester_conflicts?.length > 0 ||
              sr.validation_result?.target_conflicts?.length > 0;

            return (
              <Card key={sr.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  {/* Main Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                        <ArrowLeftRight className="h-5 w-5 text-primary-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{sr.requester_name}</h3>
                          {sr.target_name && (
                            <>
                              <span className="text-muted-foreground text-xs">←→</span>
                              <span className="font-medium text-sm">{sr.target_name}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {sr.swap_type === "swap" ? t("swaps.typeSwap") : t("swaps.typeHandoff")}
                          </span>
                          {sr.mission_name && (
                            <span className="text-xs bg-muted/50 rounded px-1.5 py-0.5">
                              {sr.mission_name}
                            </span>
                          )}
                          {sr.date && (
                            <span className="text-xs text-muted-foreground">
                              📅 {formatDate(sr.date)}
                            </span>
                          )}
                        </div>
                        {sr.reason && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {t("swaps.reason")}: {sr.reason}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatDate(sr.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {statusBadge(sr.status)}
                      {sr.status === "pending" && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-[36px] min-w-[36px]"
                            disabled={actionLoading === sr.id}
                            onClick={() => setConfirmDialog({ id: sr.id, action: "approve" })}
                          >
                            <Check className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-[36px] min-w-[36px]"
                            disabled={actionLoading === sr.id}
                            onClick={() => setConfirmDialog({ id: sr.id, action: "reject" })}
                          >
                            <X className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expand toggle for validation */}
                  {hasValidation && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : sr.id)}
                      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      {hasConflicts && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                      <span>{t("swaps.validationDetails")}</span>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  )}

                  {/* Expanded Validation Detail */}
                  {isExpanded && hasValidation && (
                    <div className="mt-3 space-y-2 animate-in slide-in-from-top-1">
                      {/* Requester conflicts */}
                      {(sr.validation_result.requester_conflicts || sr.validation_result.conflicts || []).length > 0 && (
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-3">
                          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
                            ⚠ {t("swaps.requesterConflicts")} ({sr.requester_name})
                          </p>
                          <ul className="space-y-1">
                            {(sr.validation_result.requester_conflicts || sr.validation_result.conflicts || []).map((c: any, i: number) => (
                              <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                                • {c.message || c.description || JSON.stringify(c)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {/* Target conflicts */}
                      {(sr.validation_result.target_conflicts || []).length > 0 && (
                        <div className="rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 p-3">
                          <p className="text-xs font-semibold text-red-800 dark:text-red-300 mb-1">
                            ⚠ {t("swaps.targetConflicts")} ({sr.target_name})
                          </p>
                          <ul className="space-y-1">
                            {sr.validation_result.target_conflicts.map((c: any, i: number) => (
                              <li key={i} className="text-xs text-red-700 dark:text-red-400">
                                • {c.message || c.description || JSON.stringify(c)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {/* General validation info */}
                      {sr.validation_result.valid !== undefined && (
                        <div className={`rounded-lg p-2 text-xs ${
                          sr.validation_result.valid
                            ? "bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400"
                            : "bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400"
                        }`}>
                          {sr.validation_result.valid ? "✓ " + t("swaps.validationPassed") : "✗ " + t("swaps.validationFailed")}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Desktop Table View */}
      <div className="hidden lg:block">
        {filteredSwaps.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground">{t("swaps.requester")}</th>
                      <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground">{t("swaps.target")}</th>
                      <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground">{t("swaps.mission")}</th>
                      <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground">{t("swaps.date")}</th>
                      <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground">{t("swaps.type")}</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">{t("status")}</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSwaps.map(sr => (
                      <tr key={sr.id} className="border-b hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium">{sr.requester_name}</td>
                        <td className="px-4 py-3 text-sm">{sr.target_name || "—"}</td>
                        <td className="px-4 py-3 text-sm">{sr.mission_name || "—"}</td>
                        <td className="px-4 py-3 text-sm">{formatDate(sr.date)}</td>
                        <td className="px-4 py-3 text-sm">
                          {sr.swap_type === "swap" ? t("swaps.typeSwap") : t("swaps.typeHandoff")}
                        </td>
                        <td className="px-4 py-3 text-center">{statusBadge(sr.status)}</td>
                        <td className="px-4 py-3 text-center">
                          {sr.status === "pending" ? (
                            <div className="flex justify-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-[36px]"
                                disabled={actionLoading === sr.id}
                                onClick={() => setConfirmDialog({ id: sr.id, action: "approve" })}
                              >
                                <Check className="h-4 w-4 text-green-500 me-1" />
                                {t("swaps.approve")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-[36px]"
                                disabled={actionLoading === sr.id}
                                onClick={() => setConfirmDialog({ id: sr.id, action: "reject" })}
                              >
                                <X className="h-4 w-4 text-red-500 me-1" />
                                {t("swaps.reject")}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirm Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.action === "approve" ? t("swaps.confirmApprove") : t("swaps.confirmReject")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            {confirmDialog?.action === "approve"
              ? t("swaps.confirmApproveMsg")
              : t("swaps.confirmRejectMsg")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)} className="min-h-[44px]">
              {t("cancel")}
            </Button>
            <Button
              variant={confirmDialog?.action === "reject" ? "destructive" : "default"}
              onClick={() => confirmDialog && handleAction(confirmDialog.id, confirmDialog.action)}
              disabled={!!actionLoading}
              className="min-h-[44px]"
            >
              {actionLoading ? "..." : confirmDialog?.action === "approve" ? t("swaps.approve") : t("swaps.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
