import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
import {
  Calendar, Plus, Wand2, Send, Play, Pause, Archive, Copy,
  ChevronDown, ChevronUp, Users, Clock, Trash2, UserPlus,
  Pencil, Download, Upload, ArrowLeft, Eye, AlertTriangle, Check, LayoutTemplate,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import HelpTooltip from "@/components/common/HelpTooltip";

type Tab = "windows" | "board" | "types" | "templates";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  archived: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
  proposed: "bg-purple-100 text-purple-700",
};

const SHIFT_PRESETS = [
  { key: "morning", label: "בוקר", start: "07:00", end: "15:00" },
  { key: "afternoon", label: "צהריים", start: "15:00", end: "23:00" },
  { key: "night", label: "לילה", start: "23:00", end: "07:00" },
];

const DAYS_HE = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

export default function SchedulingPage() {
  const { t, i18n } = useTranslation("scheduling");
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<Tab>("windows");
  const [loading, setLoading] = useState(true);

  // Data
  const [windows, setWindows] = useState<any[]>([]);
  const [missions, setMissions] = useState<any[]>([]);
  const [missionTypes, setMissionTypes] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [workRoles, setWorkRoles] = useState<any[]>([]);
  const [windowEmployees, setWindowEmployees] = useState<any[]>([]);

  // Selected window for board view
  const [selectedWindow, setSelectedWindow] = useState<any | null>(null);
  const [boardDate, setBoardDate] = useState(new Date().toISOString().split("T")[0]);
  const [boardView, setBoardView] = useState<"day" | "week">("day");
  const [expandedMission, setExpandedMission] = useState<string | null>(null);

  // Modals
  const [showWindowModal, setShowWindowModal] = useState(false);
  const [showMissionModal, setShowMissionModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showAutoAssignResults, setShowAutoAssignResults] = useState(false);
  const [autoAssignResults, setAutoAssignResults] = useState<any>(null);
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<any>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);

  // Edit tracking
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<any>(null);

  // Form data
  const [windowForm, setWindowForm] = useState({ name: "", start_date: "", end_date: "" });
  const [missionForm, setMissionForm] = useState({
    schedule_window_id: "", mission_type_id: "", name: "", date: "", start_time: "08:00", end_time: "16:00",
  });
  const [typeForm, setTypeForm] = useState({
    name_he: "", name_en: "", color: "#3b82f6", icon: "📋", duration_hours: 8, is_standby: false,
    standby_can_count_as_rest: false,
    required_slots: [] as Array<{ slot_id: string; work_role_id: string; count: number; label_he: string; label_en: string }>,
    pre_mission_events: [] as Array<{ offset_minutes: number; label_he: string; label_en: string; location_he: string }>,
    post_mission_rule: null as any,
    timeline_items: [] as Array<{ item_id: string; offset_minutes: number; label_he: string; label_en: string; time_mode: "relative" | "exact"; exact_time: string }>,
  });
  const [templateForm, setTemplateForm] = useState({
    schedule_window_id: "", mission_type_id: "", name: "",
    recurrence_type: "daily" as string,
    recurrence_days: [] as number[],
    active_weeks: "all" as string,
    time_slots: [{ slot_key: "morning", start: "07:00", end: "15:00" }] as Array<{ slot_key: string; start: string; end: string }>,
    exceptions: [] as string[],
    extra_dates: [] as string[],
  });
  const [assignForm, setAssignForm] = useState({ employee_id: "", work_role_id: "", slot_id: "default" });
  const [employeePrefsMap, setEmployeePrefsMap] = useState<Record<string, any>>({});
  const [hardConflict, setHardConflict] = useState<{ message: string; details: string[] } | null>(null);
  const [overrideJustification, setOverrideJustification] = useState("");
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [assignMissionId, setAssignMissionId] = useState("");
  const [generateForm, setGenerateForm] = useState({ template_id: "", start_date: "", end_date: "" });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [winRes, mtRes, empRes, wrRes] = await Promise.all([
        api.get(tenantApi("/schedule-windows")),
        api.get(tenantApi("/mission-types")),
        api.get(tenantApi("/employees"), { params: { page_size: 200 } }),
        api.get(tenantApi("/settings/work-roles")),
      ]);
      setWindows(winRes.data);
      setMissionTypes(mtRes.data);
      setEmployees(empRes.data.items || []);
      setWorkRoles(wrRes.data);
    } catch (e) {
      toast("error", "שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadWindowData = async (windowId: string) => {
    try {
      const [missRes, tmplRes, empRes] = await Promise.all([
        api.get(tenantApi("/missions"), { params: { window_id: windowId } }),
        api.get(tenantApi("/mission-templates"), { params: { window_id: windowId } }),
        api.get(tenantApi(`/schedule-windows/${windowId}/employees`)),
      ]);
      setMissions(missRes.data);
      setTemplates(tmplRes.data);
      setWindowEmployees(empRes.data);
    } catch (e) {
      toast("error", "שגיאה בטעינת לוח");
    }
  };

  const openWindowBoard = (win: any) => {
    setSelectedWindow(win);
    setActiveTab("board");
    loadWindowData(win.id);
  };

  // === WINDOW ACTIONS ===
  const createWindow = async () => {
    try {
      await api.post(tenantApi("/schedule-windows"), windowForm);
      toast("success", "לוח עבודה נוצר בהצלחה");
      setShowWindowModal(false);
      loadAll();
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  const windowAction = async (id: string, action: string) => {
    try {
      await api.post(tenantApi(`/schedule-windows/${id}/${action}`));
      toast("success", `פעולה בוצעה: ${action}`);
      loadAll();
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  // === MISSION TYPE CRUD ===
  const saveMissionType = async () => {
    try {
      const slots = typeForm.required_slots.map((s, i) => ({
        slot_id: s.slot_id || `s${i + 1}`,
        work_role_id: s.work_role_id,
        count: s.count,
        label: { he: s.label_he, en: s.label_en },
      }));
      const preMission = typeForm.pre_mission_events.map(e => ({
        offset_minutes: e.offset_minutes,
        label: { he: e.label_he, en: e.label_en },
        location: { he: e.location_he },
      }));
      const timeline = typeForm.timeline_items.map(t => ({
        item_id: t.item_id,
        offset_minutes: t.time_mode === "exact" ? null : t.offset_minutes,
        exact_time: t.time_mode === "exact" ? t.exact_time : null,
        time_mode: t.time_mode,
        label: { he: t.label_he, en: t.label_en },
      }));
      const payload = {
        name: { he: typeForm.name_he, en: typeForm.name_en },
        color: typeForm.color,
        icon: typeForm.icon,
        duration_hours: typeForm.duration_hours,
        is_standby: typeForm.is_standby,
        standby_can_count_as_rest: typeForm.is_standby ? typeForm.standby_can_count_as_rest : false,
        required_slots: slots,
        pre_mission_events: preMission.length > 0 ? preMission : null,
        post_mission_rule: typeForm.post_mission_rule,
        timeline_items: timeline.length > 0 ? timeline : null,
      };
      if (editingTypeId) {
        await api.patch(tenantApi(`/mission-types/${editingTypeId}`), payload);
        toast("success", "סוג משימה עודכן בהצלחה");
      } else {
        await api.post(tenantApi("/mission-types"), payload);
        toast("success", "סוג משימה נוצר בהצלחה");
      }
      setShowTypeModal(false);
      setEditingTypeId(null);
      loadAll();
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  const openEditType = (mt: any) => {
    setEditingTypeId(mt.id);
    setTypeForm({
      name_he: mt.name?.he || "",
      name_en: mt.name?.en || "",
      color: mt.color || "#3b82f6",
      icon: mt.icon || "📋",
      duration_hours: mt.duration_hours || 8,
      is_standby: mt.is_standby || false,
      standby_can_count_as_rest: mt.standby_can_count_as_rest || false,
      required_slots: (mt.required_slots || []).map((s: any) => ({
        slot_id: s.slot_id, work_role_id: s.work_role_id, count: s.count,
        label_he: s.label?.he || "", label_en: s.label?.en || "",
      })),
      pre_mission_events: (mt.pre_mission_events || []).map((e: any) => ({
        offset_minutes: e.offset_minutes, label_he: e.label?.he || "",
        label_en: e.label?.en || "", location_he: e.location?.he || "",
      })),
      post_mission_rule: mt.post_mission_rule || null,
      timeline_items: (mt.timeline_items || []).map((t: any) => ({
        item_id: t.item_id, offset_minutes: t.offset_minutes || 0,
        label_he: t.label?.he || "", label_en: t.label?.en || "",
        time_mode: t.time_mode || "relative", exact_time: t.exact_time || "08:00",
      })),
    });
    setShowTypeModal(true);
  };

  const openCreateType = () => {
    setEditingTypeId(null);
    setTypeForm({
      name_he: "", name_en: "", color: "#3b82f6", icon: "📋", duration_hours: 8, is_standby: false,
      standby_can_count_as_rest: false,
      required_slots: [], pre_mission_events: [], post_mission_rule: null, timeline_items: [],
    });
    setShowTypeModal(true);
  };

  const deleteMissionType = async (mt: any) => {
    try {
      await api.delete(tenantApi(`/mission-types/${mt.id}`));
      toast("success", "סוג משימה נמחק");
      setDeleteTypeTarget(null);
      loadAll();
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  // === MISSIONS ===
  const createMission = async () => {
    try {
      await api.post(tenantApi("/missions"), missionForm);
      toast("success", "משימה נוצרה בהצלחה");
      setShowMissionModal(false);
      setEditingMissionId(null);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  const updateMission = async () => {
    if (!editingMissionId) return;
    try {
      await api.patch(tenantApi(`/missions/${editingMissionId}`), {
        name: missionForm.name || undefined,
        date: missionForm.date || undefined,
        start_time: missionForm.start_time || undefined,
        end_time: missionForm.end_time || undefined,
      });
      toast("success", "משימה עודכנה בהצלחה");
      setShowMissionModal(false);
      setEditingMissionId(null);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה בעדכון משימה"); }
  };

  const openEditMission = (m: any) => {
    setEditingMissionId(m.id);
    setMissionForm({
      schedule_window_id: m.schedule_window_id,
      mission_type_id: m.mission_type_id,
      name: m.name,
      date: m.date,
      start_time: m.start_time?.slice(0, 5) || "08:00",
      end_time: m.end_time?.slice(0, 5) || "16:00",
    });
    setShowMissionModal(true);
  };

  const saveMission = async () => {
    if (editingMissionId) {
      await updateMission();
    } else {
      await createMission();
    }
  };

  // === TEMPLATE DELETE ===
  const deleteTemplate = async (tmpl: any) => {
    try {
      await api.delete(tenantApi(`/mission-templates/${tmpl.id}`));
      toast("success", "תבנית נמחקה");
      setDeleteTemplateTarget(null);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה במחיקת תבנית"); }
  };

  // === TEMPLATES ===
  const saveTemplate = async () => {
    try {
      await api.post(tenantApi("/mission-templates"), {
        schedule_window_id: templateForm.schedule_window_id,
        mission_type_id: templateForm.mission_type_id,
        name: templateForm.name,
        recurrence: {
          type: templateForm.recurrence_type,
          days_of_week: templateForm.recurrence_days,
          active_weeks: templateForm.active_weeks,
          exceptions: templateForm.exceptions,
          extra_dates: templateForm.extra_dates,
        },
        time_slots: templateForm.time_slots,
      });
      toast("success", "תבנית נוצרה בהצלחה");
      setShowTemplateModal(false);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  // === ASSIGNMENT ===
  const assignEmployee = async (forceOverride = false) => {
    try {
      const payload: any = { ...assignForm };
      if (forceOverride && overrideJustification) {
        payload.override_hard_conflicts = true;
        payload.override_justification = overrideJustification;
      }
      const res = await api.post(tenantApi(`/missions/${assignMissionId}/assignments`), payload);
      
      // Check for hard conflicts that blocked the assignment
      if (res.data.blocked_by_hard_conflict) {
        const conflicts = res.data.hard_conflicts || [];
        setHardConflict({
          message: res.data.message || "שיבוץ נחסם עקב התנגשות קשה",
          details: conflicts.map((c: any) => c.message || c.rule_name || "התנגשות חוק"),
        });
        return;
      }
      
      if (res.data.conflicts_detected?.length > 0) {
        const hardOnes = res.data.conflicts_detected.filter((c: any) => c.severity === "hard");
        if (hardOnes.length > 0 && !forceOverride) {
          setHardConflict({
            message: `נמצאו ${hardOnes.length} התנגשויות קשות שחוסמות את השיבוץ`,
            details: hardOnes.map((c: any) => c.message || c.rule_name || "התנגשות חוק חמור"),
          });
          return;
        }
        toast("warning", `חייל שובץ עם ${res.data.conflicts_detected.length} התנגשויות`);
      } else {
        toast("success", "חייל שובץ בהצלחה");
      }
      setShowAssignModal(false);
      setHardConflict(null);
      setOverrideJustification("");
      setShowOverrideConfirm(false);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) {
      const detail = e.response?.data?.detail || "";
      // Backend may return 409 for hard conflicts
      if (e.response?.status === 409 || (typeof detail === "string" && detail.includes("conflict"))) {
        setHardConflict({
          message: typeof detail === "string" ? detail : "שיבוץ נחסם עקב התנגשות קשה",
          details: e.response?.data?.conflicts?.map((c: any) => c.message || c.rule_name) || [detail],
        });
        return;
      }
      toast("error", detail || "שגיאה");
    }
  };

  // === GENERATE ===
  const generateMissions = async () => {
    try {
      const res = await api.post(tenantApi("/missions/generate"), generateForm);
      toast("success", `נוצרו ${res.data.created} משימות`);
      setShowGenerateModal(false);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  // === AUTO ASSIGN ===
  const autoAssign = async () => {
    if (!selectedWindow) return;
    try {
      toast("info", "מריץ שיבוץ אוטומטי...");
      const res = await api.post(tenantApi("/missions/auto-assign"), null, {
        params: { window_id: selectedWindow.id },
      });
      setAutoAssignResults(res.data);
      setShowAutoAssignResults(true);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה בשיבוץ אוטומטי"); }
  };

  // === IMPORT SOLDIERS TO WINDOW ===
  const [importPreviewData, setImportPreviewData] = useState<any[]>([]);
  const [importFileErrors, setImportFileErrors] = useState<any[]>([]);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedWindow) return;
    
    const text = await file.text();
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) { toast("error", "קובץ ריק"); return; }
    
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
      });
      if (!row.employee_number) { errors.push({ row: i, error: "חסר מספר אישי" }); }
      else { preview.push({ ...row, _row: i }); }
    }
    
    setImportPreviewData(preview);
    setImportFileErrors(errors);
    setShowImportWizard(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const executeWindowImport = async () => {
    if (!selectedWindow) return;
    try {
      const employee_numbers = importPreviewData.map(r => r.employee_number);
      await api.post(tenantApi(`/schedule-windows/${selectedWindow.id}/import-employees`), { employee_numbers });
      toast("success", `יובאו ${employee_numbers.length} חיילים ללוח`);
      setShowImportWizard(false);
      loadWindowData(selectedWindow.id);
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה בייבוא");
    }
  };

  const missionAction = async (id: string, action: string) => {
    try {
      await api.post(tenantApi(`/missions/${id}/${action}`));
      toast("success", "פעולה בוצעה");
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  // Filter missions by date for board view
  const boardMissions = missions.filter(m => {
    if (boardView === "day") return m.date === boardDate;
    // Week view: show 7 days starting from boardDate
    const start = new Date(boardDate);
    const end = new Date(boardDate);
    end.setDate(end.getDate() + 6);
    const mDate = new Date(m.date);
    return mDate >= start && mDate <= end;
  });

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "windows", label: t("scheduleWindows"), icon: Calendar },
    ...(selectedWindow ? [{ key: "board" as Tab, label: `${selectedWindow.name} — ${t("windowBoard")}`, icon: Eye }] : []),
    { key: "types", label: t("missionTypes"), icon: Clock },
    { key: "templates", label: t("templates"), icon: Copy },
  ];

  if (loading) return <TableSkeleton rows={6} cols={4} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex gap-2">
          {activeTab === "board" && selectedWindow && (
            <>
              <Button variant="outline" size="sm" onClick={() => window.location.href = `/settings?tab=board-template&window=${selectedWindow.id}`}>
                <LayoutTemplate className="me-1 h-4 w-4" />עורך לוח
              </Button>
              <Button variant="outline" size="sm" onClick={autoAssign}>
                <Wand2 className="me-1 h-4 w-4" />{t("autoAssign")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                if (templates.length > 0) {
                  setGenerateForm({ template_id: templates[0]?.id || "", start_date: selectedWindow.start_date, end_date: selectedWindow.end_date });
                  setShowGenerateModal(true);
                } else {
                  toast("warning", "אין תבניות — צור תבנית קודם");
                }
              }}>
                <Calendar className="me-1 h-4 w-4" />יצירה מתבנית
              </Button>
              <Button size="sm" onClick={() => {
                setEditingMissionId(null);
                setMissionForm({ schedule_window_id: selectedWindow.id, mission_type_id: "", name: "", date: boardDate, start_time: "08:00", end_time: "16:00" });
                setShowMissionModal(true);
              }}>
                <Plus className="me-1 h-4 w-4" />משימה חדשה
              </Button>
            </>
          )}
          {activeTab === "windows" && (
            <Button size="sm" onClick={() => { setWindowForm({ name: "", start_date: "", end_date: "" }); setShowWindowModal(true); }}>
              <Plus className="me-1 h-4 w-4" />{t("createWindow")}
            </Button>
          )}
          {activeTab === "types" && (
            <Button size="sm" onClick={openCreateType}>
              <Plus className="me-1 h-4 w-4" />{t("newMissionType")}
            </Button>
          )}
          {activeTab === "templates" && (
            <Button size="sm" onClick={() => {
              setTemplateForm({
                schedule_window_id: selectedWindow?.id || windows[0]?.id || "",
                mission_type_id: missionTypes[0]?.id || "", name: "",
                recurrence_type: "daily", recurrence_days: [], active_weeks: "all",
                time_slots: [{ slot_key: "morning", start: "07:00", end: "15:00" }],
                exceptions: [], extra_dates: [],
              });
              setShowTemplateModal(true);
            }}>
              <Plus className="me-1 h-4 w-4" />תבנית חדשה
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-4 py-2 text-sm transition-colors ${
              activeTab === key ? "bg-primary-500 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* === SCHEDULE WINDOWS TAB === */}
      {activeTab === "windows" && (
        <div className="grid gap-4">
          {windows.length === 0 ? (
            <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground">
              <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-lg font-medium">אין לוחות עבודה עדיין</p>
              <p className="text-sm mt-1">צור לוח עבודה ראשון כדי להתחיל לשבץ</p>
              <Button size="sm" className="mt-4" onClick={() => { setWindowForm({ name: "", start_date: "", end_date: "" }); setShowWindowModal(true); }}>
                <Plus className="me-1 h-4 w-4" />צור לוח עבודה ראשון
              </Button>
            </CardContent></Card>
          ) : windows.map((w) => {
            const daysTotal = Math.ceil((new Date(w.end_date).getTime() - new Date(w.start_date).getTime()) / (1000 * 60 * 60 * 24));
            const daysElapsed = Math.max(0, Math.ceil((Date.now() - new Date(w.start_date).getTime()) / (1000 * 60 * 60 * 24)));
            const progressPercent = daysTotal > 0 ? Math.min(100, Math.round((daysElapsed / daysTotal) * 100)) : 0;

            return (
            <Card key={w.id} className="hover:shadow-lg transition-all cursor-pointer group border-s-4" style={{ borderInlineStartColor: w.status === "active" ? "#22c55e" : w.status === "paused" ? "#eab308" : w.status === "archived" ? "#6366f1" : "#9ca3af" }} onClick={() => openWindowBoard(w)}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold">{w.name}</h3>
                      <Badge className={`${statusColors[w.status] || ""} text-xs`}>{t(`status.${w.status}`)}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{w.start_date} → {w.end_date}</span>
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{w.employee_count} חיילים</span>
                      <span className="text-xs">{daysTotal} ימים</span>
                    </div>
                    {w.status === "active" && (
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{progressPercent}%</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    {w.status === "draft" && (
                      <Button size="sm" variant="outline" className="min-h-[40px] border-green-300 text-green-700 hover:bg-green-50" onClick={() => windowAction(w.id, "activate")} title="הפעל">
                        <Play className="h-3.5 w-3.5 me-1" />הפעל
                      </Button>
                    )}
                    {w.status === "active" && (
                      <Button size="sm" variant="outline" className="min-h-[40px] border-yellow-300 text-yellow-700 hover:bg-yellow-50" onClick={() => windowAction(w.id, "pause")} title="השהה">
                        <Pause className="h-3.5 w-3.5 me-1" />השהה
                      </Button>
                    )}
                    {w.status === "paused" && (
                      <Button size="sm" variant="outline" className="min-h-[40px] border-green-300 text-green-700 hover:bg-green-50" onClick={() => windowAction(w.id, "resume")} title="חדש">
                        <Play className="h-3.5 w-3.5 me-1" />חדש
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="min-h-[40px] border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => window.location.href = `/settings?tab=board-template&window=${w.id}`} title="עורך לוח">
                      <LayoutTemplate className="h-3.5 w-3.5 me-1" />עורך לוח
                    </Button>
                    <Button size="sm" variant="ghost" className="min-h-[40px] text-muted-foreground hover:text-foreground" onClick={() => windowAction(w.id, "archive")} title="ארכיון">
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* === WINDOW BOARD TAB === */}
      {activeTab === "board" && selectedWindow && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => { setActiveTab("windows"); setSelectedWindow(null); }}>
              <ArrowLeft className="me-1 h-4 w-4" />חזרה ללוחות
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
            <Button variant="outline" size="sm" onClick={() => { fileInputRef.current?.click(); }}>
              <Upload className="me-1 h-4 w-4" />ייבוא חיילים
            </Button>
            <div className="flex gap-2">
              <button onClick={() => setBoardView("day")} className={`px-3 py-1 text-sm rounded ${boardView === "day" ? "bg-primary-500 text-white" : "bg-muted"}`}>יומי</button>
              <button onClick={() => setBoardView("week")} className={`px-3 py-1 text-sm rounded ${boardView === "week" ? "bg-primary-500 text-white" : "bg-muted"}`}>שבועי</button>
            </div>
            <Input type="date" value={boardDate} onChange={e => setBoardDate(e.target.value)} className="w-40" />
            <Badge className={statusColors[selectedWindow.status]}>{t(`status.${selectedWindow.status}`)}</Badge>
            <span className="text-sm text-muted-foreground">{windowEmployees.length} חיילים · {missions.length} משימות</span>
          </div>

          {/* Missions list */}
          {boardMissions.length === 0 ? (
            <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground">
              <Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-lg font-medium">אין משימות בטווח זה</p>
              <p className="text-sm mt-1">צור משימה חדשה או השתמש בתבנית כדי ליצור משימות אוטומטית</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {boardMissions.map((m) => {
                const mt = missionTypes.find(mt => mt.id === m.mission_type_id);
                const mtColor = mt?.color || "#3b82f6";
                const slotsTotal = mt?.required_slots?.reduce((sum: number, s: any) => sum + (s.count || 1), 0) || 0;
                const assignedCount = m.assignments?.length || 0;
                const fillPercent = slotsTotal > 0 ? Math.round((assignedCount / slotsTotal) * 100) : 0;

                return (
                <Card key={m.id} className="hover:shadow-lg transition-all border-s-4 group" style={{ borderInlineStartColor: mtColor }}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between cursor-pointer"
                         onClick={() => setExpandedMission(expandedMission === m.id ? null : m.id)}>
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ backgroundColor: mtColor + "18" }}>
                          {mt?.icon || "📋"}
                        </div>
                        <div>
                          <p className="font-semibold text-base">{m.name}</p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                            <span>📅 {m.date}</span>
                            <span>⏰ {m.start_time?.slice(0, 5)}–{m.end_time?.slice(0, 5)}</span>
                            <span className={`font-medium ${fillPercent === 100 ? "text-green-600" : fillPercent > 0 ? "text-yellow-600" : "text-red-500"}`}>
                              👥 {assignedCount}/{slotsTotal || "?"}
                            </span>
                          </div>
                          {slotsTotal > 0 && (
                            <div className="w-24 h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${fillPercent}%`, backgroundColor: fillPercent === 100 ? "#22c55e" : fillPercent > 0 ? "#eab308" : "#ef4444" }} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity min-h-[36px]" onClick={(e) => { e.stopPropagation(); openEditMission(m); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Badge className={`${statusColors[m.status] || ""} text-xs font-medium`}>{t(`status.${m.status}`)}</Badge>
                        {expandedMission === m.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                    {expandedMission === m.id && (
                      <div className="mt-3 border-t pt-3 space-y-2">
                        <div className="flex flex-wrap gap-2 mb-3">
                          <Button size="sm" variant="outline" className="min-h-[40px]" onClick={async () => {
                            setAssignMissionId(m.id);
                            setAssignForm({ employee_id: "", work_role_id: workRoles[0]?.id || "", slot_id: "default" });
                            setShowAssignModal(true);
                            // Load preferences for all employees in background
                            try {
                              const allEmps = windowEmployees.length > 0 ? windowEmployees : employees;
                              const prefsPromises = allEmps.slice(0, 50).map(async (emp: any) => {
                                try {
                                  const res = await api.get(tenantApi(`/employees/${emp.id}/preferences`));
                                  return { id: emp.id, prefs: res.data };
                                } catch { return null; }
                              });
                              const results = await Promise.all(prefsPromises);
                              const map: Record<string, any> = {};
                              results.forEach(r => { if (r) map[r.id] = r.prefs; });
                              setEmployeePrefsMap(map);
                            } catch {}
                          }}>
                            <UserPlus className="me-1 h-3.5 w-3.5" />{t("assignSoldier")}
                          </Button>
                          <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => openEditMission(m)}>
                            <Pencil className="me-1 h-3.5 w-3.5" />ערוך
                          </Button>
                          {m.status === "draft" && (
                            <Button size="sm" variant="outline" className="min-h-[40px] border-green-300 text-green-700 hover:bg-green-50" onClick={() => missionAction(m.id, "approve")}>
                              <Check className="me-1 h-3.5 w-3.5" />אשר
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="min-h-[40px] text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => missionAction(m.id, "cancel")}>
                            <Trash2 className="h-3.5 w-3.5 me-1" />בטל
                          </Button>
                        </div>
                        {m.assignments?.length > 0 ? (
                          <div className="space-y-1">
                            {m.assignments.map((a: any) => (
                              <div key={a.id} className="flex items-center justify-between rounded bg-muted/50 px-3 py-2 text-sm">
                                <span>{a.employee_name} — {a.slot_id}</span>
                                <div className="flex items-center gap-2">
                                  {a.conflicts_detected?.length > 0 && (
                                    <Badge className="bg-yellow-100 text-yellow-700">
                                      <AlertTriangle className="inline h-3 w-3 me-1" />{a.conflicts_detected.length} אזהרות
                                    </Badge>
                                  )}
                                  <Badge variant={a.status === "assigned" || a.status === "proposed" ? "success" : "default"}>{a.status}</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">{t("noAssignments")}</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === MISSION TYPES TAB === */}
      {activeTab === "types" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {missionTypes.length === 0 ? (
            <Card className="col-span-full border-dashed"><CardContent className="p-8 text-center text-muted-foreground">
              <Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-lg font-medium">אין סוגי משימות עדיין</p>
              <p className="text-sm mt-1">הגדר סוגי משימות (שמירה, ניוד, כוננות...) כדי ליצור משימות</p>
              <Button size="sm" className="mt-4" onClick={openCreateType}>
                <Plus className="me-1 h-4 w-4" />הוסף סוג משימה ראשון
              </Button>
            </CardContent></Card>
          ) : missionTypes.map((mt) => (
            <Card key={mt.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: (mt.color || "#3b82f6") + "20" }}>
                      {mt.icon || "📋"}
                    </div>
                    <h3 className="font-semibold">{mt.name[lang] || mt.name.he}</h3>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEditType(mt)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTypeTarget(mt)}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  {mt.duration_hours && (
                    <p className="text-muted-foreground"><Clock className="inline h-3 w-3" /> {mt.duration_hours} שעות</p>
                  )}
                  {mt.is_standby && <Badge className="bg-orange-100 text-orange-700">כוננות</Badge>}
                  {mt.required_slots?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">סלוטים:</p>
                      {mt.required_slots.map((s: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                          <span>{s.label?.[lang] || s.label?.he || s.slot_id}</span>
                          <span>×{s.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* === TEMPLATES TAB === */}
      {activeTab === "templates" && (
        <div className="space-y-3">
          {templates.length === 0 && windows.length > 0 && (
            <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground">
              <Copy className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-lg font-medium">אין תבניות עדיין</p>
              <p className="text-sm mt-1">בחר לוח עבודה וצור תבנית כדי ליצור משימות חוזרות אוטומטית</p>
            </CardContent></Card>
          )}
          {/* Window selector for templates */}
          <div className="flex items-center gap-2">
            <Label>לוח עבודה:</Label>
            <Select value={selectedWindow?.id || ""} onChange={(e) => {
              const w = windows.find(w => w.id === e.target.value);
              if (w) { setSelectedWindow(w); loadWindowData(w.id); }
            }}>
              <option value="">בחר לוח</option>
              {windows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </div>
          {templates.map((tmpl) => (
            <Card key={tmpl.id} className={`hover:shadow-md transition-all ${tmpl.is_active === false ? "opacity-60" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tmpl.is_active === false ? "bg-gray-100 dark:bg-gray-800" : "bg-purple-100 dark:bg-purple-900/30"}`}>
                      <Copy className={`h-5 w-5 ${tmpl.is_active === false ? "text-gray-400" : "text-purple-500"}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{tmpl.name}</h3>
                        <Badge className={tmpl.is_active === false ? "bg-gray-100 text-gray-500" : "bg-green-100 text-green-700"}>
                          {tmpl.is_active === false ? "מושבת" : "פעיל"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {tmpl.recurrence?.type === "daily" ? "🔄 יומי" : tmpl.recurrence?.type === "weekly" ? "📅 שבועי" : "⚙️ מותאם אישית"}
                        {tmpl.recurrence?.active_weeks && tmpl.recurrence.active_weeks !== "all" && ` · שבועות ${tmpl.recurrence.active_weeks === "odd" ? "אי-זוגיים" : "זוגיים"}`}
                        {tmpl.time_slots?.map((ts: any, i: number) => (
                          <span key={i} className="text-xs"> · ⏰ {ts.start}-{ts.end}</span>
                        ))}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Active/Inactive Toggle */}
                    <button
                      onClick={async () => {
                        try {
                          await api.patch(tenantApi(`/mission-templates/${tmpl.id}`), { is_active: tmpl.is_active === false ? true : false });
                          toast("success", tmpl.is_active === false ? "תבנית הופעלה" : "תבנית הושבתה — משימות שכבר נוצרו יישארו");
                          if (selectedWindow) loadWindowData(selectedWindow.id);
                        } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
                      }}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors min-h-[44px] min-w-[44px] ${tmpl.is_active === false ? "bg-gray-300 dark:bg-gray-600" : "bg-green-500"}`}
                      title={tmpl.is_active === false ? "הפעל תבנית" : "השבת תבנית"}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${tmpl.is_active === false ? "translate-x-1 rtl:-translate-x-1" : "translate-x-6 rtl:-translate-x-6"}`} />
                    </button>
                    <Button size="sm" variant="outline" className="min-h-[40px]" disabled={tmpl.is_active === false} onClick={() => {
                      setGenerateForm({ template_id: tmpl.id, start_date: selectedWindow?.start_date || "", end_date: selectedWindow?.end_date || "" });
                      setShowGenerateModal(true);
                    }}>
                      <Calendar className="me-1 h-3.5 w-3.5" />צור משימות
                    </Button>
                    <Button size="sm" variant="ghost" className="min-h-[40px] min-w-[40px] text-red-500 hover:bg-red-50" onClick={() => setDeleteTemplateTarget(tmpl)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ====== MODALS ====== */}

      {/* Create Window */}
      <Dialog open={showWindowModal} onOpenChange={setShowWindowModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("createWindow")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>שם הלוח *</Label>
                <HelpTooltip content={{ he: "שם תיאורי לתקופת העבודה.\nלדוגמה: מאי-יוני 2026, רבעון 3.", en: "Descriptive name for the schedule period." }} />
              </div>
              <Input value={windowForm.name} onChange={e => setWindowForm({...windowForm, name: e.target.value})} placeholder="לדוגמה: מאי-יולי 2026" className="min-h-[44px]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>תאריך התחלה</Label><Input type="date" value={windowForm.start_date} onChange={e => setWindowForm({...windowForm, start_date: e.target.value})} /></div>
              <div className="space-y-2"><Label>תאריך סיום</Label><Input type="date" value={windowForm.end_date} onChange={e => setWindowForm({...windowForm, end_date: e.target.value})} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWindowModal(false)}>ביטול</Button>
            <Button onClick={createWindow}>צור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Mission */}
      <Dialog open={showMissionModal} onOpenChange={(open) => { setShowMissionModal(open); if (!open) setEditingMissionId(null); }}>
        <DialogContent className="max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {editingMissionId ? "✏️ עריכת משימה" : "➕ משימה חדשה"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">שם המשימה <span className="text-red-500">*</span></Label>
              <Input 
                value={missionForm.name} 
                onChange={e => setMissionForm({...missionForm, name: e.target.value})} 
                placeholder="לדוגמה: שמירה צפונית"
                className="min-h-[44px] text-base"
              />
            </div>
            {!editingMissionId && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">סוג משימה <span className="text-red-500">*</span></Label>
                <Select 
                  value={missionForm.mission_type_id} 
                  onChange={e => setMissionForm({...missionForm, mission_type_id: e.target.value})}
                  className="min-h-[44px]"
                >
                  <option value="">בחר סוג משימה...</option>
                  {missionTypes.map(mt => (
                    <option key={mt.id} value={mt.id}>
                      {mt.icon || "📋"} {mt.name[lang] || mt.name.he}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">תאריך <span className="text-red-500">*</span></Label>
              <Input 
                type="date" 
                value={missionForm.date} 
                onChange={e => setMissionForm({...missionForm, date: e.target.value})} 
                className="min-h-[44px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">שעת התחלה <span className="text-red-500">*</span></Label>
                <Input 
                  type="time" 
                  value={missionForm.start_time} 
                  onChange={e => setMissionForm({...missionForm, start_time: e.target.value})} 
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">שעת סיום <span className="text-red-500">*</span></Label>
                <Input 
                  type="time" 
                  value={missionForm.end_time} 
                  onChange={e => setMissionForm({...missionForm, end_time: e.target.value})} 
                  className="min-h-[44px]"
                />
              </div>
            </div>
            {editingMissionId && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                💡 סוג המשימה לא ניתן לשינוי לאחר יצירה. לשינוי סוג — מחק וצור מחדש.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowMissionModal(false); setEditingMissionId(null); }} className="min-h-[44px]">
              ביטול
            </Button>
            <Button onClick={saveMission} className="min-h-[44px]">
              {editingMissionId ? "💾 עדכן משימה" : "➕ צור משימה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mission Type Modal (Create/Edit) */}
      <Dialog open={showTypeModal} onOpenChange={(open) => { setShowTypeModal(open); if (!open) setEditingTypeId(null); }}>
        <DialogContent className="max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTypeId ? t("editMissionType") : t("newMissionType")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>שם (עברית)</Label><Input value={typeForm.name_he} onChange={e => setTypeForm({...typeForm, name_he: e.target.value})} /></div>
              <div className="space-y-2"><Label>שם (אנגלית)</Label><Input value={typeForm.name_en} onChange={e => setTypeForm({...typeForm, name_en: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2"><Label>צבע</Label><Input type="color" value={typeForm.color} onChange={e => setTypeForm({...typeForm, color: e.target.value})} /></div>
              <div className="space-y-2"><Label>אייקון</Label><Input value={typeForm.icon} onChange={e => setTypeForm({...typeForm, icon: e.target.value})} placeholder="📋" /></div>
              <div className="space-y-2">
                <Label>משך (שעות)</Label>
                <div className="flex gap-1 mb-1">
                  {[4, 8, 12, 24].map(h => (
                    <button key={h} type="button" onClick={() => setTypeForm({...typeForm, duration_hours: h})}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${typeForm.duration_hours === h ? "bg-primary-500 text-white" : "bg-muted hover:bg-accent"}`}>
                      {h}h
                    </button>
                  ))}
                </div>
                <Input type="number" value={typeForm.duration_hours} onChange={e => setTypeForm({...typeForm, duration_hours: Number(e.target.value)})} placeholder="מותאם" />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                  <input type="checkbox" checked={typeForm.is_standby} onChange={e => setTypeForm({...typeForm, is_standby: e.target.checked})} className="rounded accent-primary-500" />
                  <div>
                    <span className="font-medium">⚡ כוננות</span>
                    <p className="text-xs text-muted-foreground">משימה מסוג כוננות — לא תמיד מופעלת</p>
                  </div>
                </label>
                {typeForm.is_standby && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border border-dashed p-3 hover:bg-muted/50 transition-colors ms-4 animate-in slide-in-from-top-1">
                    <input type="checkbox" checked={typeForm.standby_can_count_as_rest} onChange={e => setTypeForm({...typeForm, standby_can_count_as_rest: e.target.checked})} className="rounded accent-primary-500" />
                    <div>
                      <span className="font-medium">😴 כוננות נחשבת מנוחה</span>
                      <p className="text-xs text-muted-foreground">כוננות שלא הופעלה נספרת כזמן מנוחה</p>
                    </div>
                  </label>
                )}
              </div>
            </div>

            {/* Slot Builder */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label className="text-base font-semibold">סלוטים נדרשים</Label>
                  <HelpTooltip
                    title={{ he: "מהו סלוט?", en: "What is a slot?" }}
                    content={{ he: "סלוט מגדיר כמה אנשים נדרשים מכל תפקיד.\nלדוגמה: משימת שמירה צריכה 2 שומרים + 1 מפקד.\nכל סלוט = תפקיד + כמות.", en: "A slot defines how many people of each role are needed." }}
                    examples={[{ he: "שומר × 2, מפקד × 1", en: "Guard × 2, Commander × 1" }]}
                  />
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setTypeForm({...typeForm, required_slots: [...typeForm.required_slots, { slot_id: `s${typeForm.required_slots.length + 1}`, work_role_id: workRoles[0]?.id || "", count: 1, label_he: "", label_en: "" }]})}>
                  <Plus className="h-3 w-3 me-1" />הוסף סלוט
                </Button>
              </div>
              {typeForm.required_slots.map((slot, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 items-end p-2 bg-muted/30 rounded">
                  <div><Label className="text-xs">שם (עב)</Label><Input value={slot.label_he} onChange={e => { const s = [...typeForm.required_slots]; s[i].label_he = e.target.value; setTypeForm({...typeForm, required_slots: s}); }} /></div>
                  <div><Label className="text-xs">שם (en)</Label><Input value={slot.label_en} onChange={e => { const s = [...typeForm.required_slots]; s[i].label_en = e.target.value; setTypeForm({...typeForm, required_slots: s}); }} /></div>
                  <div>
                    <Label className="text-xs">תפקיד</Label>
                    <Select value={slot.work_role_id} onChange={e => { const s = [...typeForm.required_slots]; s[i].work_role_id = e.target.value; setTypeForm({...typeForm, required_slots: s}); }}>
                      <option value="">בחר</option>
                      {workRoles.map(wr => <option key={wr.id} value={wr.id}>{wr.name?.[lang] || wr.name?.he}</option>)}
                    </Select>
                  </div>
                  <div><Label className="text-xs">כמות</Label><Input type="number" min={1} value={slot.count} onChange={e => { const s = [...typeForm.required_slots]; s[i].count = Number(e.target.value); setTypeForm({...typeForm, required_slots: s}); }} /></div>
                  <Button size="sm" variant="ghost" onClick={() => setTypeForm({...typeForm, required_slots: typeForm.required_slots.filter((_, j) => j !== i)})}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Pre-Mission Events */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label className="text-base font-semibold">אירועים לפני משימה</Label>
                  <HelpTooltip
                    title={{ he: "אירועים לפני משימה", en: "Pre-mission events" }}
                    content={{ he: "אירועים שצריכים לקרות לפני תחילת המשימה.\nלדוגמה: תדריך 30 דקות לפני, בדיקת ציוד 15 דקות לפני.\nהחיילים יראו את האירועים בלוח שלהם.", en: "Events that happen before the mission starts." }}
                    examples={[{ he: "תדריך — 30 דקות לפני — חדר תדריכים", en: "Briefing — 30 min before — briefing room" }]}
                  />
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setTypeForm({...typeForm, pre_mission_events: [...typeForm.pre_mission_events, { offset_minutes: -30, label_he: "", label_en: "", location_he: "" }]})}>
                  <Plus className="h-3 w-3 me-1" />הוסף
                </Button>
              </div>
              {typeForm.pre_mission_events.map((evt, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 items-end p-2 bg-muted/30 rounded">
                  <div><Label className="text-xs">דקות לפני</Label><Input type="number" value={Math.abs(evt.offset_minutes)} onChange={e => { const arr = [...typeForm.pre_mission_events]; arr[i].offset_minutes = -Math.abs(Number(e.target.value)); setTypeForm({...typeForm, pre_mission_events: arr}); }} /></div>
                  <div><Label className="text-xs">שם</Label><Input value={evt.label_he} onChange={e => { const arr = [...typeForm.pre_mission_events]; arr[i].label_he = e.target.value; setTypeForm({...typeForm, pre_mission_events: arr}); }} /></div>
                  <div><Label className="text-xs">מיקום</Label><Input value={evt.location_he} onChange={e => { const arr = [...typeForm.pre_mission_events]; arr[i].location_he = e.target.value; setTypeForm({...typeForm, pre_mission_events: arr}); }} /></div>
                  <Button size="sm" variant="ghost" onClick={() => setTypeForm({...typeForm, pre_mission_events: typeForm.pre_mission_events.filter((_, j) => j !== i)})}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Timeline Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label className="text-base font-semibold">פריטי ציר זמן</Label>
                  <HelpTooltip
                    title={{ he: "ציר זמן של משימה", en: "Mission timeline" }}
                    content={{ he: "פריטים שקורים במהלך המשימה.\nניתן להגדיר כזמן יחסי (X דקות אחרי ההתחלה) או כשעה מדויקת.\nלדוגמה: החלפת משמרות בשעה 12:00.", en: "Items during the mission. Relative or exact time." }}
                    examples={[
                      { he: "זמן יחסי: 60 דקות אחרי התחלה — ארוחת צהריים", en: "Relative: 60 min after start — lunch" },
                      { he: "שעה מדויקת: 12:00 — החלפת משמרת", en: "Exact: 12:00 — shift change" },
                    ]}
                  />
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setTypeForm({...typeForm, timeline_items: [...typeForm.timeline_items, { item_id: `t${typeForm.timeline_items.length + 1}`, offset_minutes: 30, label_he: "", label_en: "", time_mode: "relative", exact_time: "08:00" }]})}>
                  <Plus className="h-3 w-3 me-1" />הוסף
                </Button>
              </div>
              {typeForm.timeline_items.map((ti, i) => (
                <div key={i} className="p-2 bg-muted/30 rounded space-y-2">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="radio" name={`timeline-mode-${i}`} checked={ti.time_mode === "relative"} onChange={() => { const arr = [...typeForm.timeline_items]; arr[i].time_mode = "relative"; setTypeForm({...typeForm, timeline_items: arr}); }} className="accent-primary-500" />
                      זמן יחסי (דקות)
                    </label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="radio" name={`timeline-mode-${i}`} checked={ti.time_mode === "exact"} onChange={() => { const arr = [...typeForm.timeline_items]; arr[i].time_mode = "exact"; setTypeForm({...typeForm, timeline_items: arr}); }} className="accent-primary-500" />
                      שעה מדויקת
                    </label>
                  </div>
                  <div className="grid grid-cols-4 gap-2 items-end">
                    {ti.time_mode === "relative" ? (
                      <div><Label className="text-xs">דקות אחרי התחלה</Label><Input type="number" value={ti.offset_minutes} onChange={e => { const arr = [...typeForm.timeline_items]; arr[i].offset_minutes = Number(e.target.value); setTypeForm({...typeForm, timeline_items: arr}); }} /></div>
                    ) : (
                      <div><Label className="text-xs">שעה מדויקת</Label><Input type="time" value={ti.exact_time} onChange={e => { const arr = [...typeForm.timeline_items]; arr[i].exact_time = e.target.value; setTypeForm({...typeForm, timeline_items: arr}); }} /></div>
                    )}
                    <div><Label className="text-xs">שם (עב)</Label><Input value={ti.label_he} onChange={e => { const arr = [...typeForm.timeline_items]; arr[i].label_he = e.target.value; setTypeForm({...typeForm, timeline_items: arr}); }} /></div>
                    <div><Label className="text-xs">שם (en)</Label><Input value={ti.label_en} onChange={e => { const arr = [...typeForm.timeline_items]; arr[i].label_en = e.target.value; setTypeForm({...typeForm, timeline_items: arr}); }} /></div>
                    <Button size="sm" variant="ghost" onClick={() => setTypeForm({...typeForm, timeline_items: typeForm.timeline_items.filter((_, j) => j !== i)})}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowTypeModal(false); setEditingTypeId(null); }}>ביטול</Button>
            <Button onClick={saveMissionType}>{editingTypeId ? "עדכן" : "צור"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Modal */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("template.title")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>{t("template.name")}</Label><Input value={templateForm.name} onChange={e => setTemplateForm({...templateForm, name: e.target.value})} placeholder="משמרת בוקר ניוד" /></div>
            <div className="space-y-2">
              <Label>{t("template.missionType")}</Label>
              <Select value={templateForm.mission_type_id} onChange={e => setTemplateForm({...templateForm, mission_type_id: e.target.value})}>
                <option value="">בחר סוג</option>
                {missionTypes.map(mt => <option key={mt.id} value={mt.id}>{mt.name[lang] || mt.name.he}</option>)}
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>{t("template.recurrenceType")}</Label>
                <HelpTooltip
                  title={{ he: "סוג חזרתיות", en: "Recurrence type" }}
                  content={{ he: "מגדיר כל כמה זמן המשימה חוזרת:\n• יומי — כל יום\n• שבועי — ימים ספציפיים בשבוע\n• מותאם — שבועות זוגיים/אי-זוגיים\n• חד פעמי — פעם אחת בלבד", en: "How often the mission repeats." }}
                />
              </div>
              <Select value={templateForm.recurrence_type} onChange={e => setTemplateForm({...templateForm, recurrence_type: e.target.value})}>
                <option value="daily">{t("recurrence.daily")}</option>
                <option value="weekly">{t("recurrence.weekly")}</option>
                <option value="custom">{t("recurrence.custom")}</option>
                <option value="one_time">{t("recurrence.oneTime")}</option>
              </Select>
            </div>
            {templateForm.recurrence_type !== "daily" && templateForm.recurrence_type !== "one_time" && (
              <div className="space-y-2">
                <Label>{t("template.daysOfWeek")}</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_HE.map((d, i) => (
                    <button key={i} onClick={() => {
                      const days = templateForm.recurrence_days.includes(i)
                        ? templateForm.recurrence_days.filter(x => x !== i)
                        : [...templateForm.recurrence_days, i];
                      setTemplateForm({...templateForm, recurrence_days: days});
                    }} className={`h-9 w-9 rounded-full text-sm font-medium transition-colors ${
                      templateForm.recurrence_days.includes(i) ? "bg-primary-500 text-white" : "bg-muted hover:bg-accent"
                    }`}>{d}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>{t("template.activeWeeks")}</Label>
                <HelpTooltip
                  content={{ he: "הגדר באילו שבועות התבנית פעילה:\n• כל השבועות — תמיד\n• שבועות אי-זוגיים — שבוע 1, 3, 5...\n• שבועות זוגיים — שבוע 2, 4, 6...\nשימושי לסבב של שבוע-בשבוע.", en: "Which weeks the template is active." }}
                />
              </div>
              <Select value={templateForm.active_weeks} onChange={e => setTemplateForm({...templateForm, active_weeks: e.target.value})}>
                <option value="all">{t("recurrence.allWeeks")}</option>
                <option value="odd">{t("recurrence.oddWeeks")}</option>
                <option value="even">{t("recurrence.evenWeeks")}</option>
              </Select>
            </div>

            {/* Time Slots with Shift Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">{t("template.timeSlots")}</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setTemplateForm({...templateForm, time_slots: [...templateForm.time_slots, { slot_key: `custom_${templateForm.time_slots.length}`, start: "08:00", end: "16:00" }]})}>
                  <Plus className="h-3 w-3 me-1" />{t("template.addTimeSlot")}
                </Button>
              </div>
              <div className="flex gap-2 mb-2">
                <Label className="text-xs text-muted-foreground">{t("template.shiftPresets")}:</Label>
                {SHIFT_PRESETS.map(preset => (
                  <button key={preset.key} type="button" onClick={() => {
                    // Check if preset already exists
                    if (!templateForm.time_slots.some(ts => ts.slot_key === preset.key)) {
                      setTemplateForm({...templateForm, time_slots: [...templateForm.time_slots, { slot_key: preset.key, start: preset.start, end: preset.end }]});
                    }
                  }} className="text-xs px-2 py-1 rounded bg-muted hover:bg-accent transition-colors">
                    {preset.label} ({preset.start}-{preset.end})
                  </button>
                ))}
              </div>
              {templateForm.time_slots.map((ts, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 items-end p-2 bg-muted/30 rounded">
                  <div><Label className="text-xs">שם</Label><Input value={ts.slot_key} onChange={e => { const arr = [...templateForm.time_slots]; arr[i].slot_key = e.target.value; setTemplateForm({...templateForm, time_slots: arr}); }} /></div>
                  <div><Label className="text-xs">התחלה</Label><Input type="time" value={ts.start} onChange={e => { const arr = [...templateForm.time_slots]; arr[i].start = e.target.value; setTemplateForm({...templateForm, time_slots: arr}); }} /></div>
                  <div><Label className="text-xs">סיום</Label><Input type="time" value={ts.end} onChange={e => { const arr = [...templateForm.time_slots]; arr[i].end = e.target.value; setTemplateForm({...templateForm, time_slots: arr}); }} /></div>
                  <Button size="sm" variant="ghost" onClick={() => setTemplateForm({...templateForm, time_slots: templateForm.time_slots.filter((_, j) => j !== i)})}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Exception Dates */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("template.exceptions")}</Label>
                <Input type="date" className="w-40" onChange={e => {
                  if (e.target.value && !templateForm.exceptions.includes(e.target.value)) {
                    setTemplateForm({...templateForm, exceptions: [...templateForm.exceptions, e.target.value]});
                  }
                }} />
              </div>
              <div className="flex flex-wrap gap-1">
                {templateForm.exceptions.map((d, i) => (
                  <Badge key={i} className="cursor-pointer" onClick={() => setTemplateForm({...templateForm, exceptions: templateForm.exceptions.filter((_, j) => j !== i)})}>
                    {d} ✕
                  </Badge>
                ))}
              </div>
            </div>

            {/* Extra Dates */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("template.extraDates")}</Label>
                <Input type="date" className="w-40" onChange={e => {
                  if (e.target.value && !templateForm.extra_dates.includes(e.target.value)) {
                    setTemplateForm({...templateForm, extra_dates: [...templateForm.extra_dates, e.target.value]});
                  }
                }} />
              </div>
              <div className="flex flex-wrap gap-1">
                {templateForm.extra_dates.map((d, i) => (
                  <Badge key={i} className="cursor-pointer bg-green-100 text-green-700" onClick={() => setTemplateForm({...templateForm, extra_dates: templateForm.extra_dates.filter((_, j) => j !== i)})}>
                    {d} ✕
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateModal(false)}>ביטול</Button>
            <Button onClick={saveTemplate}>צור תבנית</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Soldier */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="max-w-[600px] max-h-[85vh] overflow-y-auto mobile-fullscreen">
          <DialogHeader><DialogTitle>{t("assignSoldier")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {/* Slot selection — show available slots from mission type */}
            <div className="space-y-2">
              <Label>בחר משבצת</Label>
              {(() => {
                const currentMission = missions.find(m => m.id === assignMissionId);
                const missionType = currentMission ? missionTypes.find(mt => mt.id === currentMission.mission_type_id) : null;
                const slots = missionType?.required_slots || [];
                const existingAssignments = currentMission?.assignments || [];
                
                if (slots.length === 0) {
                  return <Input value={assignForm.slot_id} onChange={e => setAssignForm({...assignForm, slot_id: e.target.value})} placeholder="הזן שם סלוט..." />;
                }
                
                return (
                  <div className="space-y-1">
                    {slots.map((s: any) => {
                      const filled = existingAssignments.filter((a: any) => a.slot_id === s.slot_id && a.status !== "replaced").length;
                      const total = s.count || 1;
                      const isFull = filled >= total;
                      const isSelected = assignForm.slot_id === s.slot_id;
                      const roleName = workRoles.find((wr: any) => wr.id === s.work_role_id)?.name;
                      const roleLabel = roleName ? (roleName[lang] || roleName.he || "") : "";
                      
                      return (
                        <button
                          key={s.slot_id}
                          onClick={() => setAssignForm({...assignForm, slot_id: s.slot_id, work_role_id: s.work_role_id || ""})}
                          disabled={isFull}
                          className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors text-start border ${
                            isSelected ? "bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500 border-primary-300" 
                            : isFull ? "bg-muted/50 text-muted-foreground cursor-not-allowed border-transparent" 
                            : "hover:bg-muted/50 border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{s.label?.[lang] || s.label?.he || s.slot_id}</span>
                            {roleLabel && <Badge className="text-[10px]">{roleLabel}</Badge>}
                          </div>
                          <span className={`text-xs ${isFull ? "text-green-600" : "text-muted-foreground"}`}>
                            {filled}/{total} {isFull ? "✓ מלא" : "פנוי"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            {/* Search soldiers */}
            <div className="space-y-2">
              <Label>{t("selectSoldier")}</Label>
              <Input placeholder="חיפוש חייל..." onChange={e => {
                const q = e.target.value.toLowerCase();
                setAssignForm({...assignForm, _search: q} as any);
              }} />
            </div>
            {/* Soldier list with role badges */}
            <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-lg p-2">
              {(() => {
                const allSoldiers = windowEmployees.length > 0 ? windowEmployees : employees;
                const currentMission = missions.find(m => m.id === assignMissionId);
                const missionType = currentMission ? missionTypes.find(mt => mt.id === currentMission.mission_type_id) : null;
                const slotDef = missionType?.required_slots?.find((s: any) => s.slot_id === assignForm.slot_id);
                const requiredRoleId = slotDef?.work_role_id || assignForm.work_role_id;
                const searchQ = (assignForm as any)._search || "";
                
                // Separate matching and non-matching
                const matching: any[] = [];
                const others: any[] = [];
                allSoldiers.forEach((emp: any) => {
                  const name = emp.full_name?.toLowerCase() || "";
                  const num = emp.employee_number?.toLowerCase() || "";
                  if (searchQ && !name.includes(searchQ) && !num.includes(searchQ)) return;
                  
                  const empRoles = emp.work_roles?.map((r: any) => r.id) || [];
                  if (requiredRoleId && empRoles.includes(requiredRoleId)) {
                    matching.push(emp);
                  } else {
                    others.push(emp);
                  }
                });
                
                const renderSoldier = (emp: any, isMatch: boolean) => {
                  const id = emp.id || emp.employee_id;
                  // Preference indicators
                  const empPrefs = employeePrefsMap[id];
                  const assignedIds = (currentMission?.assignments || [])
                    .filter((a: any) => a.status !== "replaced")
                    .map((a: any) => a.employee_id);
                  const hasPreferredPartner = empPrefs?.partner_preferences?.some(
                    (p: any) => assignedIds.includes(p.employee_id)
                  );
                  const missionTypePref = empPrefs?.mission_type_preferences?.find(
                    (p: any) => p.mission_type_id === currentMission?.mission_type_id
                  );
                  // Determine time slot from mission start_time
                  const startH = currentMission?.start_time ? parseInt(currentMission.start_time.split(":")[0]) : -1;
                  const slotKey = startH >= 7 && startH < 15 ? "morning" : startH >= 15 && startH < 23 ? "afternoon" : "night";
                  const timeSlotPref = empPrefs?.time_slot_preferences?.find(
                    (p: any) => p.slot_key === slotKey
                  );

                  return (
                    <button
                      key={id}
                      onClick={() => setAssignForm({...assignForm, employee_id: id, work_role_id: requiredRoleId || workRoles[0]?.id || ""})}
                      className={`w-full flex flex-col gap-1 rounded-lg px-3 py-2.5 text-sm transition-colors text-start ${
                        assignForm.employee_id === id ? "bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{emp.full_name}</span>
                          <span className="text-xs text-muted-foreground">({emp.employee_number})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {emp.work_roles?.map((r: any) => (
                            <Badge key={r.id} className="text-[10px] px-1.5" style={{ backgroundColor: r.color + "20", color: r.color }}>
                              {r.name?.[lang] || r.name?.he}
                            </Badge>
                          ))}
                          {isMatch ? (
                            <Badge className="bg-green-100 text-green-700 text-[10px]">✓ תואם</Badge>
                          ) : requiredRoleId ? (
                            <Badge className="bg-yellow-100 text-yellow-700 text-[10px]">תפקיד לא תואם</Badge>
                          ) : null}
                        </div>
                      </div>
                      {/* Preference indicators */}
                      {empPrefs && (hasPreferredPartner || missionTypePref || timeSlotPref) && (
                        <div className="flex flex-wrap gap-1">
                          {hasPreferredPartner && (
                            <Badge className="bg-green-100 text-green-700 text-[10px] border border-green-300">✓ חבר מועדף</Badge>
                          )}
                          {missionTypePref?.preference === "prefer" && (
                            <Badge className="bg-blue-100 text-blue-700 text-[10px] border border-blue-300">👍 מעדיף משימה</Badge>
                          )}
                          {missionTypePref?.preference === "avoid" && (
                            <Badge className="bg-orange-100 text-orange-700 text-[10px] border border-orange-300">⚠️ מעדיף להימנע</Badge>
                          )}
                          {timeSlotPref?.preference === "prefer" && (
                            <Badge className="bg-blue-100 text-blue-700 text-[10px] border border-blue-300">⏰ מעדיף זמן</Badge>
                          )}
                          {timeSlotPref?.preference === "avoid" && (
                            <Badge className="bg-orange-100 text-orange-700 text-[10px] border border-orange-300">⏰ מעדיף זמן אחר</Badge>
                          )}
                        </div>
                      )}
                    </button>
                  );
                };
                
                return (
                  <>
                    {matching.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-green-600 mb-1">✓ תפקיד תואם ({matching.length})</p>
                        {matching.map(emp => renderSoldier(emp, true))}
                      </div>
                    )}
                    {others.length > 0 && (
                      <div>
                        {matching.length > 0 && <div className="border-t my-2" />}
                        <p className="text-xs font-medium text-muted-foreground mb-1">חיילים נוספים ({others.length})</p>
                        {others.map(emp => renderSoldier(emp, false))}
                      </div>
                    )}
                    {matching.length === 0 && others.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-4">לא נמצאו חיילים</p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>ביטול</Button>
            <Button onClick={() => assignEmployee()} disabled={!assignForm.employee_id}>שבץ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hard Conflict Fail-Safe Dialog */}
      <Dialog open={!!hardConflict} onOpenChange={(open) => { if (!open) { setHardConflict(null); setOverrideJustification(""); setShowOverrideConfirm(false); } }}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              שיבוץ נחסם — התנגשות קשה
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
              <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">{hardConflict?.message}</p>
              {hardConflict?.details && hardConflict.details.length > 0 && (
                <ul className="space-y-1">
                  {hardConflict.details.map((d, i) => (
                    <li key={i} className="text-sm text-red-700 dark:text-red-300 flex items-start gap-1.5">
                      <span className="text-red-500 mt-0.5">•</span>
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!showOverrideConfirm ? (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => { setHardConflict(null); }}>
                  חזרה — לא לשבץ
                </Button>
                <Button variant="destructive" className="flex-1 min-h-[44px]" onClick={() => setShowOverrideConfirm(true)}>
                  <AlertTriangle className="me-1 h-4 w-4" />
                  עקוף בכל זאת
                </Button>
              </div>
            ) : (
              <div className="space-y-3 animate-in slide-in-from-top-2">
                <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 p-3 text-sm text-yellow-700 dark:text-yellow-300">
                  ⚠️ אתה עומד לעקוף חוק חמור. הסבר סיבה — הפעולה תירשם ביומן.
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold">נימוק לעקיפה (חובה) <span className="text-red-500">*</span></Label>
                  <textarea
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                    value={overrideJustification}
                    onChange={e => setOverrideJustification(e.target.value)}
                    placeholder="לדוגמה: אין חייל חלופי זמין, אושר ע״י מפקד הפלוגה..."
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setShowOverrideConfirm(false)}>
                    ביטול
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 min-h-[44px]"
                    disabled={overrideJustification.trim().length < 5}
                    onClick={() => {
                      setHardConflict(null);
                      setShowOverrideConfirm(false);
                      assignEmployee(true);
                    }}
                  >
                    אישור עקיפה ושיבוץ
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Generate from Template */}
      <Dialog open={showGenerateModal} onOpenChange={setShowGenerateModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("template.generateMissions")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>תבנית</Label>
              <Select value={generateForm.template_id} onChange={e => setGenerateForm({...generateForm, template_id: e.target.value})}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>מתאריך</Label><Input type="date" value={generateForm.start_date} onChange={e => setGenerateForm({...generateForm, start_date: e.target.value})} /></div>
              <div className="space-y-2"><Label>עד תאריך</Label><Input type="date" value={generateForm.end_date} onChange={e => setGenerateForm({...generateForm, end_date: e.target.value})} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateModal(false)}>ביטול</Button>
            <Button onClick={generateMissions}>צור משימות</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Assign Results */}
      <Dialog open={showAutoAssignResults} onOpenChange={setShowAutoAssignResults}>
        <DialogContent className="max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>תוצאות שיבוץ אוטומטי</DialogTitle></DialogHeader>
          {autoAssignResults && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <Card><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{autoAssignResults.total_assigned}</p>
                  <p className="text-sm text-muted-foreground">שובצו בהצלחה</p>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{autoAssignResults.total_soft_warnings}</p>
                  <p className="text-sm text-muted-foreground">אזהרות רכות</p>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{autoAssignResults.total_hard_conflicts}</p>
                  <p className="text-sm text-muted-foreground">התנגשויות קשות</p>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-gray-600">{autoAssignResults.unresolved_slots}</p>
                  <p className="text-sm text-muted-foreground">סלוטים לא מאוישים</p>
                </CardContent></Card>
              </div>
              <p className="text-sm text-muted-foreground">{autoAssignResults.missions_processed} משימות עובדו</p>
              {autoAssignResults.assignments?.length > 0 && (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {autoAssignResults.assignments.map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded bg-muted/50 px-3 py-2 text-sm">
                      <span>{a.employee_name} → {a.mission_name} ({a.slot_id})</span>
                      <div className="flex items-center gap-1">
                        <Badge className="text-xs">ציון: {a.score}</Badge>
                        {a.soft_warnings?.length > 0 && (
                          <Badge className="bg-yellow-100 text-yellow-700 text-xs">
                            {a.soft_warnings.length} אזהרות
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowAutoAssignResults(false)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Mission Type Confirm */}
      <ConfirmDialog
        open={!!deleteTypeTarget}
        onClose={() => setDeleteTypeTarget(null)}
        onConfirm={() => deleteTypeTarget && deleteMissionType(deleteTypeTarget)}
        title={t("deleteMissionType")}
        description={t("deleteMissionTypeConfirm")}
        confirmText={t("common:delete")}
        variant="destructive"
      />

      {/* Delete Template Confirm */}
      <ConfirmDialog
        open={!!deleteTemplateTarget}
        onClose={() => setDeleteTemplateTarget(null)}
        onConfirm={() => deleteTemplateTarget && deleteTemplate(deleteTemplateTarget)}
        title="מחיקת תבנית"
        description={`האם למחוק את התבנית "${deleteTemplateTarget?.name}"? פעולה זו לא ניתנת לביטול.`}
        confirmText="מחק"
        variant="destructive"
      />

      {/* Import Soldiers Wizard */}
      <Dialog open={showImportWizard} onOpenChange={setShowImportWizard}>
        <DialogContent className="max-w-[650px] max-h-[80vh] overflow-y-auto mobile-fullscreen">
          <DialogHeader><DialogTitle>ייבוא חיילים ללוח עבודה</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-4 text-sm">
              <Badge variant="success">{importPreviewData.length} שורות תקינות</Badge>
              {importFileErrors.length > 0 && <Badge variant="destructive">{importFileErrors.length} שגיאות</Badge>}
            </div>
            {importFileErrors.length > 0 && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
                {importFileErrors.map((err: any, i: number) => <div key={i}>שורה {err.row}: {err.error}</div>)}
              </div>
            )}
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-start">מספר אישי</th>
                  <th className="px-3 py-2 text-start">שם</th>
                </tr></thead>
                <tbody>
                  {importPreviewData.slice(0, 50).map((r: any, i: number) => (
                    <tr key={i} className="border-b"><td className="px-3 py-2 font-mono">{r.employee_number}</td><td className="px-3 py-2">{r.full_name || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportWizard(false)}>ביטול</Button>
            <Button onClick={executeWindowImport} disabled={importPreviewData.length === 0}>
              ייבא {importPreviewData.length} חיילים
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
