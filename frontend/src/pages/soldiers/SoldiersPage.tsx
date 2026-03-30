import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { UserPlus, Search, Download, Upload, Pencil, Trash2, FileSpreadsheet, Mail, KeyRound, Bell, CheckSquare } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import AutoSaveIndicator from "@/components/common/AutoSaveIndicator";
import { useAutoSave } from "@/hooks/useAutoSave";

interface Soldier {
  id: string;
  employee_number: string;
  full_name: string;
  status: string;
  is_active: boolean;
  preferred_language: string;
  notes: string | null;
  notification_channels: Record<string, any> | null;
  work_roles: Array<{ id: string; name: { he: string; en: string }; color: string; is_primary: boolean }>;
  created_at: string;
}

export default function SoldiersPage() {
  const { t, i18n } = useTranslation("employees");
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [workRoles, setWorkRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingSoldier, setEditingSoldier] = useState<Soldier | null>(null);
  const [formData, setFormData] = useState({
    employee_number: "", full_name: "", preferred_language: "he", notes: "",
    phone: "", email: "", work_role_ids: [] as string[],
  });

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Soldier | null>(null);

  // Auto-save for edit mode
  const autoSaveFn = useCallback(async () => {
    if (!editingSoldier) return;
    await api.patch(tenantApi(`/employees/${editingSoldier.id}`), {
      full_name: formData.full_name,
      preferred_language: formData.preferred_language,
      notes: formData.notes || null,
      notification_channels: {
        phone_whatsapp: formData.phone || undefined,
        email: formData.email || undefined,
      },
    });
    if (formData.work_role_ids.length > 0) {
      await api.post(tenantApi(`/employees/${editingSoldier.id}/work-roles`),
        formData.work_role_ids.map((id, i) => ({ work_role_id: id, is_primary: i === 0 }))
      );
    }
  }, [editingSoldier, formData]);

  const { triggerAutoSave: triggerSoldierAutoSave, saving: soldierSaving, saved: soldierSaved, error: soldierError } = useAutoSave(autoSaveFn, {
    delay: 2000,
    onError: () => toast("error", "שגיאה בשמירה אוטומטית"),
  });

  // Trigger auto-save when form changes in edit mode
  const formInitRef = useRef(false);
  useEffect(() => {
    if (!editingSoldier) { formInitRef.current = false; return; }
    if (!formInitRef.current) { formInitRef.current = true; return; }
    triggerSoldierAutoSave();
  }, [formData, editingSoldier]);

  // Invitation modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedForInvite, setSelectedForInvite] = useState<string[]>([]);

  const loadSoldiers = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, page_size: 50, search: search || undefined };
      if (filter === "active") params.is_active = true;
      if (filter === "inactive") params.is_active = false;
      const [empRes, wrRes] = await Promise.all([
        api.get(tenantApi("/employees"), { params }),
        api.get(tenantApi("/settings/work-roles")),
      ]);
      setSoldiers(empRes.data.items);
      setTotal(empRes.data.total);
      setWorkRoles(wrRes.data);
    } catch (e) {
      toast("error", "שגיאה בטעינת חיילים");
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  useEffect(() => { loadSoldiers(); }, [loadSoldiers]);

  const handleSave = async () => {
    try {
      if (editingSoldier) {
        await api.patch(tenantApi(`/employees/${editingSoldier.id}`), {
          full_name: formData.full_name,
          preferred_language: formData.preferred_language,
          notes: formData.notes || null,
          notification_channels: {
            phone_whatsapp: formData.phone || undefined,
            email: formData.email || undefined,
          },
        });
        // Update work roles
        if (formData.work_role_ids.length > 0) {
          await api.post(tenantApi(`/employees/${editingSoldier.id}/work-roles`),
            formData.work_role_ids.map((id, i) => ({ work_role_id: id, is_primary: i === 0 }))
          );
        }
        toast("success", "חייל עודכן בהצלחה");
      } else {
        const res = await api.post(tenantApi("/employees"), {
          employee_number: formData.employee_number,
          full_name: formData.full_name,
          preferred_language: formData.preferred_language,
          notes: formData.notes || null,
          notification_channels: {
            phone_whatsapp: formData.phone || undefined,
            email: formData.email || undefined,
          },
        });
        // Assign work roles
        if (formData.work_role_ids.length > 0) {
          await api.post(tenantApi(`/employees/${res.data.id}/work-roles`),
            formData.work_role_ids.map((id, i) => ({ work_role_id: id, is_primary: i === 0 }))
          );
        }
        toast("success", "חייל נוצר בהצלחה");
      }
      setShowModal(false);
      setEditingSoldier(null);
      loadSoldiers();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה בשמירה");
    }
  };

  const handleDelete = async (s: Soldier) => {
    try {
      await api.delete(tenantApi(`/employees/${s.id}`));
      toast("success", "חייל הושבת בהצלחה");
      loadSoldiers();
    } catch (e) {
      toast("error", "שגיאה במחיקה");
    }
  };

  const openCreate = () => {
    setEditingSoldier(null);
    setFormData({ employee_number: "", full_name: "", preferred_language: "he", notes: "", phone: "", email: "", work_role_ids: [] });
    setShowModal(true);
  };

  const openEdit = (s: Soldier) => {
    setEditingSoldier(s);
    setFormData({
      employee_number: s.employee_number,
      full_name: s.full_name,
      preferred_language: s.preferred_language,
      notes: s.notes || "",
      phone: s.notification_channels?.phone_whatsapp || "",
      email: s.notification_channels?.email || "",
      work_role_ids: s.work_roles?.map(r => r.id) || [],
    });
    setShowModal(true);
  };

  // CSV/Excel import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) {
      toast("error", "קובץ ריק או ללא שורות נתונים");
      return;
    }

    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const preview: any[] = [];
    const errors: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      const row: any = {};
      headers.forEach((h, idx) => {
        const key = h.toLowerCase().replace(/\s+/g, "_");
        if (key.includes("מספר") || key.includes("number") || key === "employee_number") row.employee_number = values[idx];
        else if (key.includes("שם") || key.includes("name") || key === "full_name") row.full_name = values[idx];
        else if (key.includes("טלפון") || key.includes("phone")) row.phone = values[idx];
        else if (key.includes("הערות") || key.includes("notes")) row.notes = values[idx];
      });

      if (!row.employee_number || !row.full_name) {
        errors.push({ row: i, error: "חסר מספר אישי או שם מלא" });
      } else {
        preview.push({ ...row, _row: i });
      }
    }

    setImportPreview(preview);
    setImportErrors(errors);
    setShowImportModal(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const executeImport = async () => {
    setImporting(true);
    try {
      const employees = importPreview.map(r => ({
        employee_number: r.employee_number,
        full_name: r.full_name,
        notes: r.notes || null,
      }));
      const res = await api.post(tenantApi("/employees/bulk-import"), {
        employees,
        skip_errors: true,
      });
      toast("success", `יובאו ${res.data.created} חיילים בהצלחה`);
      if (res.data.errors?.length > 0) {
        toast("warning", `${res.data.errors.length} שורות עם שגיאות`);
      }
      setShowImportModal(false);
      loadSoldiers();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה בייבוא");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = "מספר אישי,שם מלא,טלפון,הערות\n001,ישראל ישראלי,0501234567,\n";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "soldiers_template.csv"; a.click();
  };

  const exportCSV = () => {
    const headers = ["מספר אישי,שם מלא,סטטוס,פעיל,תפקידים"];
    const rows = soldiers.map(s => {
      const roles = s.work_roles?.map(r => r.name[lang] || r.name.he).join("; ") || "";
      return `${s.employee_number},${s.full_name},${s.status},${s.is_active ? "כן" : "לא"},${roles}`;
    });
    const csv = [...headers, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "soldiers.csv"; a.click();
  };

  // Bulk actions
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === soldiers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(soldiers.map(s => s.id)));
    }
  };

  const bulkAssignRole = async (roleId: string) => {
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map(id =>
        api.post(tenantApi(`/employees/${id}/work-roles`), [{ work_role_id: roleId, is_primary: true }])
      ));
      toast("success", `תפקיד עודכן ל-${ids.length} חיילים`);
      setSelectedIds(new Set());
      loadSoldiers();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה בעדכון תפקיד");
    }
  };

  const bulkChangeStatus = async (active: boolean) => {
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map(id =>
        api.patch(tenantApi(`/employees/${id}`), { is_active: active })
      ));
      toast("success", `סטטוס עודכן ל-${ids.length} חיילים`);
      setSelectedIds(new Set());
      loadSoldiers();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const bulkGenerateCodes = async () => {
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map(id =>
        api.post(tenantApi("/registration/generate-code"), { employee_id: id }).catch(() => null)
      ));
      toast("success", `נוצרו קודים ל-${ids.length} חיילים`);
      setSelectedIds(new Set());
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה ביצירת קודים");
    }
  };

  const bulkSendNotification = async () => {
    try {
      const ids = Array.from(selectedIds);
      await api.post(tenantApi("/notifications/bulk"), { employee_ids: ids, event_type: "general" });
      toast("success", `נשלחו התראות ל-${ids.length} חיילים`);
      setSelectedIds(new Set());
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const sendBulkInvitations = async () => {
    try {
      const res = await api.post(tenantApi("/invitations/bulk"), {
        employee_ids: selectedForInvite,
      });
      toast("success", `נשלחו ${res.data.created} הזמנות`);
      setShowInviteModal(false);
      setSelectedForInvite([]);
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה בשליחת הזמנות");
    }
  };

  const toggleInviteSelect = (id: string) => {
    setSelectedForInvite(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button variant="outline" size="sm" className="hidden sm:flex min-h-[44px]" onClick={downloadTemplate}>
            <Download className="me-1 h-4 w-4" />
            {t("downloadTemplate")}
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:flex min-h-[44px]" onClick={() => fileInputRef.current?.click()}>
            <Upload className="me-1 h-4 w-4" />
            {t("bulkImport")}
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:flex min-h-[44px]" onClick={exportCSV}>
            <FileSpreadsheet className="me-1 h-4 w-4" />
            {t("exportList")}
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:flex min-h-[44px]" onClick={() => { setSelectedForInvite(soldiers.map(s => s.id)); setShowInviteModal(true); }}>
            <Mail className="me-1 h-4 w-4" />
            הזמנות
          </Button>
          <Button size="sm" onClick={openCreate} className="min-h-[44px]">
            <UserPlus className="me-1 h-4 w-4" />
            {t("addSoldier")}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="ps-9"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                filter === f
                  ? "bg-primary-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {t(`filters.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <Card className="border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20">
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <Badge className="bg-primary-500 text-white">{selectedIds.size} נבחרו</Badge>
            <div className="flex flex-wrap gap-1.5">
              {workRoles.slice(0, 4).map((wr: any) => (
                <Button key={wr.id} size="sm" variant="outline" className="text-xs h-8" onClick={() => bulkAssignRole(wr.id)}>
                  שנה ל{wr.name?.[lang] || wr.name?.he}
                </Button>
              ))}
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => bulkChangeStatus(true)}>
                <CheckSquare className="me-1 h-3 w-3" />הפעל
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => bulkChangeStatus(false)}>
                השבת
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={bulkSendNotification}>
                <Bell className="me-1 h-3 w-3" />שלח התראה
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={bulkGenerateCodes}>
                <KeyRound className="me-1 h-3 w-3" />צור קודים
              </Button>
            </div>
            <Button size="sm" variant="ghost" className="text-xs h-8 ms-auto" onClick={() => setSelectedIds(new Set())}>
              בטל בחירה
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={8} cols={5} />
          ) : (
            <>
              {/* Desktop table */}
              <div className="overflow-x-auto hidden md:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50 text-sm">
                      <th className="px-3 py-3 w-10">
                        <input type="checkbox" checked={selectedIds.size === soldiers.length && soldiers.length > 0}
                          onChange={toggleSelectAll} className="rounded h-4 w-4" />
                      </th>
                      <th className="px-4 py-3 text-start font-medium">{t("employeeNumber")}</th>
                      <th className="px-4 py-3 text-start font-medium">{t("fullName")}</th>
                      <th className="px-4 py-3 text-start font-medium">{t("role")}</th>
                      <th className="px-4 py-3 text-start font-medium">{t("status")}</th>
                      <th className="px-4 py-3 text-start font-medium">{t("common:actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soldiers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          {t("noSoldiers")}
                        </td>
                      </tr>
                    ) : (
                      soldiers.map((s) => (
                        <tr key={s.id} className={`border-b transition-colors ${selectedIds.has(s.id) ? "bg-primary-50 dark:bg-primary-900/10" : "hover:bg-muted/30"}`}>
                          <td className="px-3 py-3">
                            <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} className="rounded h-4 w-4" />
                          </td>
                          <td className="px-4 py-3 font-mono text-sm">{s.employee_number}</td>
                          <td className="px-4 py-3 font-medium max-w-[200px] truncate" title={s.full_name}>{s.full_name}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {s.work_roles?.map((r) => (
                                <Badge key={r.id} className="text-xs" style={{ backgroundColor: r.color + "20", color: r.color }}>
                                  {r.name[lang] || r.name.he}
                                </Badge>
                              ))}
                              {(!s.work_roles || s.work_roles.length === 0) && (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={s.is_active ? "success" : "destructive"}>
                              {s.is_active ? t("active") : t("inactive")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(s)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="md:hidden space-y-2 p-3">
                {soldiers.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">{t("noSoldiers")}</p>
                ) : soldiers.map((s) => (
                  <div key={s.id} className={`rounded-xl border p-3 transition-all ${selectedIds.has(s.id) ? "ring-2 ring-primary-300 bg-primary-50/50 dark:bg-primary-900/10" : ""}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} className="rounded h-5 w-5 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{s.full_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{s.employee_number}</p>
                          </div>
                          <Badge variant={s.is_active ? "success" : "destructive"} className="text-[10px] flex-shrink-0">
                            {s.is_active ? t("active") : t("inactive")}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {s.work_roles?.map((r) => (
                            <Badge key={r.id} className="text-[10px]" style={{ backgroundColor: r.color + "20", color: r.color }}>
                              {r.name[lang] || r.name.he}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-1 mt-2 justify-end">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setDeleteTarget(s)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {total > 50 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {t("common:pagination.showing")} {soldiers.length} {t("common:pagination.of")} {total}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  {t("common:previous")}
                </Button>
                <Button variant="outline" size="sm" disabled={soldiers.length < 50} onClick={() => setPage(p => p + 1)}>
                  {t("common:next")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-[550px]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{editingSoldier ? t("editSoldier") : t("addSoldier")}</DialogTitle>
              {editingSoldier && <AutoSaveIndicator saving={soldierSaving} saved={soldierSaved} error={soldierError} />}
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("employeeNumber")}</Label>
                <Input
                  value={formData.employee_number}
                  onChange={(e) => setFormData({ ...formData, employee_number: e.target.value })}
                  disabled={!!editingSoldier}
                  placeholder="001"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("fullName")}</Label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="ישראל ישראלי"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>טלפון</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="0501234567"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>אימייל</Label>
                <Input
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="soldier@example.com"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>תפקידים</Label>
              <div className="flex flex-wrap gap-2">
                {workRoles.map((wr: any) => {
                  const selected = formData.work_role_ids.includes(wr.id);
                  return (
                    <button
                      key={wr.id}
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          work_role_ids: selected
                            ? formData.work_role_ids.filter(id => id !== wr.id)
                            : [...formData.work_role_ids, wr.id],
                        });
                      }}
                      className={`rounded-full px-3 py-1 text-sm border transition-colors ${
                        selected ? "bg-primary-500 text-white border-primary-500" : "border-gray-300 hover:bg-gray-100"
                      }`}
                    >
                      {wr.name?.[lang] || wr.name?.he || wr.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>הערות</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t("common:cancel")}</Button>
            <Button onClick={handleSave}>{t("common:save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Preview Modal */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("previewImport")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-4 text-sm">
              <Badge variant="success">{importPreview.length} {t("validRows")}</Badge>
              {importErrors.length > 0 && (
                <Badge variant="destructive">{importErrors.length} {t("invalidRows")}</Badge>
              )}
            </div>
            {importErrors.length > 0 && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {importErrors.map((err, i) => (
                  <div key={i}>{t("rowNumber")} {err.row}: {err.error}</div>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-start">{t("employeeNumber")}</th>
                    <th className="px-3 py-2 text-start">{t("fullName")}</th>
                    <th className="px-3 py-2 text-start">טלפון</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-3 py-2">{r.employee_number}</td>
                      <td className="px-3 py-2">{r.full_name}</td>
                      <td className="px-3 py-2">{r.phone || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.length > 50 && (
                <p className="mt-2 text-xs text-muted-foreground">מציג 50 מתוך {importPreview.length}...</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>{t("common:cancel")}</Button>
            <Button onClick={executeImport} disabled={importing || importPreview.length === 0}>
              {importing ? "מייבא..." : t("confirmImport")} ({importPreview.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Invite Modal */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>שליחת הזמנות</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              נשלח הזמנות ל-{selectedForInvite.length} חיילים. כל חייל יקבל לינק הרשמה ייחודי.
            </p>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {soldiers.map(s => (
                <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={selectedForInvite.includes(s.id)}
                    onChange={() => toggleInviteSelect(s.id)}
                    className="rounded"
                  />
                  <span className="text-sm">{s.full_name} ({s.employee_number})</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteModal(false)}>ביטול</Button>
            <Button onClick={sendBulkInvitations} disabled={selectedForInvite.length === 0}>
              <Mail className="me-1 h-4 w-4" />
              שלח {selectedForInvite.length} הזמנות
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title={t("common:confirm")}
        description={t("deleteConfirm")}
        confirmText={t("common:delete")}
        variant="destructive"
      />
    </div>
  );
}
