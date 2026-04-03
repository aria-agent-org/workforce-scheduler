import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { UserPlus, Search, Download, Pencil, Trash2, FileSpreadsheet } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import UserImportWizard from "./UserImportWizard";

interface AttendanceStatusDef {
  code: string;
  name: { he: string; en: string };
  color: string;
  icon: string;
}

interface Employee {
  id: string;
  employee_number: string;
  full_name: string;
  status: string;
  is_active: boolean;
  preferred_language: string;
  notes: string | null;
  work_roles: Array<{ id: string; name: { he: string; en: string }; color: string; is_primary: boolean }>;
  created_at: string;
}

export default function EmployeesPage() {
  const { t, i18n } = useTranslation("employees");
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [statusDefs, setStatusDefs] = useState<AttendanceStatusDef[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState({
    employee_number: "", full_name: "", preferred_language: "he", notes: "",
  });

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  
  // Import wizard
  const [showImportWizard, setShowImportWizard] = useState(false);

  // Load attendance status definitions once
  useEffect(() => {
    api.get(tenantApi("/attendance/statuses")).then(res => {
      setStatusDefs(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {});
  }, []);

  const getStatusDisplay = (statusCode: string) => {
    const def = statusDefs.find(s => s.code === statusCode);
    if (def) {
      return {
        label: `${def.icon || ""} ${def.name?.he || statusCode}`.trim(),
        color: def.color || "#6b7280",
      };
    }
    // Fallback Hebrew labels for common statuses
    const fallbacks: Record<string, { label: string; color: string }> = {
      present: { label: "✅ נוכח", color: "#22c55e" },
      home: { label: "🏠 בית", color: "#6B7F3B" },
      sick: { label: "🤒 חולה", color: "#ef4444" },
      vacation: { label: "🏖️ חופשה", color: "#eab308" },
      reserve: { label: "🎖️ מילואים", color: "#a855f7" },
      training: { label: "📚 הדרכה", color: "#f97316" },
    };
    return fallbacks[statusCode] || { label: statusCode || "—", color: "#6b7280" };
  };

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, page_size: 50, search: search || undefined };
      if (filter === "active") params.is_active = true;
      if (filter === "inactive") params.is_active = false;
      const { data } = await api.get(tenantApi("/employees"), { params });
      setEmployees(data.items);
      setTotal(data.total);
    } catch (e) {
      toast("error", "שגיאה בטעינת עובדים");
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const handleSave = async () => {
    try {
      if (editingEmployee) {
        await api.patch(tenantApi(`/employees/${editingEmployee.id}`), {
          full_name: formData.full_name,
          preferred_language: formData.preferred_language,
          notes: formData.notes || null,
        });
        toast("success", "עובד עודכן בהצלחה");
      } else {
        await api.post(tenantApi("/employees"), formData);
        toast("success", "עובד נוצר בהצלחה");
      }
      setShowModal(false);
      setEditingEmployee(null);
      loadEmployees();
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בשמירה"));
    }
  };

  const handleDelete = async (emp: Employee) => {
    try {
      await api.delete(tenantApi(`/employees/${emp.id}`));
      toast("success", "עובד הושבת בהצלחה");
      loadEmployees();
    } catch (e) {
      toast("error", "שגיאה במחיקה");
    }
  };

  const openCreate = () => {
    setEditingEmployee(null);
    setFormData({ employee_number: "", full_name: "", preferred_language: "he", notes: "" });
    setShowModal(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormData({
      employee_number: emp.employee_number,
      full_name: emp.full_name,
      preferred_language: emp.preferred_language,
      notes: emp.notes || "",
    });
    setShowModal(true);
  };

  const exportCSV = () => {
    const headers = ["מספר עובד,שם מלא,סטטוס,פעיל"];
    const rows = employees.map(e => `${e.employee_number},${e.full_name},${e.status},${e.is_active ? "כן" : "לא"}`);
    const csv = [...headers, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "employees.csv"; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImportWizard(true)}>
            <FileSpreadsheet className="me-1 h-4 w-4" />
            ייבוא משתמשים
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="me-1 h-4 w-4" />
            {t("exportList")}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <UserPlus className="me-1 h-4 w-4" />
            {t("addEmployee")}
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

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={8} cols={5} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50 text-sm">
                    <th className="px-4 py-3 text-start font-medium">{t("employeeNumber")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("fullName")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("role")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("status")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("common:actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        {t("noEmployees")}
                      </td>
                    </tr>
                  ) : (
                    employees.map((emp) => (
                      <tr key={emp.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-sm">{emp.employee_number}</td>
                        <td className="px-4 py-3 font-medium">{emp.full_name}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {emp.work_roles?.map((r) => (
                              <Badge key={r.id} className="text-xs" style={{ backgroundColor: r.color + "20", color: r.color }}>
                                {r.name[lang] || r.name.he}
                              </Badge>
                            ))}
                            {(!emp.work_roles || emp.work_roles.length === 0) && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const sd = getStatusDisplay(emp.status);
                            return (
                              <Badge
                                className="text-xs font-medium pointer-events-none select-none"
                                style={{
                                  backgroundColor: sd.color + "18",
                                  color: sd.color,
                                  borderColor: sd.color + "40",
                                  border: "1px solid",
                                }}
                              >
                                {sd.label}
                              </Badge>
                            );
                          })()}
                          {!emp.is_active && (
                            <Badge className="text-xs mr-1 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                              לא פעיל
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(emp)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(emp)}>
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
          )}
          {total > 50 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {t("common:pagination.showing")} {employees.length} {t("common:pagination.of")} {total}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  {t("common:previous")}
                </Button>
                <Button variant="outline" size="sm" disabled={employees.length < 50} onClick={() => setPage(p => p + 1)}>
                  {t("common:next")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEmployee ? t("editEmployee") : t("addEmployee")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("employeeNumber")}</Label>
              <Input
                value={formData.employee_number}
                onChange={(e) => setFormData({ ...formData, employee_number: e.target.value })}
                disabled={!!editingEmployee}
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
            <div className="space-y-2">
              <Label>{t("common:language")}</Label>
              <select
                value={formData.preferred_language}
                onChange={(e) => setFormData({ ...formData, preferred_language: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="he">עברית</option>
                <option value="en">English</option>
              </select>
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

      {/* User Import Wizard */}
      <UserImportWizard
        open={showImportWizard}
        onClose={() => setShowImportWizard(false)}
        onComplete={loadEmployees}
      />
    </div>
  );
}
