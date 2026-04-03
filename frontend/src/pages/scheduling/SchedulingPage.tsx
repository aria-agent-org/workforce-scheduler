import { useState, useEffect, useCallback, useRef } from "react";
import DailyBoardView from "@/components/scheduling/DailyBoardView";
import ToggleSwitch from "@/components/ui/toggle-switch";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar, Plus, Wand2, Play, Pause, Archive, Copy,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Users, Clock, Trash2, UserPlus,
  Pencil, Upload, ArrowLeft, Eye, AlertTriangle, Check, LayoutTemplate,
  MoreVertical, RefreshCw, X, ArrowRightLeft, Search, Printer, Menu,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import HelpTooltip from "@/components/common/HelpTooltip";
import { useWebSocket } from "@/hooks/useWebSocket";

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
  const navigate = useNavigate();
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
  const [boardView, setBoardView] = useState<"day" | "week" | "calendar" | "daily-board">("day");
  const [dailyBoardTables] = useState<any[]>([]);
  const [dailyBoardTimeShifts] = useState<any[]>([]);
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<string | null>(null);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);

  // Daily board templates (from board template editor in Settings)
  const [dailyBoardTemplates, setDailyBoardTemplates] = useState<any[]>([]);
  const [showDailyBoardTemplatesModal, setShowDailyBoardTemplatesModal] = useState(false);

  // Modals
  const [showWindowModal, setShowWindowModal] = useState(false);
  const [showMissionModal, setShowMissionModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  // Smart form toggles
  const [showEnglishFields, setShowEnglishFields] = useState(false);
  const [showPreMission, setShowPreMission] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showAutoAssignResults, setShowAutoAssignResults] = useState(false);
  const [autoAssignResults, setAutoAssignResults] = useState<any>(null);
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<any>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [importWizardStep, setImportWizardStep] = useState(1);
  const [importMethod, setImportMethod] = useState<"list" | "previous" | "csv" | "">(""); 
  const [importSelectedEmployees, setImportSelectedEmployees] = useState<Set<string>>(new Set());
  const [importPreviousWindowId, setImportPreviousWindowId] = useState("");
  const [importEmployeeSearch, setImportEmployeeSearch] = useState("");
  const [importLoading, setImportLoading] = useState(false);

  // Interactive board context menu
  const [contextMenu, setContextMenu] = useState<{
    type: "soldier" | "empty_slot" | "mission";
    x: number; y: number;
    missionId: string; assignmentId?: string; slotId?: string;
    employeeName?: string; employeeId?: string; workRoleId?: string;
  } | null>(null);
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<{ missionId: string; assignmentId: string; slotId: string; workRoleId: string; employeeName: string; employeeId: string } | null>(null);
  const [eligibleSoldiers, setEligibleSoldiers] = useState<any[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [replaceSearch, setReplaceSearch] = useState("");
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swapTarget, setSwapTarget] = useState<{ missionId: string; employeeId: string; employeeName: string } | null>(null);
  const [swapForm, setSwapForm] = useState({ target_employee_id: "", reason: "" });

  // Form validation errors
  const [typeFormErrors, setTypeFormErrors] = useState<Record<string, string>>({});

  // Edit tracking
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<any>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // Form data
  const [windowForm, setWindowForm] = useState({ name: "", start_date: "", end_date: "" });
  const [missionForm, setMissionForm] = useState({
    schedule_window_id: "", mission_type_id: "", name: "", date: "", start_time: "08:00", end_time: "16:00",
  });
  const [typeForm, setTypeForm] = useState({
    name_he: "", name_en: "", color: "#3b82f6", icon: "📋", duration_hours: 8, is_standby: false,
    standby_can_count_as_rest: false,
    required_slots: [] as Array<{ slot_id: string; work_role_id: string; count: number; label_he: string; label_en: string; role_mode?: "specific" | "all" | "all_except"; exclude_role_ids?: string[] }>,
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

  const [loadError, setLoadError] = useState(false);

  // Concurrent edit tracking via WebSocket
  const [editingUsers, setEditingUsers] = useState<Record<string, { user_name: string; timestamp: number }>>({});
  const currentUserName = typeof window !== "undefined" ? localStorage.getItem("user_name") || "" : "";

  const { send: wsSend } = useWebSocket({
    "user.editing": (msg: any) => {
      if (msg.user_name === currentUserName) return; // Ignore own edits
      const key = `${msg.entity_type}:${msg.entity_id}`;
      setEditingUsers(prev => ({
        ...prev,
        [key]: { user_name: msg.user_name, timestamp: Date.now() },
      }));
    },
    "notification.sent": () => {
      // Trigger notification badge update via custom event
      document.dispatchEvent(new CustomEvent("shavtzak:notification-received"));
    },
  });

  // Clear stale editing indicators after 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setEditingUsers(prev => {
        const now = Date.now();
        const next: typeof prev = {};
        for (const [key, val] of Object.entries(prev)) {
          if (now - val.timestamp < 30000) next[key] = val;
        }
        return next;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Broadcast editing state when a mission is expanded for editing
  useEffect(() => {
    if (expandedMission) {
      wsSend({
        type: "user.editing",
        entity_type: "mission",
        entity_id: expandedMission,
        user_name: currentUserName,
      });
      // Re-send every 15s while editing
      const interval = setInterval(() => {
        wsSend({
          type: "user.editing",
          entity_type: "mission",
          entity_id: expandedMission,
          user_name: currentUserName,
        });
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [expandedMission, wsSend, currentUserName]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [winRes, mtRes, empRes, wrRes, dbtRes] = await Promise.all([
        api.get(tenantApi("/schedule-windows")),
        api.get(tenantApi("/mission-types")),
        api.get(tenantApi("/employees"), { params: { page_size: 200 } }),
        api.get(tenantApi("/settings/work-roles")),
        api.get(tenantApi("/daily-board-templates")).catch(() => ({ data: [] })),
      ]);
      setWindows(winRes.data);
      setMissionTypes(mtRes.data);
      setEmployees(empRes.data.items || []);
      setWorkRoles(wrRes.data);
      setDailyBoardTemplates(Array.isArray(dbtRes.data) ? dbtRes.data : []);
    } catch (e) {
      setLoadError(true);
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
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
  };

  const windowAction = async (id: string, action: string) => {
    try {
      await api.post(tenantApi(`/schedule-windows/${id}/${action}`));
      toast("success", `פעולה בוצעה: ${action}`);
      loadAll();
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
  };

  // === MISSION TYPE CRUD ===
  const saveMissionType = async () => {
    const errors: Record<string, string> = {};
    if (!typeForm.name_he.trim()) errors.name_he = "שם בעברית הוא שדה חובה";
    if (typeForm.required_slots.length === 0) errors.required_slots = "יש להוסיף לפחות סלוט אחד";
    setTypeFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    try {
      const slots = typeForm.required_slots.map((s, i) => ({
        slot_id: s.slot_id || `s${i + 1}`,
        work_role_id: (s.role_mode === "all" || s.role_mode === "all_except") ? null : (s.work_role_id || null),
        count: s.count,
        label: { he: s.label_he, en: s.label_en },
        role_mode: s.role_mode || "specific",
        exclude_role_ids: s.role_mode === "all_except" ? (s.exclude_role_ids || []) : undefined,
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
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
  };

  const openEditType = (mt: any) => {
    setEditingTypeId(mt.id);
    setTypeFormErrors({});
    setTypeForm({
      name_he: mt.name?.he || "",
      name_en: mt.name?.en || "",
      color: mt.color || "#3b82f6",
      icon: mt.icon || "📋",
      duration_hours: mt.duration_hours || 8,
      is_standby: mt.is_standby || false,
      standby_can_count_as_rest: mt.standby_can_count_as_rest || false,
      required_slots: (mt.required_slots || []).map((s: any) => ({
        slot_id: s.slot_id, work_role_id: s.work_role_id || "", count: s.count,
        label_he: s.label?.he || "", label_en: s.label?.en || "",
        role_mode: s.role_mode || (s.work_role_id ? "specific" : "all"),
        exclude_role_ids: s.exclude_role_ids || [],
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
    // Smart: auto-expand sections that have data
    setShowEnglishFields(!!mt.name?.en);
    setShowPreMission((mt.pre_mission_events || []).length > 0);
    setShowTimeline((mt.timeline_items || []).length > 0);
  };

  const openCreateType = () => {
    setEditingTypeId(null);
    setTypeFormErrors({});
    setTypeForm({
      name_he: "", name_en: "", color: "#3b82f6", icon: "📋", duration_hours: 8, is_standby: false,
      standby_can_count_as_rest: false,
      required_slots: [], pre_mission_events: [], post_mission_rule: null, timeline_items: [],
    });
    setShowTypeModal(true);
    // Smart: collapse optional sections for new types
    setShowEnglishFields(false);
    setShowPreMission(false);
    setShowTimeline(false);
  };

  const deleteMissionType = async (mt: any) => {
    try {
      await api.delete(tenantApi(`/mission-types/${mt.id}`));
      toast("success", "סוג משימה נמחק");
      setDeleteTypeTarget(null);
      loadAll();
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
  };

  // === MISSIONS ===
  const createMission = async () => {
    try {
      await api.post(tenantApi("/missions"), missionForm);
      toast("success", "משימה נוצרה בהצלחה");
      setShowMissionModal(false);
      setEditingMissionId(null);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
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
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה בעדכון משימה")); }
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
  const [deleteTemplateMode, setDeleteTemplateMode] = useState<string>("none");
  const deleteTemplate = async (tmpl: any) => {
    try {
      await api.delete(tenantApi(`/mission-templates/${tmpl.id}?delete_missions=${deleteTemplateMode}`));
      const modeText = deleteTemplateMode === "future" ? " + משימות עתידיות" : deleteTemplateMode === "all" ? " + כל המשימות" : "";
      toast("success", `תבנית נמחקה${modeText}`);
      setDeleteTemplateTarget(null);
      setDeleteTemplateMode("none");
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה במחיקת תבנית")); }
  };

  const propagateTemplateUpdate = async (tmplId: string) => {
    try {
      const res = await api.patch(tenantApi(`/mission-templates/${tmplId}?propagate=true`), {});
      toast("success", `עודכנו ${res.data.propagated_missions} משימות עתידיות`);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה בעדכון משימות")); }
  };

  // === TEMPLATES ===
  const saveTemplate = async () => {
    try {
      const payload = {
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
      };

      if (editingTemplateId) {
        // Edit existing — ask about propagation
        const shouldPropagate = confirm("האם לעדכן גם את כל המשימות העתידיות שנוצרו מתבנית זו?");
        await api.patch(tenantApi(`/mission-templates/${editingTemplateId}?propagate=${shouldPropagate}`), payload);
        toast("success", shouldPropagate ? "תבנית עודכנה + משימות עתידיות עודכנו" : "תבנית עודכנה");
      } else {
        await api.post(tenantApi("/mission-templates"), payload);
        toast("success", "תבנית נוצרה בהצלחה");
      }
      setShowTemplateModal(false);
      setEditingTemplateId(null);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
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
      toast("error", (typeof detail === "string" ? detail : "שגיאה"));
    }
  };

  // === GENERATE ===
  const generateMissions = async () => {
    try {
      const res = await api.post(tenantApi("/missions/generate"), generateForm);
      toast("success", `נוצרו ${res.data.created} משימות`);
      setShowGenerateModal(false);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
  };

  // === AUTO ASSIGN ===
  const autoAssign = async () => {
    if (!selectedWindow) return;
    try {
      toast("info", "מריץ שיבוץ אוטומטי...");
      const res = await api.post(tenantApi("/missions/auto-assign"), {
        window_id: selectedWindow.id,
      });
      setAutoAssignResults(res.data);
      setShowAutoAssignResults(true);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה בשיבוץ אוטומטי")); }
  };

  // === IMPORT SOLDIERS TO WINDOW ===
  const [importPreviewData, setImportPreviewData] = useState<any[]>([]);
  const [importFileErrors, setImportFileErrors] = useState<any[]>([]);
  const [showBoardActionsMenu, setShowBoardActionsMenu] = useState(false);

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
      toast("error", getErrorMessage(e, "שגיאה בייבוא"));
    }
  };

  const missionAction = async (id: string, action: string) => {
    try {
      await api.post(tenantApi(`/missions/${id}/${action}`));
      toast("success", "פעולה בוצעה");
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
  };

  // === INTERACTIVE BOARD ACTIONS ===
  const closeContextMenu = () => setContextMenu(null);

  const loadEligibleSoldiers = async (missionId: string, slotId: string) => {
    setEligibleLoading(true);
    try {
      const res = await api.get(tenantApi(`/missions/${missionId}/eligible-soldiers/${encodeURIComponent(slotId)}`));
      setEligibleSoldiers(Array.isArray(res.data) ? res.data : (res.data.eligible || []));
    } catch {
      // Fallback: show all window employees
      setEligibleSoldiers((windowEmployees.length > 0 ? windowEmployees : employees).map((e: any) => ({ ...e, score: 0 })));
    } finally {
      setEligibleLoading(false);
    }
  };

  const removeAssignment = async (missionId: string, assignmentId: string) => {
    try {
      await api.delete(tenantApi(`/missions/${missionId}/assignments/${assignmentId}`));
      toast("success", "חייל הוסר מהמשימה");
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה בהסרת שיבוץ")); }
  };

  const replaceAssignment = async (missionId: string, oldAssignmentId: string, newEmployeeId: string, slotId: string, workRoleId: string) => {
    try {
      await api.delete(tenantApi(`/missions/${missionId}/assignments/${oldAssignmentId}`));
      await api.post(tenantApi(`/missions/${missionId}/assignments`), {
        employee_id: newEmployeeId,
        work_role_id: workRoleId,
        slot_id: slotId,
      });
      toast("success", "חייל הוחלף בהצלחה");
      setShowReplaceDialog(false);
      setReplaceTarget(null);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה בהחלפת חייל")); }
  };

  const autoFindReplacement = async (missionId: string, assignmentId: string, slotId: string, workRoleId: string, currentEmployeeName: string) => {
    try {
      toast("info", "מחפש מחליף אוטומטי...");
      const res = await api.get(tenantApi(`/missions/${missionId}/eligible-soldiers/${encodeURIComponent(slotId)}`));
      const eligible = Array.isArray(res.data) ? res.data : (res.data.eligible || []);
      if (eligible.length === 0) {
        toast("warning", "לא נמצא מחליף מתאים");
        return;
      }
      const best = eligible[0]; // Already sorted by score
      const empName = typeof best.employee_name === "object" ? (best.employee_name?.he || best.employee_name?.en || "") : (best.employee_name || best.full_name || "");
      const confirmed = window.confirm(`מחליף מומלץ: ${empName} (ציון: ${best.score || "N/A"})\nלהחליף את ${currentEmployeeName}?`);
      if (confirmed) {
        await replaceAssignment(missionId, assignmentId, best.id || best.employee_id, slotId, workRoleId);
      }
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה במציאת מחליף")); }
  };

  const submitSwapRequest = async () => {
    if (!swapTarget) return;
    try {
      await api.post(tenantApi("/swap-requests"), {
        mission_id: swapTarget.missionId,
        requester_employee_id: swapTarget.employeeId,
        target_employee_id: swapForm.target_employee_id,
        reason: swapForm.reason,
      });
      toast("success", "בקשת החלפה נשלחה");
      setShowSwapDialog(false);
      setSwapTarget(null);
      setSwapForm({ target_employee_id: "", reason: "" });
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה בשליחת בקשת החלפה")); }
  };

  const openSoldierContextMenu = (e: React.MouseEvent, missionId: string, assignment: any) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setContextMenu({
      type: "soldier",
      x: rect.left,
      y: rect.bottom + 4,
      missionId,
      assignmentId: assignment.id,
      slotId: assignment.slot_id,
      employeeName: assignment.employee_name,
      employeeId: assignment.employee_id,
      workRoleId: assignment.work_role_id || "",
    });
  };

  const openEmptySlotContextMenu = (e: React.MouseEvent, missionId: string, slotId: string, workRoleId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setContextMenu({
      type: "empty_slot",
      x: rect.left,
      y: rect.bottom + 4,
      missionId,
      slotId,
      workRoleId,
    });
  };

  const openMissionContextMenu = (e: React.MouseEvent, missionId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setContextMenu({
      type: "mission",
      x: rect.left,
      y: rect.bottom + 4,
      missionId,
    });
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => closeContextMenu();
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [contextMenu]);

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

  if (loading) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-muted rounded animate-pulse" />
          <div className="h-9 w-28 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div className="flex gap-2 border-b pb-2">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-9 w-28 bg-muted rounded animate-pulse" />)}
      </div>
      <div className="grid gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-6 w-48 bg-muted rounded animate-pulse" />
              <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
            </div>
            <div className="flex gap-4">
              <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loadError && windows.length === 0) return (
    <div className="empty-state">
      <div className="h-20 w-20 rounded-2xl bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center mb-6 shadow-elevation-1">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
      </div>
      <p className="empty-state-title">שגיאה בטעינת נתוני שיבוצים</p>
      <p className="empty-state-description mb-4">לא ניתן היה לטעון את הנתונים. נסה שוב.</p>
      <Button onClick={loadAll} variant="outline" className="gap-2">
        <RefreshCw className="h-4 w-4" />נסה שוב
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex gap-2 flex-wrap items-center">
          {activeTab === "board" && selectedWindow && (
            <>
              {/* Desktop: show all buttons */}
              <div className="hidden sm:flex gap-2 flex-wrap items-center">
                <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
                  <Printer className="me-1 h-4 w-4" />הדפס
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/settings?tab=board-template')}>
                  <LayoutTemplate className="me-1 h-4 w-4" />עורך לוח
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowDailyBoardTemplatesModal(true)}>
                  <LayoutTemplate className="me-1 h-4 w-4" />תבניות לוח {dailyBoardTemplates.length > 0 && <span className="ms-1 text-xs bg-primary-100 text-primary-700 rounded-full px-1.5">{dailyBoardTemplates.length}</span>}
                </Button>
                <Button variant="default" size="sm" className="bg-green-600 hover:bg-green-700" onClick={async () => {
                  if (dailyBoardTemplates.length === 0) {
                    toast("warning", "אין תבניות לוח — לחץ 'תבניות לוח' כדי ליצור");
                    setShowDailyBoardTemplatesModal(true);
                    return;
                  }
                  if (dailyBoardTemplates.length === 1) {
                    try {
                      toast("info", "מייצר לוח יומי מתבנית...");
                      const tmpl = dailyBoardTemplates[0];
                      await api.post(tenantApi(`/daily-board-templates/${tmpl.id}/generate`), {
                        date_from: boardDate, date_to: boardDate,
                      });
                      toast("success", `לוח יומי נוצר בהצלחה ליום ${boardDate}`);
                      if (selectedWindow) loadWindowData(selectedWindow.id);
                    } catch (err: any) {
                      toast("error", err?.response?.data?.detail || "שגיאה ביצירת לוח יומי");
                    }
                  } else {
                    setShowDailyBoardTemplatesModal(true);
                  }
                }}>
                  <Wand2 className="me-1 h-4 w-4" />ייצור לוח יומי
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
              </div>

              {/* Mobile: show primary actions + "more" menu */}
              <div className="flex sm:hidden gap-2 items-center">
                <Button variant="default" size="sm" className="bg-green-600 hover:bg-green-700 min-h-[40px]" onClick={async () => {
                  try {
                    toast("info", "מייצר לוח יומי מתבנית...");
                    const tmplRes = await api.get(tenantApi("/daily-board-templates"));
                    const boardTemplates = Array.isArray(tmplRes.data) ? tmplRes.data : [];
                    if (boardTemplates.length === 0) {
                      toast("warning", "אין תבניות לוח — עבור לעורך הלוח וצור תבנית");
                      return;
                    }
                    const tmpl = boardTemplates[0];
                    await api.post(tenantApi(`/daily-board-templates/${tmpl.id}/generate`), {
                      date_from: boardDate,
                      date_to: boardDate,
                    });
                    toast("success", `לוח יומי נוצר בהצלחה ליום ${boardDate}`);
                    if (selectedWindow) loadWindowData(selectedWindow.id);
                  } catch (err: any) {
                    const detail = err?.response?.data?.detail || "שגיאה ביצירת לוח יומי";
                    toast("error", detail);
                  }
                }}>
                  <Wand2 className="me-1 h-4 w-4" />ייצור לוח
                </Button>
                <Button variant="outline" size="sm" className="min-h-[40px]" onClick={autoAssign}>
                  <Wand2 className="me-1 h-4 w-4" />שיבוץ אוטו׳
                </Button>
                <Button size="sm" className="min-h-[40px]" onClick={() => {
                  setEditingMissionId(null);
                  setMissionForm({ schedule_window_id: selectedWindow.id, mission_type_id: "", name: "", date: boardDate, start_time: "08:00", end_time: "16:00" });
                  setShowMissionModal(true);
                }}>
                  <Plus className="h-4 w-4" />
                </Button>
                {/* More actions dropdown */}
                <div className="relative">
                  <Button variant="outline" size="sm" className="min-h-[40px]" onClick={() => setShowBoardActionsMenu(v => !v)}>
                    <Menu className="h-4 w-4" />
                  </Button>
                  {showBoardActionsMenu && (
                    <div className="absolute end-0 top-full mt-1 z-50 bg-background border rounded-xl shadow-lg min-w-[180px] p-1" onClick={() => setShowBoardActionsMenu(false)}>
                      <button className="w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg hover:bg-muted" onClick={() => window.print()}>
                        <Printer className="h-4 w-4" />הדפס
                      </button>
                      <button className="w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg hover:bg-muted" onClick={() => navigate('/settings?tab=board-template')}>
                        <LayoutTemplate className="h-4 w-4" />עורך לוח
                      </button>
                      <button className="w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg hover:bg-muted" onClick={() => {
                        if (templates.length > 0) {
                          setGenerateForm({ template_id: templates[0]?.id || "", start_date: selectedWindow.start_date, end_date: selectedWindow.end_date });
                          setShowGenerateModal(true);
                        } else {
                          toast("warning", "אין תבניות — צור תבנית קודם");
                        }
                      }}>
                        <Calendar className="h-4 w-4" />יצירה מתבנית
                      </button>
                    </div>
                  )}
                </div>
              </div>
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
              setEditingTemplateId(null);
              setShowTemplateModal(true);
            }}>
              <Plus className="me-1 h-4 w-4" />תבנית חדשה
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2 overflow-x-auto scrollbar-hide" role="tablist" aria-label="טאבים שיבוצים">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm transition-all min-h-[44px] ${
              activeTab === key ? "bg-primary-500 text-white shadow-elevation-2" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
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
            // Determine if this is the "active" board (one active window at a time)
            const isActive = w.status === "active";

            return (
            <Card key={w.id} className={`hover:shadow-lg transition-all cursor-pointer group border-s-4 ${isActive ? "ring-2 ring-green-400 dark:ring-green-600" : ""}`} style={{ borderInlineStartColor: isActive ? "#22c55e" : w.status === "paused" ? "#eab308" : w.status === "archived" ? "#6366f1" : "#9ca3af" }} onClick={() => openWindowBoard(w)}>
              <CardContent className="p-5">
                {isActive && (
                  <div className="flex items-center gap-2 mb-2 text-green-700 dark:text-green-400">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-bold">לוח פעיל — מרכז הפעולות הנוכחי</span>
                  </div>
                )}
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold">{w.name}</h3>
                      <Badge className={`${isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-bold" : statusColors[w.status] || ""} text-xs`}>
                        {isActive ? "✅ לוח פעיל" : t(`status.${w.status}`)}
                      </Badge>
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
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                      <Button size="sm" variant="outline" className="min-h-[40px] border-green-300 text-green-700 hover:bg-green-50" onClick={() => windowAction(w.id, "resume")} title="המשך">
                        <Play className="h-3.5 w-3.5 me-1" />המשך
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="min-h-[40px] border-purple-300 text-purple-700 hover:bg-purple-50" onClick={() => windowAction(w.id, "copy")} title="העתק">
                      <Copy className="h-3.5 w-3.5 me-1" />העתק
                    </Button>
                    {w.status !== "archived" && (
                      <Button size="sm" variant="ghost" className="min-h-[40px] text-muted-foreground hover:text-foreground" onClick={() => windowAction(w.id, "archive")} title="ארכיון">
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    )}
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
        <div className="space-y-4 board-container" style={{ WebkitOverflowScrolling: "touch" }}>
          {/* Active board banner */}
          {selectedWindow.status === "active" && (
            <div className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-2.5 text-green-800 dark:text-green-300">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              <span className="text-sm font-semibold">לוח פעיל</span>
              <span className="text-sm opacity-70">— זהו הלוח המשמש לנוכחות ושיבוצים כרגע</span>
            </div>
          )}
          {/* Board Header with Navigation */}
          <div className="bg-card border rounded-lg p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => { setActiveTab("windows"); setSelectedWindow(null); }}>
                <ArrowLeft className="me-1 h-4 w-4" />חזרה ללוחות
              </Button>
              <div className="h-6 border-r border-border" />
              <h2 className="text-lg font-bold">{selectedWindow.name}</h2>
              <Badge className={selectedWindow.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-bold" : statusColors[selectedWindow.status]}>{selectedWindow.status === "active" ? "✅ לוח פעיל" : t(`status.${selectedWindow.status}`)}</Badge>
              <span className="text-xs text-muted-foreground">
                {selectedWindow.start_date} — {selectedWindow.end_date}
              </span>
              <div className="flex-1" />
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
              <Button variant="outline" size="sm" onClick={() => { 
                setImportWizardStep(1); 
                setImportMethod(""); 
                setImportSelectedEmployees(new Set()); 
                setImportPreviousWindowId(""); 
                setImportEmployeeSearch("");
                setShowImportWizard(true); 
              }}>
                <UserPlus className="me-1 h-4 w-4" />הוסף חיילים
              </Button>
            </div>

            {/* Board Dashboard — Quick Summary */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="text-center bg-muted/50 rounded-lg p-2">
                <p className="text-xl font-bold">{windowEmployees.length}</p>
                <p className="text-[10px] text-muted-foreground">חיילים בלוח</p>
              </div>
              <div className="text-center bg-muted/50 rounded-lg p-2">
                <p className="text-xl font-bold">{missions.length}</p>
                <p className="text-[10px] text-muted-foreground">סה״כ משימות</p>
              </div>
              <div className="text-center bg-muted/50 rounded-lg p-2">
                <p className="text-xl font-bold">
                  {(() => {
                    let filled = 0, total = 0;
                    missions.forEach(m => {
                      const mt = missionTypes.find(t => t.id === m.mission_type_id);
                      // Use mission-level slots first, fallback to mission type slots
                      const slots = (m as any).required_slots || mt?.required_slots || [];
                      total += slots.reduce((s: number, sl: any) => s + (sl.count || 1), 0);
                      filled += (m.assignments || []).filter((a: any) => a.status !== "replaced").length;
                    });
                    return total > 0 ? `${Math.round((filled / total) * 100)}%` : "—";
                  })()}
                </p>
                <p className="text-[10px] text-muted-foreground">אחוז איוש</p>
              </div>
              <div className="text-center bg-muted/50 rounded-lg p-2">
                <p className="text-xl font-bold">
                  {missions.filter(m => {
                    const mt = missionTypes.find(t => t.id === m.mission_type_id);
                    const slots = (m as any).required_slots || mt?.required_slots || [];
                    const needed = slots.reduce((s: number, sl: any) => s + (sl.count || 1), 0);
                    const filled = (m.assignments || []).filter((a: any) => a.status !== "replaced").length;
                    return filled < needed;
                  }).length}
                </p>
                <p className="text-[10px] text-muted-foreground">משבצות חסרות</p>
              </div>
              <div className="text-center bg-muted/50 rounded-lg p-2">
                <p className="text-xl font-bold">
                  {new Set(missions.flatMap(m => (m.assignments || []).filter((a: any) => a.status !== "replaced").map((a: any) => a.employee_id))).size}
                </p>
                <p className="text-[10px] text-muted-foreground">חיילים משובצים</p>
              </div>
            </div>
          </div>

          {/* Board View Controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="flex gap-1 bg-muted rounded-lg p-1 w-full sm:w-auto overflow-x-auto scrollbar-hide">
              <button onClick={() => setBoardView("day")} className={`px-3 py-2 text-sm rounded-md min-h-[44px] transition-all whitespace-nowrap flex-shrink-0 ${boardView === "day" ? "bg-primary-500 text-white shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>יומי</button>
              <button onClick={() => setBoardView("week")} className={`px-3 py-2 text-sm rounded-md min-h-[44px] transition-all whitespace-nowrap flex-shrink-0 ${boardView === "week" ? "bg-primary-500 text-white shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>שבועי</button>
              <button onClick={() => setBoardView("calendar")} className={`px-3 py-2 text-sm rounded-md min-h-[44px] transition-all whitespace-nowrap flex-shrink-0 ${boardView === "calendar" ? "bg-primary-500 text-white shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>לוח שנה</button>
              <button onClick={() => setBoardView("daily-board")} className={`px-3 py-2 text-sm rounded-md min-h-[44px] transition-all flex items-center gap-1 whitespace-nowrap flex-shrink-0 font-semibold ${boardView === "daily-board" ? "bg-green-700 text-white shadow-sm" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200"}`}>
                <LayoutTemplate className="h-3.5 w-3.5" />לוח שבצ&quot;ק
              </button>
            </div>
            <div className="flex items-center gap-1 flex-1 w-full sm:w-auto">
              <Button variant="ghost" size="icon" className="h-11 w-11 rounded-lg flex-shrink-0" onClick={() => {
                const d = new Date(boardDate);
                d.setDate(d.getDate() - 1);
                setBoardDate(d.toISOString().split("T")[0]);
              }} aria-label="יום קודם"><ChevronRight className="h-5 w-5" /></Button>
              <Input type="date" value={boardDate} onChange={e => setBoardDate(e.target.value)} className="min-h-[44px] flex-1 min-w-0 text-base" />
              <Button variant="ghost" size="icon" className="h-11 w-11 rounded-lg flex-shrink-0" onClick={() => {
                const d = new Date(boardDate);
                d.setDate(d.getDate() + 1);
                setBoardDate(d.toISOString().split("T")[0]);
              }} aria-label="יום הבא"><ChevronLeft className="h-5 w-5" /></Button>
            </div>
          </div>

          {/* Window Statistics Card */}
          {selectedWindow && missions.length > 0 && (() => {
            const totalMissions = missions.length;
            const byStatus: Record<string, number> = {};
            missions.forEach(m => { byStatus[m.status] = (byStatus[m.status] || 0) + 1; });
            
            let totalSlots = 0;
            let filledSlots = 0;
            const empCounts: Record<string, { name: string; count: number }> = {};
            const assignedEmpIds = new Set<string>();
            
            missions.forEach(m => {
              const mt = missionTypes.find(t => t.id === m.mission_type_id);
              const slots = (m as any).required_slots || mt?.required_slots || [];
              totalSlots += slots.reduce((sum: number, s: any) => sum + (s.count || 1), 0);
              
              (m.assignments || []).forEach((a: any) => {
                if (a.status !== "replaced") {
                  filledSlots++;
                  assignedEmpIds.add(a.employee_id);
                  if (!empCounts[a.employee_id]) {
                    empCounts[a.employee_id] = { name: a.employee_name || "—", count: 0 };
                  }
                  empCounts[a.employee_id].count++;
                }
              });
            });
            
            const fillRate = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;
            const topEmployees = Object.values(empCounts)
              .sort((a, b) => b.count - a.count)
              .slice(0, 3);
            const totalEmployees = windowEmployees.length || employees.length;
            
            return (
              <Card className="border-primary-200 dark:border-primary-800 bg-gradient-to-br from-primary-50/50 to-transparent dark:from-primary-900/10">
                <CardContent className="p-4">
                  <h3 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-1.5">📊 סטטיסטיקת לוח</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{totalMissions}</p>
                      <p className="text-xs text-muted-foreground">סה״כ משימות</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold" style={{ color: fillRate === 100 ? "#22c55e" : fillRate > 50 ? "#eab308" : "#ef4444" }}>{fillRate}%</p>
                      <p className="text-xs text-muted-foreground">אחוז איוש ({filledSlots}/{totalSlots})</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{assignedEmpIds.size}/{totalEmployees}</p>
                      <p className="text-xs text-muted-foreground">חיילים משובצים</p>
                    </div>
                    <div className="text-center">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {Object.entries(byStatus).map(([st, count]) => (
                          <Badge key={st} className={`${statusColors[st] || ""} text-[10px]`}>
                            {t(`status.${st}`)}: {count}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">לפי סטטוס</p>
                    </div>
                  </div>
                  {topEmployees.length > 0 && (
                    <div className="border-t pt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">🏆 חיילים פעילים ביותר:</p>
                      <div className="flex flex-wrap gap-2">
                        {topEmployees.map((emp, i) => (
                          <Badge key={i} className="bg-muted text-foreground text-xs">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} {emp.name} ({emp.count} שיבוצים)
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Calendar View */}
          {boardView === "calendar" && (() => {
            const calDate = new Date(boardDate);
            const year = calDate.getFullYear();
            const month = calDate.getMonth();
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const startPad = firstDay.getDay(); // 0=Sun
            const totalDays = lastDay.getDate();
            const calDays: Array<{ date: string; dayNum: number; isCurrentMonth: boolean }> = [];

            // Padding from previous month
            for (let i = startPad - 1; i >= 0; i--) {
              const d = new Date(year, month, -i);
              calDays.push({ date: d.toISOString().split("T")[0], dayNum: d.getDate(), isCurrentMonth: false });
            }
            // Current month
            for (let d = 1; d <= totalDays; d++) {
              const dt = new Date(year, month, d);
              calDays.push({ date: dt.toISOString().split("T")[0], dayNum: d, isCurrentMonth: true });
            }
            // Padding to fill last row
            const remaining = 7 - (calDays.length % 7);
            if (remaining < 7) {
              for (let i = 1; i <= remaining; i++) {
                const d = new Date(year, month + 1, i);
                calDays.push({ date: d.toISOString().split("T")[0], dayNum: d.getDate(), isCurrentMonth: false });
              }
            }

            const dayNames = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
            const monthNames = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

            const missionsByDate: Record<string, any[]> = {};
            missions.forEach(m => {
              if (!missionsByDate[m.date]) missionsByDate[m.date] = [];
              missionsByDate[m.date].push(m);
            });

            const today = new Date().toISOString().split("T")[0];

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => {
                    const prev = new Date(year, month - 1, 1);
                    setBoardDate(prev.toISOString().split("T")[0]);
                  }}>
                    <ChevronDown className="h-4 w-4 rotate-90" />
                  </Button>
                  <h2 className="text-lg font-bold">{monthNames[month]} {year}</h2>
                  <Button variant="ghost" size="sm" onClick={() => {
                    const next = new Date(year, month + 1, 1);
                    setBoardDate(next.toISOString().split("T")[0]);
                  }}>
                    <ChevronDown className="h-4 w-4 -rotate-90" />
                  </Button>
                </div>

                <div className="grid grid-cols-7 gap-px bg-muted rounded-xl overflow-hidden border">
                  {/* Day headers */}
                  {dayNames.map(d => (
                    <div key={d} className="bg-muted/80 py-2 text-center text-xs font-bold text-muted-foreground">
                      {d}
                    </div>
                  ))}
                  {/* Day cells */}
                  {calDays.map((day) => {
                    const dayMissions = missionsByDate[day.date] || [];
                    const isToday = day.date === today;
                    const isSelected = calendarSelectedDay === day.date;
                    // Group by mission type for colored dots
                    const typeGroups: Record<string, { color: string; count: number }> = {};
                    dayMissions.forEach(m => {
                      const mt = missionTypes.find(mt2 => mt2.id === m.mission_type_id);
                      const color = mt?.color || "#3b82f6";
                      if (!typeGroups[color]) typeGroups[color] = { color, count: 0 };
                      typeGroups[color].count++;
                    });

                    return (
                      <button
                        key={day.date}
                        onClick={() => setCalendarSelectedDay(isSelected ? null : day.date)}
                        className={`min-h-[80px] p-1.5 bg-background transition-all text-start hover:bg-muted/50 ${
                          !day.isCurrentMonth ? "opacity-40" : ""
                        } ${isToday ? "ring-2 ring-inset ring-primary-500" : ""} ${
                          isSelected ? "bg-primary-50 dark:bg-primary-900/20" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-medium ${isToday ? "bg-primary-500 text-white rounded-full w-5 h-5 flex items-center justify-center" : ""}`}>
                            {day.dayNum}
                          </span>
                          {dayMissions.length > 0 && (
                            <span className="text-[10px] font-bold text-muted-foreground bg-muted rounded-full px-1.5">
                              {dayMissions.length}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-0.5">
                          {Object.values(typeGroups).slice(0, 4).map((tg, i) => (
                            <span key={i} className="h-2 w-2 rounded-full" style={{ backgroundColor: tg.color }} title={`${tg.count} משימות`} />
                          ))}
                          {Object.keys(typeGroups).length > 4 && (
                            <span className="text-[8px] text-muted-foreground">+{Object.keys(typeGroups).length - 4}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected day detail */}
                {calendarSelectedDay && (() => {
                  const dayMissions = missionsByDate[calendarSelectedDay] || [];
                  const selectedDateObj = new Date(calendarSelectedDay);
                  const dayLabel = selectedDateObj.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
                  return (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between">
                          <span>📅 {dayLabel}</span>
                          <Badge className="bg-muted text-foreground">{dayMissions.length} משימות</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {dayMissions.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">אין משימות ביום זה</p>
                        ) : dayMissions.map((m: any) => {
                          const mt = missionTypes.find(mt2 => mt2.id === m.mission_type_id);
                          return (
                            <div key={m.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors cursor-pointer"
                              onClick={() => { setBoardView("day"); setBoardDate(calendarSelectedDay); setExpandedMission(m.id); }}>
                              <div className="h-9 w-9 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: (mt?.color || "#3b82f6") + "18" }}>
                                {mt?.icon || "📋"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{m.name}</p>
                                <p className="text-xs text-muted-foreground">⏰ {m.start_time?.slice(0, 5)}–{m.end_time?.slice(0, 5)} · 👥 {m.assignments?.length || 0} שובצו</p>
                              </div>
                              <Badge className={`${statusColors[m.status] || ""} text-[10px]`}>{t(`status.${m.status}`)}</Badge>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>
            );
          })()}

          {/* === DAILY BOARD (שבצ"ק) VIEW === */}
          {boardView === "daily-board" && (
            <DailyBoardView
              date={boardDate}
              windowId={selectedWindow?.id}
              missions={boardMissions}
              employees={windowEmployees.length > 0 ? windowEmployees : employees}
              missionTypes={missionTypes}
              timeShifts={dailyBoardTimeShifts.length > 0 ? dailyBoardTimeShifts : undefined}
              tables={dailyBoardTables.length > 0 ? dailyBoardTables : undefined}
            />
          )}

          {/* Missions list */}
          {boardView !== "calendar" && boardView !== "daily-board" && boardMissions.length === 0 ? (
            <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground">
              <Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-lg font-medium">אין משימות בטווח זה</p>
              <p className="text-sm mt-1">צור משימה חדשה או השתמש בתבנית כדי ליצור משימות אוטומטית</p>
            </CardContent></Card>
          ) : boardView !== "calendar" && boardView !== "daily-board" ? (
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
                          <p className="font-semibold text-base">
                            <button
                              className="hover:underline hover:text-primary-600 transition-colors text-start"
                              onClick={(e) => { e.stopPropagation(); navigate(`/missions/${m.id}`); }}
                            >
                              {m.name}
                            </button>
                          </p>
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
                          {/* Concurrent edit indicator */}
                          {editingUsers[`mission:${m.id}`] && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                              </span>
                              <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                                {editingUsers[`mission:${m.id}`].user_name} עורך כעת
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity min-h-[36px]" onClick={(e) => openMissionContextMenu(e, m.id)}>
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
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
                          {/* Standby activation/deactivation */}
                          {missionTypes.find((mt: any) => mt.id === m.mission_type_id)?.is_standby && !m.is_activated && (
                            <Button size="sm" variant="outline" className="min-h-[40px] border-red-300 text-red-700 hover:bg-red-50" onClick={async () => {
                              try {
                                await api.post(tenantApi(`/missions/${m.id}/mark-activated`));
                                toast("success", "🚨 משימה הוקפצה!");
                                if (selectedWindow) loadWindowData(selectedWindow.id);
                              } catch (e: any) { toast("error", e?.response?.data?.detail || "שגיאה"); }
                            }}>
                              🚨 הקפץ
                            </Button>
                          )}
                          {m.is_activated && !m.deactivated_at && (
                            <Button size="sm" variant="outline" className="min-h-[40px] border-blue-300 text-blue-700 hover:bg-blue-50" onClick={async () => {
                              try {
                                await api.post(tenantApi(`/missions/${m.id}/mark-deactivated`));
                                toast("success", "✅ ההקפצה הסתיימה");
                                if (selectedWindow) loadWindowData(selectedWindow.id);
                              } catch (e: any) { toast("error", e?.response?.data?.detail || "שגיאה"); }
                            }}>
                              ✅ סיים הקפצה
                            </Button>
                          )}
                          {m.is_activated && (
                            <Badge className={m.deactivated_at ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700 animate-pulse"}>
                              {m.deactivated_at ? "הוקפצה (הסתיימה)" : "🚨 הוקפצה"}
                            </Badge>
                          )}
                          <Button size="sm" variant="ghost" className="min-h-[40px] text-orange-500 hover:bg-orange-50 hover:text-orange-600" onClick={async () => {
                            try {
                              await api.patch(tenantApi(`/missions/${m.id}`), { status: "archived" });
                              toast("success", "משימה הועברה לארכיון");
                              if (selectedWindow) loadWindowData(selectedWindow.id);
                            } catch { missionAction(m.id, "archive"); }
                          }}>
                            <Archive className="h-3.5 w-3.5 me-1" />ארכיון
                          </Button>
                          <Button size="sm" variant="ghost" className="min-h-[40px] text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => missionAction(m.id, "cancel")}>
                            <Trash2 className="h-3.5 w-3.5 me-1" />בטל
                          </Button>
                        </div>
                        {m.assignments?.length > 0 ? (
                          <div className="space-y-1">
                            {m.assignments.map((a: any) => (
                              <div key={a.id} className="flex items-center justify-between rounded bg-muted/50 px-3 py-2 text-sm group/assign">
                                <button
                                  className="font-medium text-primary-600 hover:underline cursor-pointer"
                                  onClick={(e) => openSoldierContextMenu(e, m.id, a)}
                                >
                                  {a.employee_name}
                                </button>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{(() => { const mt2 = missionTypes.find((t: any) => t.id === missions.find((m2: any) => m2.assignments?.some((a2: any) => a2.id === a.id))?.mission_type_id); const sl = mt2?.required_slots?.find((s: any) => s.slot_id === a.slot_id); return sl?.label?.[lang] || sl?.label?.he || a.slot_id; })()}</span>
                                  {a.conflicts_detected?.length > 0 && (
                                    <Badge className="bg-yellow-100 text-yellow-700">
                                      <AlertTriangle className="inline h-3 w-3 me-1" />{a.conflicts_detected.length} אזהרות
                                    </Badge>
                                  )}
                                  <Badge variant={a.status === "assigned" || a.status === "proposed" ? "success" : "default"}>{a.status}</Badge>
                                </div>
                              </div>
                            ))}
                            {/* Show empty slots */}
                            {(() => {
                              const mType = missionTypes.find(mt2 => mt2.id === m.mission_type_id);
                              const slots = mType?.required_slots || [];
                              const emptySlots: Array<{ slotId: string; workRoleId: string; label: string; remaining: number }> = [];
                              slots.forEach((s: any) => {
                                const filled = m.assignments.filter((a2: any) => a2.slot_id === s.slot_id && a2.status !== "replaced").length;
                                const remaining = (s.count || 1) - filled;
                                if (remaining > 0) {
                                  emptySlots.push({
                                    slotId: s.slot_id,
                                    workRoleId: s.work_role_id || "",
                                    label: s.label?.[lang] || s.label?.he || s.slot_id,
                                    remaining,
                                  });
                                }
                              });
                              return emptySlots.map((es) => (
                                <button
                                  key={`empty-${es.slotId}`}
                                  className="w-full flex items-center justify-between rounded border-2 border-dashed border-muted-foreground/20 px-3 py-2 text-sm text-muted-foreground hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-colors cursor-pointer"
                                  onClick={(e) => openEmptySlotContextMenu(e, m.id, es.slotId, es.workRoleId)}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <UserPlus className="h-3.5 w-3.5" />
                                    {es.label} — {es.remaining} פנויים
                                  </span>
                                  <span className="text-xs">לחץ לשיבוץ</span>
                                </button>
                              ));
                            })()}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">{t("noAssignments")}</p>
                            {(() => {
                              const mType = missionTypes.find(mt2 => mt2.id === m.mission_type_id);
                              return (mType?.required_slots || []).map((s: any) => (
                                <button
                                  key={`empty-new-${s.slot_id}`}
                                  className="w-full flex items-center justify-between rounded border-2 border-dashed border-muted-foreground/20 px-3 py-2 text-sm text-muted-foreground hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-colors cursor-pointer"
                                  onClick={(e) => openEmptySlotContextMenu(e, m.id, s.slot_id, s.work_role_id || "")}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <UserPlus className="h-3.5 w-3.5" />
                                    {s.label?.[lang] || s.label?.he || s.slot_id} — {s.count || 1} פנויים
                                  </span>
                                  <span className="text-xs">לחץ לשיבוץ</span>
                                </button>
                              ));
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
                );
              })}
            </div>
          ) : null}
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
                    <ToggleSwitch
                      checked={tmpl.is_active !== false}
                      onChange={async () => {
                        try {
                          await api.patch(tenantApi(`/mission-templates/${tmpl.id}`), { is_active: tmpl.is_active === false });
                          toast("success", tmpl.is_active === false ? "תבנית הופעלה" : "תבנית הושבתה");
                          if (selectedWindow) loadWindowData(selectedWindow.id);
                        } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
                      }}
                      label={tmpl.is_active === false ? "הפעל תבנית" : "השבת תבנית"}
                    />
                    <Button size="sm" variant="outline" className="min-h-[40px]" disabled={tmpl.is_active === false} onClick={() => {
                      setGenerateForm({ template_id: tmpl.id, start_date: selectedWindow?.start_date || "", end_date: selectedWindow?.end_date || "" });
                      setShowGenerateModal(true);
                    }}>
                      <Calendar className="me-1 h-3.5 w-3.5" />צור משימות
                    </Button>
                    <Button size="sm" variant="ghost" className="min-h-[40px] min-w-[40px]" title="ערוך תבנית" onClick={() => {
                      setEditingTemplateId(tmpl.id);
                      setTemplateForm({
                        schedule_window_id: tmpl.schedule_window_id || selectedWindow?.id || "",
                        mission_type_id: tmpl.mission_type_id || "",
                        name: tmpl.name || "",
                        recurrence_type: tmpl.recurrence?.type || "daily",
                        recurrence_days: tmpl.recurrence?.days_of_week || [],
                        active_weeks: tmpl.recurrence?.active_weeks || "all",
                        time_slots: tmpl.time_slots || [{ slot_key: "morning", start: "07:00", end: "15:00" }],
                        exceptions: tmpl.recurrence?.exceptions || [],
                        extra_dates: tmpl.recurrence?.extra_dates || [],
                      });
                      setShowTemplateModal(true);
                    }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="min-h-[40px] min-w-[40px] text-blue-500 hover:bg-blue-50" title="עדכן משימות עתידיות שנוצרו מתבנית זו" onClick={() => {
                      if (confirm("האם לעדכן את כל המשימות העתידיות שנוצרו מתבנית זו?")) {
                        propagateTemplateUpdate(tmpl.id);
                      }
                    }}>
                      🔄
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
                  onChange={e => {
                    const mtId = e.target.value;
                    const mt = missionTypes.find((t: any) => t.id === mtId);
                    // Auto-populate name and duration from mission type
                    const updates: any = { mission_type_id: mtId };
                    if (mt) {
                      if (!missionForm.name) {
                        updates.name = mt.name?.[lang] || mt.name?.he || "";
                      }
                      if (mt.duration_hours) {
                        const startHour = parseInt(missionForm.start_time?.split(":")[0] || "8");
                        const endHour = (startHour + Math.floor(mt.duration_hours)) % 24;
                        const endMin = Math.round((mt.duration_hours % 1) * 60);
                        updates.end_time = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;
                      }
                    }
                    setMissionForm({...missionForm, ...updates});
                  }}
                  className="min-h-[44px]"
                >
                  <option value="">בחר סוג משימה...</option>
                  {missionTypes.map((mt: any) => (
                    <option key={mt.id} value={mt.id}>
                      {mt.icon || "📋"} {mt.name[lang] || mt.name.he}
                      {mt.duration_hours ? ` (${mt.duration_hours} שעות)` : ""}
                    </option>
                  ))}
                </Select>
                {(() => {
                  const selectedMt = missionTypes.find((t: any) => t.id === missionForm.mission_type_id);
                  if (!selectedMt?.required_slots?.length) return null;
                  return (
                    <div className="mt-2 text-xs bg-muted/50 rounded-lg px-3 py-2 space-y-1">
                      <p className="font-medium text-muted-foreground">📋 סלוטים שיוגדרו אוטומטית:</p>
                      {selectedMt.required_slots.map((s: any, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-primary">•</span>
                          <span>{s.label?.[lang] || s.label?.he || s.slot_id}</span>
                          <span className="text-muted-foreground">×{s.count || 1}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

      {/* Mission Type Modal (Create/Edit) — bottom sheet on mobile */}
      <Dialog open={showTypeModal} onOpenChange={(open) => { setShowTypeModal(open); if (!open) setEditingTypeId(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-[700px] max-h-[85vh] overflow-y-auto mobile-bottom-sheet">
          <DialogHeader><DialogTitle>{editingTypeId ? t("editMissionType") : t("newMissionType")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>שם (עברית) <span className="text-red-500">*</span></Label>
                <Input value={typeForm.name_he} onChange={e => { setTypeForm({...typeForm, name_he: e.target.value}); if (typeFormErrors.name_he) setTypeFormErrors(prev => ({...prev, name_he: ""})); }} className={`min-h-[44px] ${typeFormErrors.name_he ? "border-red-500 ring-1 ring-red-500" : ""}`} />
                {typeFormErrors.name_he && <p className="text-sm text-red-600">{typeFormErrors.name_he}</p>}
              </div>
              {showEnglishFields ? (
                <div className="space-y-2"><Label>שם (אנגלית)</Label><Input value={typeForm.name_en} onChange={e => setTypeForm({...typeForm, name_en: e.target.value})} className="min-h-[44px]" /></div>
              ) : (
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground self-end mb-2" onClick={() => setShowEnglishFields(true)}>
                  + שם באנגלית
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
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
                  <>
                    <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-3 ms-4 animate-in slide-in-from-top-1">
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        ⚡ משימת כוננות: חיילים בכוננות ממתינים להקפצה. ניתן להגדיר אם הכוננות נחשבת למנוחה.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border border-dashed p-3 hover:bg-muted/50 transition-colors ms-4 animate-in slide-in-from-top-1">
                      <input type="checkbox" checked={typeForm.standby_can_count_as_rest} onChange={e => setTypeForm({...typeForm, standby_can_count_as_rest: e.target.checked})} className="rounded accent-primary-500" />
                      <div>
                        <span className="font-medium">😴 כוננות נחשבת מנוחה</span>
                        <p className="text-xs text-muted-foreground">כוננות שלא הופעלה נספרת כזמן מנוחה</p>
                      </div>
                    </label>
                  </>
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
                <Button type="button" size="sm" variant="outline" onClick={() => {
                  const firstRole = workRoles[0];
                  const newSlot = {
                    slot_id: `s${typeForm.required_slots.length + 1}`,
                    work_role_id: firstRole?.id || "",
                    count: 1,
                    label_he: firstRole?.name?.he || firstRole?.name?.[lang] || "",
                    label_en: firstRole?.name?.en || firstRole?.name?.he || "",
                  };
                  setTypeForm({...typeForm, required_slots: [...typeForm.required_slots, newSlot]});
                  if (typeFormErrors.required_slots) setTypeFormErrors(prev => ({...prev, required_slots: ""}));
                }}>
                  <Plus className="h-3 w-3 me-1" />הוסף סלוט
                </Button>
              </div>
              {typeFormErrors.required_slots && <p className="text-sm text-red-600">{typeFormErrors.required_slots}</p>}
              {typeForm.required_slots.map((slot, i) => (
                <div key={i} className="p-3 bg-muted/30 rounded space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                    <div><Label className="text-xs">שם (עב)</Label><Input value={slot.label_he} placeholder="יתמלא אוטומטית מהתפקיד" onChange={e => { const s = [...typeForm.required_slots]; s[i].label_he = e.target.value; setTypeForm({...typeForm, required_slots: s}); }} /></div>
                    {showEnglishFields && <div><Label className="text-xs">שם (en)</Label><Input value={slot.label_en} onChange={e => { const s = [...typeForm.required_slots]; s[i].label_en = e.target.value; setTypeForm({...typeForm, required_slots: s}); }} /></div>}
                    <div>
                      <Label className="text-xs">תפקיד</Label>
                      <Select value={slot.role_mode || "specific"} onChange={e => {
                        const s = [...typeForm.required_slots];
                        const mode = e.target.value as "specific" | "all" | "all_except";
                        s[i].role_mode = mode;
                        if (mode === "all") { s[i].work_role_id = ""; s[i].exclude_role_ids = []; }
                        else if (mode === "all_except") { s[i].work_role_id = ""; }
                        else { s[i].exclude_role_ids = []; }
                        setTypeForm({...typeForm, required_slots: s});
                      }}>
                        <option value="specific">תפקיד ספציפי</option>
                        <option value="all">הכל (כל התפקידים)</option>
                        <option value="all_except">הכל למעט...</option>
                      </Select>
                    </div>
                    <div><Label className="text-xs">כמות</Label><Input type="number" min={1} value={slot.count} onChange={e => { const s = [...typeForm.required_slots]; s[i].count = Number(e.target.value); setTypeForm({...typeForm, required_slots: s}); }} /></div>
                    <Button size="sm" variant="ghost" onClick={() => setTypeForm({...typeForm, required_slots: typeForm.required_slots.filter((_, j) => j !== i)})}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>
                  {/* Specific role selector */}
                  {(!slot.role_mode || slot.role_mode === "specific") && (
                    <div>
                      <Select value={slot.work_role_id} onChange={e => {
                        const s = [...typeForm.required_slots];
                        const prevRole = workRoles.find((wr: any) => wr.id === s[i].work_role_id);
                        s[i].work_role_id = e.target.value;
                        // Auto-populate label from role name if label is empty or matches previous role name
                        const selectedRole = workRoles.find((wr: any) => wr.id === e.target.value);
                        if (selectedRole) {
                          const prevNameHe = prevRole?.name?.he || prevRole?.name?.[lang] || "";
                          const isAutoLabel = !s[i].label_he || s[i].label_he === prevNameHe;
                          if (isAutoLabel) {
                            s[i].label_he = selectedRole.name?.he || selectedRole.name?.[lang] || "";
                            s[i].label_en = selectedRole.name?.en || selectedRole.name?.he || "";
                          }
                        }
                        setTypeForm({...typeForm, required_slots: s});
                      }}>
                        <option value="">בחר תפקיד...</option>
                        {workRoles.map(wr => <option key={wr.id} value={wr.id}>{wr.name?.[lang] || wr.name?.he}</option>)}
                      </Select>
                    </div>
                  )}
                  {/* All roles info */}
                  {slot.role_mode === "all" && (
                    <div className="text-xs text-muted-foreground bg-green-50 dark:bg-green-900/20 rounded px-2 py-1">
                      ✓ כל התפקידים — כל חייל יכול להשתבץ למשבצת זו
                    </div>
                  )}
                  {/* Exclude roles multi-select */}
                  {slot.role_mode === "all_except" && (
                    <div className="space-y-1">
                      <Label className="text-xs">תפקידים לא כלולים:</Label>
                      <div className="flex flex-wrap gap-1.5 rounded-lg border p-2 min-h-[36px]">
                        {workRoles.map(wr => {
                          const excluded = (slot.exclude_role_ids || []).includes(wr.id);
                          return (
                            <button key={wr.id} type="button" onClick={() => {
                              const s = [...typeForm.required_slots];
                              const current = s[i].exclude_role_ids || [];
                              s[i].exclude_role_ids = excluded ? current.filter(id => id !== wr.id) : [...current, wr.id];
                              s[i].work_role_id = "";
                              setTypeForm({...typeForm, required_slots: s});
                            }} className={`text-xs px-2 py-1 rounded-lg border transition-colors ${excluded ? "bg-red-100 text-red-700 border-red-300" : "bg-muted hover:bg-accent border-transparent"}`}>
                              {excluded ? "✕ " : ""}{wr.name?.[lang] || wr.name?.he}
                            </button>
                          );
                        })}
                      </div>
                      {(slot.exclude_role_ids || []).length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          כל התפקידים למעט: {(slot.exclude_role_ids || []).map(id => workRoles.find(wr => wr.id === id)?.name?.[lang] || workRoles.find(wr => wr.id === id)?.name?.he || id).join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pre-Mission Events — collapsible */}
            {!showPreMission && typeForm.pre_mission_events.length === 0 ? (
              <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground border border-dashed rounded-lg p-3 hover:bg-muted/50 transition-colors text-start"
                onClick={() => { setShowPreMission(true); setTypeForm({...typeForm, pre_mission_events: [...typeForm.pre_mission_events, { offset_minutes: -30, label_he: "", label_en: "", location_he: "" }]}); }}>
                + הוסף אירועים לפני משימה (תדריך, בדיקת ציוד...)
              </button>
            ) : (
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
                <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end p-2 bg-muted/30 rounded">
                  <div><Label className="text-xs">דקות לפני</Label><Input type="number" value={Math.abs(evt.offset_minutes)} onChange={e => { const arr = [...typeForm.pre_mission_events]; arr[i].offset_minutes = -Math.abs(Number(e.target.value)); setTypeForm({...typeForm, pre_mission_events: arr}); }} /></div>
                  <div><Label className="text-xs">שם</Label><Input value={evt.label_he} onChange={e => { const arr = [...typeForm.pre_mission_events]; arr[i].label_he = e.target.value; setTypeForm({...typeForm, pre_mission_events: arr}); }} /></div>
                  <div><Label className="text-xs">מיקום</Label><Input value={evt.location_he} onChange={e => { const arr = [...typeForm.pre_mission_events]; arr[i].location_he = e.target.value; setTypeForm({...typeForm, pre_mission_events: arr}); }} /></div>
                  <Button size="sm" variant="ghost" onClick={() => setTypeForm({...typeForm, pre_mission_events: typeForm.pre_mission_events.filter((_, j) => j !== i)})}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
            )}

            {/* Timeline Items — collapsible */}
            {!showTimeline && typeForm.timeline_items.length === 0 ? (
              <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground border border-dashed rounded-lg p-3 hover:bg-muted/50 transition-colors text-start"
                onClick={() => { setShowTimeline(true); setTypeForm({...typeForm, timeline_items: [...typeForm.timeline_items, { item_id: `t1`, offset_minutes: 30, label_he: "", label_en: "", time_mode: "relative" as const, exact_time: "08:00" }]}); }}>
                + הוסף פריטי ציר זמן (ארוחה, החלפת משמרת...)
              </button>
            ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label className="text-base font-semibold">פריטי ציר זמן</Label>
                  <HelpTooltip
                    title={{ he: "ציר זמן — מה זה?", en: "Mission timeline — what is it?" }}
                    content={{ he: "ציר זמן מגדיר אירועים שקורים במהלך המשימה.\nהאירועים מוצגים לחיילים בסדר כרונולוגי.\n\nניתן להגדיר כל פריט כ:\n• זמן יחסי — X דקות אחרי תחילת המשימה\n• שעה מדויקת — למשל 12:00\n\nדוגמאות: ארוחה, החלפת משמרת, בדיקת ציוד, סיור.", en: "Timeline items are events during the mission, shown to soldiers chronologically." }}
                    examples={[
                      { he: "זמן יחסי: 60 דקות אחרי התחלה — ארוחת צהריים", en: "Relative: 60 min after start — lunch" },
                      { he: "שעה מדויקת: 12:00 — החלפת משמרת", en: "Exact: 12:00 — shift change" },
                    ]}
                    mode="popover"
                    size="lg"
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                    {ti.time_mode === "relative" ? (
                      <div><Label className="text-xs">דקות אחרי התחלה</Label><Input type="number" value={ti.offset_minutes} onChange={e => { const arr = [...typeForm.timeline_items]; arr[i].offset_minutes = Number(e.target.value); setTypeForm({...typeForm, timeline_items: arr}); }} /></div>
                    ) : (
                      <div><Label className="text-xs">שעה מדויקת</Label><Input type="time" value={ti.exact_time} onChange={e => { const arr = [...typeForm.timeline_items]; arr[i].exact_time = e.target.value; setTypeForm({...typeForm, timeline_items: arr}); }} /></div>
                    )}
                    <div><Label className="text-xs">שם (עב)</Label><Input value={ti.label_he} onChange={e => { const arr = [...typeForm.timeline_items]; arr[i].label_he = e.target.value; setTypeForm({...typeForm, timeline_items: arr}); }} /></div>
                    {showEnglishFields && <div><Label className="text-xs">שם (en)</Label><Input value={ti.label_en} onChange={e => { const arr = [...typeForm.timeline_items]; arr[i].label_en = e.target.value; setTypeForm({...typeForm, timeline_items: arr}); }} /></div>}
                    <Button size="sm" variant="ghost" onClick={() => setTypeForm({...typeForm, timeline_items: typeForm.timeline_items.filter((_, j) => j !== i)})}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            )}

            {/* Post-Mission Rule */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base font-semibold">🔄 משימת המשך</span>
                <span className="text-xs text-muted-foreground">(אופציונלי)</span>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={!!typeForm.post_mission_rule}
                  onChange={e => {
                    if (e.target.checked) {
                      setTypeForm({
                        ...typeForm,
                        post_mission_rule: {
                          auto_transition_to_mission_type_id: missionTypes[0]?.id || "",
                          auto_assign_same_crew: true,
                          condition: "always",
                        },
                      });
                    } else {
                      setTypeForm({ ...typeForm, post_mission_rule: null });
                    }
                  }}
                  className="rounded accent-primary-500"
                />
                <div>
                  <span className="font-medium">הפעל משימת המשך אוטומטית</span>
                  <p className="text-xs text-muted-foreground">בסיום משימה מסוג זה — תיווצר משימת המשך אוטומטית</p>
                </div>
              </label>
              {typeForm.post_mission_rule && (
                <div className="space-y-3 ms-4 animate-in slide-in-from-top-1 border-s-2 border-primary-200 ps-4">
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      🔄 לאחר סיום המשימה, תיווצר אוטומטית משימת המשך{typeForm.post_mission_rule.auto_transition_to_mission_type_id ? ` מסוג "${missionTypes.find(mt => mt.id === typeForm.post_mission_rule.auto_transition_to_mission_type_id)?.name?.[lang] || missionTypes.find(mt => mt.id === typeForm.post_mission_rule.auto_transition_to_mission_type_id)?.name?.he || ""}"` : ""} עם אותו צוות.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">סוג משימת המשך</Label>
                    <Select
                      value={typeForm.post_mission_rule.auto_transition_to_mission_type_id || ""}
                      onChange={e => setTypeForm({
                        ...typeForm,
                        post_mission_rule: { ...typeForm.post_mission_rule, auto_transition_to_mission_type_id: e.target.value },
                      })}
                    >
                      <option value="">בחר סוג משימה...</option>
                      {missionTypes.filter(mt => mt.id !== editingTypeId).map(mt => (
                        <option key={mt.id} value={mt.id}>
                          {mt.icon || "📋"} {mt.name?.[lang] || mt.name?.he}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={typeForm.post_mission_rule.auto_assign_same_crew ?? true}
                      onChange={e => setTypeForm({
                        ...typeForm,
                        post_mission_rule: { ...typeForm.post_mission_rule, auto_assign_same_crew: e.target.checked },
                      })}
                      className="rounded accent-primary-500"
                    />
                    <div>
                      <span className="font-medium">👥 העתק את אותו צוות</span>
                      <p className="text-xs text-muted-foreground">אותם חיילים ישובצו אוטומטית למשימת ההמשך</p>
                    </div>
                  </label>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">תנאי</Label>
                    <Select
                      value={typeForm.post_mission_rule.condition || "always"}
                      onChange={e => setTypeForm({
                        ...typeForm,
                        post_mission_rule: { ...typeForm.post_mission_rule, condition: e.target.value },
                      })}
                    >
                      <option value="always">תמיד</option>
                      <option value="if_not_activated">רק אם לא הוקפצה</option>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {typeForm.post_mission_rule.condition === "if_not_activated"
                        ? "משימת ההמשך תיווצר רק אם המשימה הנוכחית לא הופעלה (רלוונטי לכוננות)"
                        : "משימת ההמשך תיווצר תמיד בסיום המשימה"}
                    </p>
                  </div>
                </div>
              )}
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
        <DialogContent className="max-w-[95vw] sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTemplateId ? "עריכת תבנית" : t("template.title")}</DialogTitle></DialogHeader>
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
                <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end p-2 bg-muted/30 rounded">
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

      {/* Assign Soldier — bottom sheet on mobile */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[85vh] overflow-y-auto mobile-bottom-sheet">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
        <DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>תוצאות שיבוץ אוטומטי</DialogTitle></DialogHeader>
          {autoAssignResults && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
                      <span>
                        {a.employee_name
                          ? `${a.employee_name} → ${a.mission_name}`
                          : `⚠️ ${a.mission_name} — ${a.reason || "לא שובץ"}`}
                        {a.slot_id && (() => {
                          // Resolve slot label from mission type
                          const mt = missionTypes.find((t: any) => {
                            const m = missions.find((m2: any) => m2.id === a.mission_id);
                            return m && t.id === m.mission_type_id;
                          });
                          const sl = mt?.required_slots?.find((s: any) => s.slot_id === a.slot_id);
                          const label = sl?.label?.[lang] || sl?.label?.he || a.slot_id;
                          return ` (${label})`;
                        })()}
                      </span>
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
      <Dialog open={!!deleteTemplateTarget} onOpenChange={() => { setDeleteTemplateTarget(null); setDeleteTemplateMode("none"); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>מחיקת תבנית</DialogTitle></DialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm">האם למחוק את התבנית "{deleteTemplateTarget?.name}"?</p>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2 p-2 rounded border hover:bg-muted cursor-pointer">
                <input type="radio" name="deleteMode" value="none" checked={deleteTemplateMode === "none"} onChange={() => setDeleteTemplateMode("none")} />
                <span>🗑️ מחק רק את התבנית (משימות קיימות יישארו)</span>
              </label>
              <label className="flex items-center gap-2 p-2 rounded border hover:bg-muted cursor-pointer">
                <input type="radio" name="deleteMode" value="future" checked={deleteTemplateMode === "future"} onChange={() => setDeleteTemplateMode("future")} />
                <span>📅 מחק תבנית + משימות עתידיות שנוצרו ממנה</span>
              </label>
              <label className="flex items-center gap-2 p-2 rounded border hover:bg-muted cursor-pointer">
                <input type="radio" name="deleteMode" value="all" checked={deleteTemplateMode === "all"} onChange={() => setDeleteTemplateMode("all")} />
                <span>⚠️ מחק תבנית + כל המשימות שנוצרו ממנה</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTemplateTarget(null); setDeleteTemplateMode("none"); }}>ביטול</Button>
            <Button variant="destructive" onClick={() => deleteTemplateTarget && deleteTemplate(deleteTemplateTarget)}>מחק</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Soldiers Wizard — Multi-Step — bottom sheet on mobile */}
      <Dialog open={showImportWizard} onOpenChange={setShowImportWizard}>
        <DialogContent className="max-w-[95vw] sm:max-w-[650px] max-h-[85vh] overflow-y-auto mobile-bottom-sheet">
          <DialogHeader>
            <DialogTitle>הוסף חיילים ללוח עבודה</DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-2 pt-2">
              {[1, 2, 3].map(step => (
                <div key={step} className="flex items-center gap-1.5">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    importWizardStep === step ? "bg-primary-500 text-white" : importWizardStep > step ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                  }`}>{importWizardStep > step ? "✓" : step}</div>
                  <span className={`text-xs ${importWizardStep === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {step === 1 ? "שיטה" : step === 2 ? "בחירה" : "אישור"}
                  </span>
                  {step < 3 && <div className={`w-8 h-0.5 ${importWizardStep > step ? "bg-green-500" : "bg-muted"}`} />}
                </div>
              ))}
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Step 1: Choose method */}
            {importWizardStep === 1 && (
              <div className="grid gap-3">
                {[
                  { key: "list" as const, icon: "👥", title: "מרשימת חיילים", desc: "בחר חיילים מהרשימה הקיימת" },
                  { key: "previous" as const, icon: "📋", title: "מלוח קודם", desc: "העתק חיילים מלוח עבודה אחר" },
                  { key: "csv" as const, icon: "📄", title: "ייבוא CSV", desc: "העלה קובץ CSV עם מספרי חיילים" },
                ].map(m => (
                  <button
                    key={m.key}
                    onClick={() => { setImportMethod(m.key); setImportWizardStep(2); }}
                    className={`flex items-center gap-4 rounded-xl border-2 p-4 text-start transition-all hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/10 ${
                      importMethod === m.key ? "border-primary-500 bg-primary-50 dark:bg-primary-900/10" : "border-muted"
                    }`}
                  >
                    <span className="text-3xl">{m.icon}</span>
                    <div>
                      <p className="font-semibold">{m.title}</p>
                      <p className="text-sm text-muted-foreground">{m.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Step 2a: From employee list */}
            {importWizardStep === 2 && importMethod === "list" && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="חיפוש חייל..."
                    value={importEmployeeSearch}
                    onChange={e => setImportEmployeeSearch(e.target.value)}
                    className="ps-9"
                  />
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{importSelectedEmployees.size} נבחרו</span>
                  <div className="flex gap-2">
                    <button className="text-primary-600 hover:underline text-xs" onClick={() => {
                      const all = new Set(employees.map((e: any) => e.id));
                      setImportSelectedEmployees(all);
                    }}>בחר הכל</button>
                    <button className="text-xs hover:underline" onClick={() => setImportSelectedEmployees(new Set())}>נקה</button>
                  </div>
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-lg p-2">
                  {employees
                    .filter((e: any) => {
                      if (!importEmployeeSearch) return true;
                      const q = importEmployeeSearch.toLowerCase();
                      return e.full_name?.toLowerCase().includes(q) || e.employee_number?.toLowerCase().includes(q);
                    })
                    .map((emp: any) => {
                      const checked = importSelectedEmployees.has(emp.id);
                      return (
                        <label key={emp.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${checked ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-muted/50"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = new Set(importSelectedEmployees);
                              if (checked) next.delete(emp.id); else next.add(emp.id);
                              setImportSelectedEmployees(next);
                            }}
                            className="rounded h-4 w-4"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{emp.full_name}</span>
                            <span className="text-xs text-muted-foreground ms-2">({emp.employee_number})</span>
                          </div>
                          <div className="flex gap-1">
                            {emp.work_roles?.map((r: any) => (
                              <Badge key={r.id} className="text-[10px]" style={{ backgroundColor: r.color + "20", color: r.color }}>
                                {r.name?.[lang] || r.name?.he}
                              </Badge>
                            ))}
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Step 2b: From previous window */}
            {importWizardStep === 2 && importMethod === "previous" && (
              <div className="space-y-3">
                <Label>בחר לוח עבודה קודם</Label>
                <Select value={importPreviousWindowId} onChange={e => setImportPreviousWindowId(e.target.value)} className="min-h-[44px]">
                  <option value="">בחר לוח...</option>
                  {windows.filter(w => w.id !== selectedWindow?.id).map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.start_date} → {w.end_date})</option>
                  ))}
                </Select>
                {importPreviousWindowId && (
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-sm">
                    <p className="text-blue-800 dark:text-blue-200">
                      כל החיילים מהלוח "{windows.find(w => w.id === importPreviousWindowId)?.name}" יועתקו ללוח הנוכחי.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 2c: CSV upload */}
            {importWizardStep === 2 && importMethod === "csv" && (
              <div className="space-y-3">
                <div className="rounded-xl border-2 border-dashed p-8 text-center">
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm font-medium">העלה קובץ CSV</p>
                  <p className="text-xs text-muted-foreground mt-1">הקובץ חייב לכלול עמודת "מספר אישי"</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="me-1 h-4 w-4" />בחר קובץ
                  </Button>
                </div>
                {importPreviewData.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Badge variant="success">{importPreviewData.length} שורות תקינות</Badge>
                      {importFileErrors.length > 0 && <Badge variant="destructive">{importFileErrors.length} שגיאות</Badge>}
                    </div>
                    {importFileErrors.length > 0 && (
                      <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
                        {importFileErrors.map((err: any, i: number) => <div key={i}>שורה {err.row}: {err.error}</div>)}
                      </div>
                    )}
                    <div className="overflow-x-auto max-h-[200px] border rounded-lg">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/50">
                          <th className="px-3 py-2 text-start">מספר אישי</th>
                          <th className="px-3 py-2 text-start">שם</th>
                        </tr></thead>
                        <tbody>
                          {importPreviewData.slice(0, 30).map((r: any, i: number) => (
                            <tr key={i} className="border-b"><td className="px-3 py-2 font-mono">{r.employee_number}</td><td className="px-3 py-2">{r.full_name || "—"}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Preview & Confirm */}
            {importWizardStep === 3 && (
              <div className="space-y-3">
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 text-center">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {importMethod === "list" ? importSelectedEmployees.size : importMethod === "csv" ? importPreviewData.length : "כל"} חיילים
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">ייתווספו ללוח "{selectedWindow?.name}"</p>
                </div>
                {importMethod === "list" && (
                  <div className="max-h-[250px] overflow-y-auto space-y-1">
                    {employees.filter((e: any) => importSelectedEmployees.has(e.id)).map((emp: any) => (
                      <div key={emp.id} className="flex items-center justify-between rounded bg-muted/30 px-3 py-2 text-sm">
                        <span className="font-medium">{emp.full_name}</span>
                        <span className="text-xs text-muted-foreground">{emp.employee_number}</span>
                      </div>
                    ))}
                  </div>
                )}
                {importMethod === "csv" && (
                  <div className="text-sm text-muted-foreground text-center">
                    {importPreviewData.length} חיילים מקובץ CSV
                  </div>
                )}
                {importMethod === "previous" && (
                  <div className="text-sm text-muted-foreground text-center">
                    כל החיילים מלוח "{windows.find(w => w.id === importPreviousWindowId)?.name}"
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {importWizardStep > 1 && (
              <Button variant="outline" onClick={() => setImportWizardStep(s => s - 1)}>חזרה</Button>
            )}
            <Button variant="outline" onClick={() => setShowImportWizard(false)}>ביטול</Button>
            {importWizardStep === 2 && (
              <Button
                onClick={() => setImportWizardStep(3)}
                disabled={
                  (importMethod === "list" && importSelectedEmployees.size === 0) ||
                  (importMethod === "previous" && !importPreviousWindowId) ||
                  (importMethod === "csv" && importPreviewData.length === 0)
                }
              >
                הבא →
              </Button>
            )}
            {importWizardStep === 3 && (
              <Button
                onClick={async () => {
                  if (!selectedWindow) return;
                  setImportLoading(true);
                  try {
                    if (importMethod === "list") {
                      const ids = Array.from(importSelectedEmployees);
                      await api.post(tenantApi(`/schedule-windows/${selectedWindow.id}/employees`), { employee_ids: ids });
                      toast("success", `נוספו ${ids.length} חיילים ללוח`);
                    } else if (importMethod === "previous") {
                      const prevEmps = await api.get(tenantApi(`/schedule-windows/${importPreviousWindowId}/employees`));
                      const ids = (prevEmps.data || []).map((e: any) => e.id || e.employee_id);
                      if (ids.length > 0) {
                        await api.post(tenantApi(`/schedule-windows/${selectedWindow.id}/employees`), { employee_ids: ids });
                      }
                      toast("success", `הועתקו ${ids.length} חיילים מהלוח הקודם`);
                    } else if (importMethod === "csv") {
                      await executeWindowImport();
                    }
                    setShowImportWizard(false);
                    loadWindowData(selectedWindow.id);
                  } catch (e: any) {
                    toast("error", getErrorMessage(e, "שגיאה בייבוא חיילים"));
                  } finally {
                    setImportLoading(false);
                  }
                }}
                disabled={importLoading}
              >
                {importLoading ? (
                  <><div className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin me-2" />מייבא...</>
                ) : (
                  <>✓ אשר והוסף</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === INTERACTIVE BOARD: Context Menu === */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[200px] rounded-xl border bg-background shadow-xl animate-in fade-in zoom-in-95 py-1"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 220),
            top: Math.min(contextMenu.y, window.innerHeight - 300),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Soldier context menu */}
          {contextMenu.type === "soldier" && (
            <>
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                {contextMenu.employeeName}
              </div>
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors text-start"
                onClick={() => {
                  setReplaceTarget({
                    missionId: contextMenu.missionId,
                    assignmentId: contextMenu.assignmentId!,
                    slotId: contextMenu.slotId!,
                    workRoleId: contextMenu.workRoleId!,
                    employeeName: contextMenu.employeeName!,
                    employeeId: contextMenu.employeeId!,
                  });
                  loadEligibleSoldiers(contextMenu.missionId, contextMenu.slotId!);
                  setShowReplaceDialog(true);
                  closeContextMenu();
                }}
              >
                <RefreshCw className="h-4 w-4" />החלף חייל
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors text-start text-red-600"
                onClick={() => {
                  if (window.confirm(`להסיר את ${contextMenu.employeeName} מהמשימה?`)) {
                    removeAssignment(contextMenu.missionId, contextMenu.assignmentId!);
                  }
                  closeContextMenu();
                }}
              >
                <Trash2 className="h-4 w-4" />הסר מהמשימה
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors text-start"
                onClick={() => {
                  autoFindReplacement(
                    contextMenu.missionId,
                    contextMenu.assignmentId!,
                    contextMenu.slotId!,
                    contextMenu.workRoleId!,
                    contextMenu.employeeName!,
                  );
                  closeContextMenu();
                }}
              >
                <Wand2 className="h-4 w-4" />מצא מחליף אוטומטי
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors text-start"
                onClick={() => {
                  setSwapTarget({
                    missionId: contextMenu.missionId,
                    employeeId: contextMenu.employeeId!,
                    employeeName: contextMenu.employeeName!,
                  });
                  setSwapForm({ target_employee_id: "", reason: "" });
                  setShowSwapDialog(true);
                  closeContextMenu();
                }}
              >
                <ArrowRightLeft className="h-4 w-4" />בקש החלפה
              </button>
            </>
          )}

          {/* Empty slot context menu */}
          {contextMenu.type === "empty_slot" && (
            <>
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                משבצת פנויה
              </div>
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors text-start"
                onClick={() => {
                  setAssignMissionId(contextMenu.missionId);
                  setAssignForm({
                    employee_id: "",
                    work_role_id: contextMenu.workRoleId || workRoles[0]?.id || "",
                    slot_id: contextMenu.slotId || "default",
                  });
                  setShowAssignModal(true);
                  closeContextMenu();
                }}
              >
                <UserPlus className="h-4 w-4" />שבץ חייל
              </button>
            </>
          )}

          {/* Mission context menu */}
          {contextMenu.type === "mission" && (
            <>
              {(() => {
                const ctxMission = missions.find(m2 => m2.id === contextMenu.missionId);
                return (
                  <>
                    <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                      {ctxMission?.name || "משימה"}
                    </div>
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors text-start"
                      onClick={() => {
                        setExpandedMission(contextMenu.missionId);
                        closeContextMenu();
                      }}
                    >
                      <Eye className="h-4 w-4" />פרטי משימה
                    </button>
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors text-start"
                      onClick={() => {
                        setAssignMissionId(contextMenu.missionId);
                        setAssignForm({ employee_id: "", work_role_id: workRoles[0]?.id || "", slot_id: "default" });
                        setShowAssignModal(true);
                        closeContextMenu();
                      }}
                    >
                      <Users className="h-4 w-4" />שבץ חיילים
                    </button>
                    {(ctxMission?.status === "draft" || ctxMission?.status === "proposed") && (
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors text-start text-green-600"
                        onClick={() => {
                          missionAction(contextMenu.missionId, "approve");
                          closeContextMenu();
                        }}
                      >
                        <Check className="h-4 w-4" />אשר משימה
                      </button>
                    )}
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors text-start text-red-600"
                      onClick={() => {
                        missionAction(contextMenu.missionId, "cancel");
                        closeContextMenu();
                      }}
                    >
                      <X className="h-4 w-4" />בטל משימה
                    </button>
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* === Replace Soldier Dialog === */}
      <Dialog open={showReplaceDialog} onOpenChange={(open) => { setShowReplaceDialog(open); if (!open) setReplaceTarget(null); }}>
        <DialogContent className="max-w-[550px] max-h-[85vh] overflow-y-auto mobile-fullscreen">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              החלף חייל — {replaceTarget?.employeeName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">מחליף את:</span>{" "}
              <span className="font-medium">{replaceTarget?.employeeName}</span>{" "}
              <span className="text-muted-foreground">במשבצת</span>{" "}
              <Badge className="text-xs">{replaceTarget?.slotId}</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="חיפוש חייל..."
                  value={replaceSearch}
                  onChange={e => setReplaceSearch(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>
            </div>
            <div className="max-h-[350px] overflow-y-auto space-y-1 border rounded-lg p-2">
              {eligibleLoading ? (
                <div className="text-center py-8 text-sm text-muted-foreground">טוען חיילים מתאימים...</div>
              ) : (
                (() => {
                  const filtered = eligibleSoldiers.filter((s: any) => {
                    if (!replaceSearch) return true;
                    const q = replaceSearch.toLowerCase();
                    return (s.full_name || s.employee_name || "").toLowerCase().includes(q) ||
                           (s.employee_number || "").toLowerCase().includes(q);
                  });
                  if (filtered.length === 0) return <div className="text-center py-8 text-sm text-muted-foreground">לא נמצאו חיילים מתאימים</div>;
                  return filtered.map((s: any) => {
                    const sid = s.id || s.employee_id;
                    if (sid === replaceTarget?.employeeId) return null;
                    return (
                      <button
                        key={sid}
                        className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-start"
                        onClick={() => {
                          if (replaceTarget) {
                            replaceAssignment(replaceTarget.missionId, replaceTarget.assignmentId, sid, replaceTarget.slotId, replaceTarget.workRoleId);
                          }
                        }}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{typeof s.employee_name === "object" ? (s.employee_name?.he || s.employee_name?.en || "") : (s.full_name || s.employee_name || "")}</span>
                          <div className="flex flex-wrap gap-1">
                            {s.score != null && <Badge className="text-[10px] bg-blue-100 text-blue-700">ציון: {s.score}</Badge>}
                            {s.rest_hours != null && <Badge className="text-[10px] bg-gray-100 text-gray-600">מנוחה: {s.rest_hours}ש</Badge>}
                            {s.has_partner_preference && <Badge className="text-[10px] bg-green-100 text-green-700">✓ חבר מועדף</Badge>}
                            {s.warnings?.length > 0 && <Badge className="text-[10px] bg-yellow-100 text-yellow-700">⚠️ {s.warnings.length} אזהרות</Badge>}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="min-h-[36px] shrink-0">
                          בחר
                        </Button>
                      </button>
                    );
                  });
                })()
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReplaceDialog(false); setReplaceTarget(null); }}>ביטול</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Swap Request Dialog === */}
      <Dialog open={showSwapDialog} onOpenChange={(open) => { setShowSwapDialog(open); if (!open) setSwapTarget(null); }}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              בקשת החלפה — {swapTarget?.employeeName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">חייל מבוקש להחלפה</Label>
              <Select
                value={swapForm.target_employee_id}
                onChange={e => setSwapForm({ ...swapForm, target_employee_id: e.target.value })}
                className="min-h-[44px]"
              >
                <option value="">בחר חייל...</option>
                {(windowEmployees.length > 0 ? windowEmployees : employees)
                  .filter((e: any) => (e.id || e.employee_id) !== swapTarget?.employeeId)
                  .map((emp: any) => (
                    <option key={emp.id || emp.employee_id} value={emp.id || emp.employee_id}>
                      {emp.full_name} ({emp.employee_number})
                    </option>
                  ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">סיבה (אופציונלי)</Label>
              <textarea
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                value={swapForm.reason}
                onChange={e => setSwapForm({ ...swapForm, reason: e.target.value })}
                placeholder="סיבת בקשת ההחלפה..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSwapDialog(false); setSwapTarget(null); }}>ביטול</Button>
            <Button onClick={submitSwapRequest} disabled={!swapForm.target_employee_id}>שלח בקשה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Daily Board Templates Modal === */}
      <Dialog open={showDailyBoardTemplatesModal} onOpenChange={setShowDailyBoardTemplatesModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5" />
              תבניות לוח
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {dailyBoardTemplates.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <LayoutTemplate className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p className="text-muted-foreground">אין תבניות לוח עדיין</p>
                <p className="text-sm text-muted-foreground">צור תבנית לוח בהגדרות כדי לייצר לוחות יומיים אוטומטית</p>
                <Button onClick={() => { setShowDailyBoardTemplatesModal(false); navigate("/settings?tab=board-template"); }}>
                  <LayoutTemplate className="me-1 h-4 w-4" />עבור לעורך תבניות לוח
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{dailyBoardTemplates.length} תבניות זמינות. בחר תבנית לייצור לוח ליום {boardDate}:</p>
                <div className="space-y-2">
                  {dailyBoardTemplates.map((tmpl: any) => (
                    <div key={tmpl.id} className="flex items-center justify-between rounded-xl border p-4 hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="font-semibold">{tmpl.name}</p>
                        {tmpl.description && <p className="text-sm text-muted-foreground">{tmpl.description}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setShowDailyBoardTemplatesModal(false); navigate("/settings?tab=board-template"); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" onClick={async () => {
                          try {
                            toast("info", `מייצר לוח מתבנית "${tmpl.name}"...`);
                            await api.post(tenantApi(`/daily-board-templates/${tmpl.id}/generate`), {
                              date_from: boardDate, date_to: boardDate,
                            });
                            toast("success", `לוח יומי נוצר בהצלחה`);
                            setShowDailyBoardTemplatesModal(false);
                            if (selectedWindow) loadWindowData(selectedWindow.id);
                          } catch (err: any) {
                            toast("error", err?.response?.data?.detail || "שגיאה ביצירת לוח");
                          }
                        }}>
                          <Wand2 className="me-1 h-3.5 w-3.5" />צור לוח
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={() => { setShowDailyBoardTemplatesModal(false); navigate("/settings?tab=board-template"); }}>
                    <Plus className="me-1 h-4 w-4" />הוסף תבנית חדשה
                  </Button>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDailyBoardTemplatesModal(false)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
