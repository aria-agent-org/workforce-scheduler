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
  Pencil, Download, Upload, ArrowLeft, Eye, AlertTriangle, Check,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";

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

  // Form data
  const [windowForm, setWindowForm] = useState({ name: "", start_date: "", end_date: "" });
  const [missionForm, setMissionForm] = useState({
    schedule_window_id: "", mission_type_id: "", name: "", date: "", start_time: "08:00", end_time: "16:00",
  });
  const [typeForm, setTypeForm] = useState({
    name_he: "", name_en: "", color: "#3b82f6", icon: "📋", duration_hours: 8, is_standby: false,
    required_slots: [] as Array<{ slot_id: string; work_role_id: string; count: number; label_he: string; label_en: string }>,
    pre_mission_events: [] as Array<{ offset_minutes: number; label_he: string; label_en: string; location_he: string }>,
    post_mission_rule: null as any,
    timeline_items: [] as Array<{ item_id: string; offset_minutes: number; label_he: string; label_en: string }>,
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
        offset_minutes: t.offset_minutes,
        label: { he: t.label_he, en: t.label_en },
      }));
      const payload = {
        name: { he: typeForm.name_he, en: typeForm.name_en },
        color: typeForm.color,
        icon: typeForm.icon,
        duration_hours: typeForm.duration_hours,
        is_standby: typeForm.is_standby,
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
        item_id: t.item_id, offset_minutes: t.offset_minutes,
        label_he: t.label?.he || "", label_en: t.label?.en || "",
      })),
    });
    setShowTypeModal(true);
  };

  const openCreateType = () => {
    setEditingTypeId(null);
    setTypeForm({
      name_he: "", name_en: "", color: "#3b82f6", icon: "📋", duration_hours: 8, is_standby: false,
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
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
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
  const assignEmployee = async () => {
    try {
      const res = await api.post(tenantApi(`/missions/${assignMissionId}/assignments`), assignForm);
      if (res.data.conflicts_detected?.length > 0) {
        toast("warning", `חייל שובץ עם ${res.data.conflicts_detected.length} התנגשויות`);
      } else {
        toast("success", "חייל שובץ בהצלחה");
      }
      setShowAssignModal(false);
      if (selectedWindow) loadWindowData(selectedWindow.id);
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
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
                setMissionForm({ ...missionForm, schedule_window_id: selectedWindow.id });
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
            <Card><CardContent className="p-8 text-center text-muted-foreground">אין לוחות עבודה. צור את הראשון!</CardContent></Card>
          ) : windows.map((w) => (
            <Card key={w.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openWindowBoard(w)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{w.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {w.start_date} → {w.end_date} · <Users className="inline h-3 w-3" /> {w.employee_count} חיילים
                    </p>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Badge className={statusColors[w.status] || ""}>{t(`status.${w.status}`)}</Badge>
                    <div className="flex gap-1">
                      {w.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => windowAction(w.id, "activate")} title="הפעל">
                          <Play className="h-3 w-3" />
                        </Button>
                      )}
                      {w.status === "active" && (
                        <Button size="sm" variant="outline" onClick={() => windowAction(w.id, "pause")} title="השהה">
                          <Pause className="h-3 w-3" />
                        </Button>
                      )}
                      {w.status === "paused" && (
                        <Button size="sm" variant="outline" onClick={() => windowAction(w.id, "resume")} title="חדש">
                          <Play className="h-3 w-3" />
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => windowAction(w.id, "archive")} title="ארכיון">
                        <Archive className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* === WINDOW BOARD TAB === */}
      {activeTab === "board" && selectedWindow && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => { setActiveTab("windows"); setSelectedWindow(null); }}>
              <ArrowLeft className="me-1 h-4 w-4" />חזרה ללוחות
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
            <Card><CardContent className="p-8 text-center text-muted-foreground">אין משימות בטווח זה. צור משימה או השתמש בתבנית.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {boardMissions.map((m) => (
                <Card key={m.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between cursor-pointer"
                         onClick={() => setExpandedMission(expandedMission === m.id ? null : m.id)}>
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-8 rounded-full" style={{ backgroundColor: missionTypes.find(mt => mt.id === m.mission_type_id)?.color || "#3b82f6" }} />
                        <div>
                          <p className="font-medium">{m.name}</p>
                          <p className="text-xs text-muted-foreground">
                            📅 {m.date} · ⏰ {m.start_time?.slice(0, 5)}-{m.end_time?.slice(0, 5)}
                            {m.assignments?.length > 0 && ` · 👥 ${m.assignments.length} משובצים`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={statusColors[m.status] || ""}>{t(`status.${m.status}`)}</Badge>
                        {expandedMission === m.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>
                    {expandedMission === m.id && (
                      <div className="mt-3 border-t pt-3 space-y-2">
                        <div className="flex gap-2 mb-2">
                          <Button size="sm" variant="outline" onClick={() => {
                            setAssignMissionId(m.id);
                            setAssignForm({ employee_id: "", work_role_id: workRoles[0]?.id || "", slot_id: "default" });
                            setShowAssignModal(true);
                          }}>
                            <UserPlus className="me-1 h-3 w-3" />{t("assignSoldier")}
                          </Button>
                          {m.status === "draft" && (
                            <Button size="sm" variant="outline" onClick={() => missionAction(m.id, "approve")}>
                              <Check className="me-1 h-3 w-3" />אשר
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => missionAction(m.id, "cancel")}>
                            <Trash2 className="h-3 w-3 text-red-500" />
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
              ))}
            </div>
          )}
        </div>
      )}

      {/* === MISSION TYPES TAB === */}
      {activeTab === "types" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {missionTypes.length === 0 ? (
            <Card className="col-span-full"><CardContent className="p-8 text-center text-muted-foreground">אין סוגי משימות. צור את הראשון!</CardContent></Card>
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
            <Card><CardContent className="p-8 text-center text-muted-foreground">אין תבניות. בחר לוח עבודה וצור תבנית ראשונה!</CardContent></Card>
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
            <Card key={tmpl.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{tmpl.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {tmpl.recurrence?.type === "daily" ? "יומי" : tmpl.recurrence?.type === "weekly" ? "שבועי" : "מותאם אישית"}
                    {tmpl.recurrence?.active_weeks && tmpl.recurrence.active_weeks !== "all" && ` · שבועות ${tmpl.recurrence.active_weeks === "odd" ? "אי-זוגיים" : "זוגיים"}`}
                    {tmpl.time_slots?.map((ts: any, i: number) => (
                      <span key={i}> · {ts.start}-{ts.end}</span>
                    ))}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  setGenerateForm({ template_id: tmpl.id, start_date: selectedWindow?.start_date || "", end_date: selectedWindow?.end_date || "" });
                  setShowGenerateModal(true);
                }}>
                  <Calendar className="me-1 h-3 w-3" />צור משימות
                </Button>
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
            <div className="space-y-2"><Label>שם</Label><Input value={windowForm.name} onChange={e => setWindowForm({...windowForm, name: e.target.value})} placeholder="מאי-יולי 2026" /></div>
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

      {/* Create Mission */}
      <Dialog open={showMissionModal} onOpenChange={setShowMissionModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>משימה חדשה</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>שם</Label><Input value={missionForm.name} onChange={e => setMissionForm({...missionForm, name: e.target.value})} /></div>
            <div className="space-y-2">
              <Label>סוג משימה</Label>
              <Select value={missionForm.mission_type_id} onChange={e => setMissionForm({...missionForm, mission_type_id: e.target.value})}>
                <option value="">בחר סוג</option>
                {missionTypes.map(mt => <option key={mt.id} value={mt.id}>{mt.name[lang] || mt.name.he}</option>)}
              </Select>
            </div>
            <div className="space-y-2"><Label>תאריך</Label><Input type="date" value={missionForm.date} onChange={e => setMissionForm({...missionForm, date: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>שעת התחלה</Label><Input type="time" value={missionForm.start_time} onChange={e => setMissionForm({...missionForm, start_time: e.target.value})} /></div>
              <div className="space-y-2"><Label>שעת סיום</Label><Input type="time" value={missionForm.end_time} onChange={e => setMissionForm({...missionForm, end_time: e.target.value})} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMissionModal(false)}>ביטול</Button>
            <Button onClick={createMission}>צור</Button>
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
              <div className="space-y-2"><Label>משך (שעות)</Label><Input type="number" value={typeForm.duration_hours} onChange={e => setTypeForm({...typeForm, duration_hours: Number(e.target.value)})} /></div>
              <div className="space-y-2 flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={typeForm.is_standby} onChange={e => setTypeForm({...typeForm, is_standby: e.target.checked})} className="rounded" />
                  כוננות
                </label>
              </div>
            </div>

            {/* Slot Builder */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">סלוטים נדרשים</Label>
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
                <Label className="text-base font-semibold">אירועים לפני משימה</Label>
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
                <Label className="text-base font-semibold">פריטי ציר זמן</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setTypeForm({...typeForm, timeline_items: [...typeForm.timeline_items, { item_id: `t${typeForm.timeline_items.length + 1}`, offset_minutes: 30, label_he: "", label_en: "" }]})}>
                  <Plus className="h-3 w-3 me-1" />הוסף
                </Button>
              </div>
              {typeForm.timeline_items.map((ti, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 items-end p-2 bg-muted/30 rounded">
                  <div><Label className="text-xs">דקות אחרי התחלה</Label><Input type="number" value={ti.offset_minutes} onChange={e => { const arr = [...typeForm.timeline_items]; arr[i].offset_minutes = Number(e.target.value); setTypeForm({...typeForm, timeline_items: arr}); }} /></div>
                  <div><Label className="text-xs">שם (עב)</Label><Input value={ti.label_he} onChange={e => { const arr = [...typeForm.timeline_items]; arr[i].label_he = e.target.value; setTypeForm({...typeForm, timeline_items: arr}); }} /></div>
                  <div><Label className="text-xs">שם (en)</Label><Input value={ti.label_en} onChange={e => { const arr = [...typeForm.timeline_items]; arr[i].label_en = e.target.value; setTypeForm({...typeForm, timeline_items: arr}); }} /></div>
                  <Button size="sm" variant="ghost" onClick={() => setTypeForm({...typeForm, timeline_items: typeForm.timeline_items.filter((_, j) => j !== i)})}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
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
              <Label>{t("template.recurrenceType")}</Label>
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
              <Label>{t("template.activeWeeks")}</Label>
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
        <DialogContent>
          <DialogHeader><DialogTitle>{t("assignSoldier")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("selectSoldier")}</Label>
              <Select value={assignForm.employee_id} onChange={e => setAssignForm({...assignForm, employee_id: e.target.value})}>
                <option value="">{t("selectSoldier")}</option>
                {(windowEmployees.length > 0 ? windowEmployees : employees).map((emp: any) => (
                  <option key={emp.id || emp.employee_id} value={emp.id || emp.employee_id}>
                    {emp.full_name} ({emp.employee_number})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>תפקיד</Label>
              <Select value={assignForm.work_role_id} onChange={e => setAssignForm({...assignForm, work_role_id: e.target.value})}>
                {workRoles.map(wr => <option key={wr.id} value={wr.id}>{wr.name?.[lang] || wr.name?.he}</option>)}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>סלוט</Label>
              <Input value={assignForm.slot_id} onChange={e => setAssignForm({...assignForm, slot_id: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>ביטול</Button>
            <Button onClick={assignEmployee}>שבץ</Button>
          </DialogFooter>
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
    </div>
  );
}
