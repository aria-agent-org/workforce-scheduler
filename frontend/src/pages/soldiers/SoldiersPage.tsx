import { useState, useEffect, useCallback, useRef } from "react";
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
import { UserPlus, Search, Download, Upload, Pencil, Trash2, FileSpreadsheet, Mail, KeyRound, Bell, CheckSquare, Heart } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import AutoSaveIndicator from "@/components/common/AutoSaveIndicator";
import { useAutoSave } from "@/hooks/useAutoSave";
import EmployeePreferences from "@/components/EmployeePreferences";
import * as XLSX from "xlsx";

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

// ═══════════════════════════════════════════
// Preference Permissions per Employee
// ═══════════════════════════════════════════

const PREF_TYPES = [
  { key: "partner", label: "העדפות שותפים", icon: "👥" },
  { key: "mission", label: "העדפות סוג משימה", icon: "📋" },
  { key: "time", label: "העדפות זמן", icon: "🕐" },
] as const;

function PreferencePermissions({ employeeId }: { employeeId: string }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(tenantApi("/settings/preferences-config"));
        setConfig(res.data);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, [employeeId]);

  const getOverride = (prefType: string): boolean | null => {
    const overrides = config?.per_employee_overrides?.[employeeId] || {};
    const key = `${prefType}_preferences_enabled`;
    return overrides[key] ?? null;
  };

  const getGlobalDefault = (prefType: string): boolean => {
    const key = `${prefType}_preferences_enabled`;
    return config?.[key] ?? false;
  };

  const toggleOverride = async (prefType: string) => {
    if (!config) return;
    setSaving(true);
    try {
      const key = `${prefType}_preferences_enabled`;
      const overrides = { ...(config.per_employee_overrides || {}) };
      const empOverrides = { ...(overrides[employeeId] || {}) };
      const currentValue = empOverrides[key] ?? getGlobalDefault(prefType);
      empOverrides[key] = !currentValue;
      overrides[employeeId] = empOverrides;

      const newConfig = { ...config, per_employee_overrides: overrides };
      await api.put(tenantApi("/settings/preferences-config"), newConfig);
      setConfig(newConfig);
      toast("success", "הרשאות העדפות עודכנו");
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה"));
    } finally {
      setSaving(false);
    }
  };

  const resetOverride = async (prefType: string) => {
    if (!config) return;
    setSaving(true);
    try {
      const key = `${prefType}_preferences_enabled`;
      const overrides = { ...(config.per_employee_overrides || {}) };
      const empOverrides = { ...(overrides[employeeId] || {}) };
      delete empOverrides[key];
      if (Object.keys(empOverrides).length === 0) {
        delete overrides[employeeId];
      } else {
        overrides[employeeId] = empOverrides;
      }
      const newConfig = { ...config, per_employee_overrides: overrides };
      await api.put(tenantApi("/settings/preferences-config"), newConfig);
      setConfig(newConfig);
      toast("success", "אופס לברירת מחדל");
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground py-2">טוען...</div>;
  if (!config) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Heart className="h-4 w-4" />
        הגדרות העדפות — הרשאות
      </h3>
      <div className="space-y-2">
        {PREF_TYPES.map(pt => {
          const override = getOverride(pt.key);
          const globalDefault = getGlobalDefault(pt.key);
          const effectiveValue = override ?? globalDefault;
          const isOverridden = override !== null;

          return (
            <div key={pt.key} className="flex items-center justify-between rounded-lg border p-2.5">
              <div className="flex items-center gap-2">
                <span>{pt.icon}</span>
                <span className="text-sm">{pt.label}</span>
                {isOverridden && (
                  <Badge className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    מותאם
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={effectiveValue}
                    onChange={() => toggleOverride(pt.key)}
                    disabled={saving}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-500" />
                </label>
                {isOverridden && (
                  <button
                    onClick={() => resetOverride(pt.key)}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    title="אפס לברירת מחדל"
                  >
                    ↩
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        ברירת מחדל מוגדרת בהגדרות המערכת. שינוי כאן חל רק על חייל זה.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════
// Quick Status Dropdown
// ═══════════════════════════════════════════

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  on_duty: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  sick: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  leave: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  training: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  reserve: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  absent: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const STATUS_LABELS: Record<string, string> = {
  available: "זמין",
  on_duty: "בתורנות",
  sick: "חולה",
  leave: "חופשה",
  training: "הכשרה",
  reserve: "מילואים",
  absent: "נעדר",
};

// Status badge is READ-ONLY. Status changes happen ONLY through attendance in a board context.
function QuickStatusBadge({ soldier }: { soldier: Soldier; onUpdate?: () => void }) {
  const currentStatus = soldier.status || "available";
  const label = STATUS_LABELS[currentStatus] || currentStatus;
  const colorClass = STATUS_COLORS[currentStatus] || STATUS_COLORS.available;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium pointer-events-none select-none ${colorClass}`}
      title="סטטוס מתעדכן דרך דוח הנוכחות בלבד"
    >
      <span className="h-2 w-2 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Form validation
  const validateSoldierForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!formData.full_name.trim() || formData.full_name.trim().length < 2) {
      errors.full_name = "שם מלא חייב להכיל לפחות 2 תווים";
    }
    if (!editingSoldier && !formData.employee_number.trim()) {
      errors.employee_number = "מספר אישי הוא שדה חובה";
    }
    return errors;
  };

  const isSoldierFormValid = (): boolean => {
    return formData.full_name.trim().length >= 2 && (!!editingSoldier || formData.employee_number.trim().length > 0);
  };

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

  // Edit modal tab
  const [editTab, setEditTab] = useState<"details" | "preferences" | "overview">("details");
  
  // Employee detail data
  const [recentAssignments, setRecentAssignments] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

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
    const errors = validateSoldierForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
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
      toast("error", getErrorMessage(e, "שגיאה בשמירה"));
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
    setEditTab("details");
    setFormData({ employee_number: "", full_name: "", preferred_language: "he", notes: "", phone: "", email: "", work_role_ids: [] });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (s: Soldier) => {
    setEditingSoldier(s);
    setEditTab("overview");
    setFormErrors({});
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
    // Load recent assignments
    setLoadingDetail(true);
    api.get(tenantApi(`/employees/${s.id}/assignments`), { params: { page_size: 5 } })
      .then(res => setRecentAssignments(res.data?.items || res.data || []))
      .catch(() => setRecentAssignments([]))
      .finally(() => setLoadingDetail(false));
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
      toast("error", getErrorMessage(e, "שגיאה בייבוא"));
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

  const exportExcel = () => {
    const data = soldiers.map(s => ({
      "שם מלא": s.full_name,
      "מספר אישי": s.employee_number,
      "סטטוס": s.status,
      "פעיל": s.is_active ? "כן" : "לא",
      "תפקידים": s.work_roles?.map(r => r.name[lang] || r.name.he).join(", ") || "",
      "טלפון": s.notification_channels?.phone_whatsapp || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 25 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "עובדים");
    XLSX.writeFile(wb, "soldiers.xlsx");
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
      toast("error", getErrorMessage(e, "שגיאה בעדכון תפקיד"));
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
      toast("error", getErrorMessage(e, "שגיאה"));
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
      toast("error", getErrorMessage(e, "שגיאה ביצירת קודים"));
    }
  };

  const bulkSendNotification = async () => {
    try {
      const ids = Array.from(selectedIds);
      await api.post(tenantApi("/notifications/bulk"), { employee_ids: ids, event_type: "general" });
      toast("success", `נשלחו התראות ל-${ids.length} חיילים`);
      setSelectedIds(new Set());
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה"));
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
      toast("error", getErrorMessage(e, "שגיאה בשליחת הזמנות"));
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
          <Button variant="outline" size="sm" className="hidden sm:flex min-h-[44px]" onClick={exportExcel}>
            <FileSpreadsheet className="me-1 h-4 w-4" />
            ייצוא Excel
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
                        <td colSpan={6} className="px-4 py-16 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-16 w-16 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                              <UserPlus className="h-8 w-8 text-primary-400" />
                            </div>
                            <p className="text-lg font-semibold text-foreground">אין חיילים עדיין</p>
                            <p className="text-sm text-muted-foreground max-w-xs">הוסף חיילים באופן ידני או ייבא מקובץ CSV/Excel</p>
                            <div className="flex gap-2 mt-2">
                              <Button size="sm" onClick={openCreate}>
                                <UserPlus className="me-1 h-4 w-4" />הוסף חייל ראשון
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="me-1 h-4 w-4" />ייבוא מקובץ
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      soldiers.map((s) => (
                        <tr key={s.id} className={`border-b transition-colors ${selectedIds.has(s.id) ? "bg-primary-50 dark:bg-primary-900/10" : "hover:bg-muted/30"}`}>
                          <td className="px-3 py-3">
                            <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} className="rounded h-4 w-4" />
                          </td>
                          <td className="px-4 py-3 font-mono text-sm text-muted-foreground">{s.employee_number}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="avatar-placeholder-sm" style={{ background: `hsl(${s.full_name.charCodeAt(0) * 7 % 360} 60% 55%)` }}>
                                {s.full_name.charAt(0)}
                              </div>
                              <span className="font-medium max-w-[180px] truncate" title={s.full_name}>{s.full_name}</span>
                            </div>
                          </td>
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
                            <QuickStatusBadge soldier={s} onUpdate={loadSoldiers} />
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
                  <div className="flex flex-col items-center gap-3 py-12">
                    <div className="h-14 w-14 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                      <UserPlus className="h-7 w-7 text-primary-400" />
                    </div>
                    <p className="text-base font-semibold">אין חיילים עדיין</p>
                    <p className="text-sm text-muted-foreground text-center">הוסף חיילים או ייבא מקובץ</p>
                    <Button size="sm" onClick={openCreate}>
                      <UserPlus className="me-1 h-4 w-4" />הוסף חייל ראשון
                    </Button>
                  </div>
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
                          <QuickStatusBadge soldier={s} onUpdate={loadSoldiers} />
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
        <DialogContent className="max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{editingSoldier ? t("editSoldier") : t("addSoldier")}</DialogTitle>
              {editingSoldier && <AutoSaveIndicator saving={soldierSaving} saved={soldierSaved} error={soldierError} />}
            </div>
          </DialogHeader>

          {/* Tabs — only show in edit mode */}
          {editingSoldier && (
            <div className="flex gap-1 border-b pb-0 overflow-x-auto">
              <button
                onClick={() => setEditTab("overview")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  editTab === "overview"
                    ? "border-primary-500 text-primary-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                סקירה
              </button>
              <button
                onClick={() => setEditTab("details")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  editTab === "details"
                    ? "border-primary-500 text-primary-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                פרטים
              </button>
              <button
                onClick={() => setEditTab("preferences")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${
                  editTab === "preferences"
                    ? "border-primary-500 text-primary-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Heart className="h-3.5 w-3.5" />
                העדפות שיבוץ
              </button>
            </div>
          )}

          {/* Overview Tab */}
          {editTab === "overview" && editingSoldier && (
            <div className="py-4 space-y-5">
              {/* Basic Info */}
              <div className="flex items-start gap-4">
                <div className="h-14 w-14 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-2xl font-bold text-primary-600">
                  {editingSoldier.full_name?.charAt(0)}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold">{editingSoldier.full_name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">#{editingSoldier.employee_number}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={editingSoldier.is_active ? "success" : "destructive"}>
                      {editingSoldier.is_active ? "פעיל" : "לא פעיל"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      נוצר: {new Date(editingSoldier.created_at).toLocaleDateString("he-IL")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-3">
                {formData.phone && (
                  <div className="flex items-center gap-2 rounded-lg border p-3">
                    <span className="text-lg">📱</span>
                    <div>
                      <p className="text-xs text-muted-foreground">טלפון</p>
                      <p className="text-sm font-medium" dir="ltr">{formData.phone}</p>
                    </div>
                  </div>
                )}
                {formData.email && (
                  <div className="flex items-center gap-2 rounded-lg border p-3">
                    <span className="text-lg">✉️</span>
                    <div>
                      <p className="text-xs text-muted-foreground">אימייל</p>
                      <p className="text-sm font-medium truncate" dir="ltr">{formData.email}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Work Roles */}
              {editingSoldier.work_roles && editingSoldier.work_roles.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">תפקידי עבודה</h4>
                  <div className="flex flex-wrap gap-2">
                    {editingSoldier.work_roles.map((r) => (
                      <Badge key={r.id} className="text-sm px-3 py-1" style={{ backgroundColor: r.color + "20", color: r.color, border: `1px solid ${r.color}40` }}>
                        {r.is_primary && "⭐ "}
                        {r.name[lang] || r.name.he}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Notification Channels Status */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Bell className="h-4 w-4" />
                  ערוצי התראות
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "phone_whatsapp", label: "WhatsApp", icon: "💬", value: editingSoldier.notification_channels?.phone_whatsapp },
                    { key: "email", label: "אימייל", icon: "📧", value: editingSoldier.notification_channels?.email },
                    { key: "push", label: "Push", icon: "🔔", value: editingSoldier.notification_channels?.push_enabled },
                  ].map(ch => (
                    <div key={ch.key} className={`rounded-lg border p-2 text-center transition-colors ${ch.value ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800" : "bg-muted/30 border-dashed"}`}>
                      <span className="text-lg">{ch.icon}</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{ch.label}</p>
                      <Badge className={`text-[9px] mt-1 ${ch.value ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                        {ch.value ? "מחובר" : "לא מוגדר"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Assignments */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">שיבוצים אחרונים</h4>
                {loadingDetail ? (
                  <div className="text-sm text-muted-foreground py-3 text-center">
                    <div className="inline-block h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin me-2" />
                    טוען...
                  </div>
                ) : recentAssignments.length > 0 ? (
                  <div className="space-y-1">
                    {recentAssignments.slice(0, 5).map((a: any, idx: number) => (
                      <div key={a.id || idx} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">📅</span>
                          <span className="font-medium">{a.mission_name || a.name || "משימה"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {a.date && <span className="text-xs text-muted-foreground">{a.date}</span>}
                          {a.slot_id && <Badge className="text-[10px]">{a.slot_id}</Badge>}
                          <Badge variant={a.status === "assigned" ? "success" : "default"} className="text-[10px]">{a.status || "שובץ"}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2 text-center">אין שיבוצים אחרונים</p>
                )}
              </div>

              {/* Notes */}
              {editingSoldier.notes && (
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">הערות</h4>
                  <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">{editingSoldier.notes}</p>
                </div>
              )}

              {/* Custom Fields from notification_channels */}
              {editingSoldier.notification_channels && Object.keys(editingSoldier.notification_channels).filter(k => !["phone_whatsapp", "email", "push_enabled", "telegram", "push_subscription"].includes(k)).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">שדות נוספים</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(editingSoldier.notification_channels)
                      .filter(([k]) => !["phone_whatsapp", "email", "push_enabled", "telegram", "push_subscription"].includes(k))
                      .map(([key, value]) => (
                        <div key={key} className="rounded-lg border p-2.5">
                          <p className="text-xs text-muted-foreground">{key}</p>
                          <p className="text-sm font-medium">{String(value)}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Details Tab */}
          {editTab === "details" && (
            <>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("employeeNumber")} <span className="text-red-500">*</span></Label>
                    <Input
                      value={formData.employee_number}
                      onChange={(e) => { setFormData({ ...formData, employee_number: e.target.value }); if (formErrors.employee_number) setFormErrors(prev => ({ ...prev, employee_number: "" })); }}
                      disabled={!!editingSoldier}
                      placeholder="001"
                      className={`min-h-[44px] ${formErrors.employee_number ? "border-red-500 ring-1 ring-red-500" : ""}`}
                    />
                    {formErrors.employee_number && <p className="text-sm text-red-600">{formErrors.employee_number}</p>}
                    {!editingSoldier && <p className="text-xs text-muted-foreground">מזהה ייחודי לחייל (מספר, קוד וכו׳)</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>{t("fullName")} <span className="text-red-500">*</span></Label>
                    <Input
                      value={formData.full_name}
                      onChange={(e) => { setFormData({ ...formData, full_name: e.target.value }); if (formErrors.full_name) setFormErrors(prev => ({ ...prev, full_name: "" })); }}
                      placeholder="ישראל ישראלי"
                      className={`min-h-[44px] ${formErrors.full_name ? "border-red-500 ring-1 ring-red-500" : ""}`}
                    />
                    {formErrors.full_name && <p className="text-sm text-red-600">{formErrors.full_name}</p>}
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
                <Button onClick={handleSave} disabled={!isSoldierFormValid()}>{t("common:save")}</Button>
              </DialogFooter>
            </>
          )}

          {/* Preferences Tab */}
          {editTab === "preferences" && editingSoldier && (
            <div className="py-4 space-y-6">
              {/* Per-employee preference permissions */}
              <PreferencePermissions employeeId={editingSoldier.id} />

              {/* Actual preferences */}
              <EmployeePreferences employeeId={editingSoldier.id} compact />
            </div>
          )}
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
