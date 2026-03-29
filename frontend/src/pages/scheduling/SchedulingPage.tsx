import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar, Plus, Wand2, Send, Play, Pause, Archive, Copy,
  ChevronDown, ChevronUp, Users, Clock, Trash2, UserPlus,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";

type Tab = "windows" | "missions" | "types" | "templates";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  archived: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function SchedulingPage() {
  const { t, i18n } = useTranslation("scheduling");
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [activeTab, setActiveTab] = useState<Tab>("windows");
  const [loading, setLoading] = useState(true);

  // Data
  const [windows, setWindows] = useState<any[]>([]);
  const [missions, setMissions] = useState<any[]>([]);
  const [missionTypes, setMissionTypes] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [workRoles, setWorkRoles] = useState<any[]>([]);

  // Selected window for missions view
  const [selectedWindow, setSelectedWindow] = useState<string | null>(null);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);

  // Modals
  const [showWindowModal, setShowWindowModal] = useState(false);
  const [showMissionModal, setShowMissionModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // Form data
  const [windowForm, setWindowForm] = useState({ name: "", start_date: "", end_date: "" });
  const [missionForm, setMissionForm] = useState({
    schedule_window_id: "", mission_type_id: "", name: "", date: "", start_time: "08:00", end_time: "16:00",
  });
  const [typeForm, setTypeForm] = useState({
    name_he: "", name_en: "", color: "#3b82f6", duration_hours: 8,
    required_slots: [] as Array<{ slot_id: string; work_role_id: string; count: number; label_he: string; label_en: string }>,
  });
  const [templateForm, setTemplateForm] = useState({
    schedule_window_id: "", mission_type_id: "", name: "",
    recurrence_type: "daily", recurrence_days: [] as number[],
    time_start: "08:00", time_end: "16:00",
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

      // Load missions for first window
      if (winRes.data.length > 0) {
        const firstWin = winRes.data[0].id;
        setSelectedWindow(firstWin);
        const missRes = await api.get(tenantApi("/missions"), { params: { window_id: firstWin } });
        setMissions(missRes.data);
        const tmplRes = await api.get(tenantApi("/mission-templates"), { params: { window_id: firstWin } });
        setTemplates(tmplRes.data);
      }
    } catch (e) {
      toast("error", "שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadMissions = async (windowId: string) => {
    const [missRes, tmplRes] = await Promise.all([
      api.get(tenantApi("/missions"), { params: { window_id: windowId } }),
      api.get(tenantApi("/mission-templates"), { params: { window_id: windowId } }),
    ]);
    setMissions(missRes.data);
    setTemplates(tmplRes.data);
  };

  // === ACTIONS ===

  const createWindow = async () => {
    try {
      await api.post(tenantApi("/schedule-windows"), windowForm);
      toast("success", "לוח עבודה נוצר בהצלחה");
      setShowWindowModal(false);
      loadAll();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const windowAction = async (id: string, action: string) => {
    try {
      await api.post(tenantApi(`/schedule-windows/${id}/${action}`));
      toast("success", `פעולה בוצעה: ${action}`);
      loadAll();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const createMissionType = async () => {
    try {
      const slots = typeForm.required_slots.map((s, i) => ({
        slot_id: s.slot_id || `s${i + 1}`,
        work_role_id: s.work_role_id,
        count: s.count,
        label: { he: s.label_he, en: s.label_en },
      }));
      await api.post(tenantApi("/mission-types"), {
        name: { he: typeForm.name_he, en: typeForm.name_en },
        color: typeForm.color,
        duration_hours: typeForm.duration_hours,
        required_slots: slots,
      });
      toast("success", "סוג משימה נוצר בהצלחה");
      setShowTypeModal(false);
      loadAll();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const createMission = async () => {
    try {
      await api.post(tenantApi("/missions"), missionForm);
      toast("success", "משימה נוצרה בהצלחה");
      setShowMissionModal(false);
      if (selectedWindow) loadMissions(selectedWindow);
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const createTemplate = async () => {
    try {
      await api.post(tenantApi("/mission-templates"), {
        schedule_window_id: templateForm.schedule_window_id,
        mission_type_id: templateForm.mission_type_id,
        name: templateForm.name,
        recurrence: {
          type: templateForm.recurrence_type,
          days: templateForm.recurrence_days,
        },
        time_slots: [{ start: templateForm.time_start, end: templateForm.time_end }],
      });
      toast("success", "תבנית נוצרה בהצלחה");
      setShowTemplateModal(false);
      if (selectedWindow) loadMissions(selectedWindow);
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const assignEmployee = async () => {
    try {
      const res = await api.post(tenantApi(`/missions/${assignMissionId}/assignments`), assignForm);
      if (res.data.conflicts_detected?.length > 0) {
        toast("warning", `שיבוץ בוצע עם ${res.data.conflicts_detected.length} התנגשויות`);
      } else {
        toast("success", "עובד שובץ בהצלחה");
      }
      setShowAssignModal(false);
      if (selectedWindow) loadMissions(selectedWindow);
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const generateMissions = async () => {
    try {
      const res = await api.post(tenantApi("/missions/generate"), generateForm);
      toast("success", `נוצרו ${res.data.created} משימות`);
      setShowGenerateModal(false);
      if (selectedWindow) loadMissions(selectedWindow);
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const autoAssign = async () => {
    try {
      const res = await api.post(tenantApi("/missions/auto-assign"), null, {
        params: { window_id: selectedWindow },
      });
      toast("success", `שיבוץ אוטומטי: ${res.data.total_assigned} שיבוצים`);
      if (selectedWindow) loadMissions(selectedWindow);
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const missionAction = async (id: string, action: string) => {
    try {
      await api.post(tenantApi(`/missions/${id}/${action}`));
      toast("success", `פעולה בוצעה`);
      if (selectedWindow) loadMissions(selectedWindow);
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "windows", label: t("scheduleWindows") },
    { key: "missions", label: t("missions") },
    { key: "types", label: t("missionTypes") },
    { key: "templates", label: t("templates") },
  ];

  if (loading) return <TableSkeleton rows={6} cols={4} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex gap-2">
          {activeTab === "missions" && (
            <>
              <Button variant="outline" size="sm" onClick={autoAssign}>
                <Wand2 className="me-1 h-4 w-4" />{t("autoAssign")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                setGenerateForm({ template_id: templates[0]?.id || "", start_date: "", end_date: "" });
                setShowGenerateModal(true);
              }}>
                <Calendar className="me-1 h-4 w-4" />יצירה מתבנית
              </Button>
              <Button size="sm" onClick={() => {
                setMissionForm({ ...missionForm, schedule_window_id: selectedWindow || "" });
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
            <Button size="sm" onClick={() => {
              setTypeForm({ name_he: "", name_en: "", color: "#3b82f6", duration_hours: 8, required_slots: [] });
              setShowTypeModal(true);
            }}>
              <Plus className="me-1 h-4 w-4" />סוג משימה חדש
            </Button>
          )}
          {activeTab === "templates" && (
            <Button size="sm" onClick={() => {
              setTemplateForm({ schedule_window_id: selectedWindow || windows[0]?.id || "", mission_type_id: missionTypes[0]?.id || "", name: "", recurrence_type: "daily", recurrence_days: [], time_start: "08:00", time_end: "16:00" });
              setShowTemplateModal(true);
            }}>
              <Plus className="me-1 h-4 w-4" />תבנית חדשה
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`rounded-md px-4 py-2 text-sm transition-colors ${
              activeTab === key
                ? "bg-primary-500 text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* === SCHEDULE WINDOWS TAB === */}
      {activeTab === "windows" && (
        <div className="grid gap-4">
          {windows.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">אין לוחות עבודה. צור את הראשון!</CardContent></Card>
          ) : windows.map((w) => (
            <Card key={w.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{w.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {w.start_date} → {w.end_date} · <Users className="inline h-3 w-3" /> {w.employee_count} עובדים
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[w.status] || ""}>{t(`status.${w.status}`)}</Badge>
                    <div className="flex gap-1">
                      {w.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => windowAction(w.id, "activate")}>
                          <Play className="h-3 w-3" />
                        </Button>
                      )}
                      {w.status === "active" && (
                        <Button size="sm" variant="outline" onClick={() => windowAction(w.id, "pause")}>
                          <Pause className="h-3 w-3" />
                        </Button>
                      )}
                      {w.status === "paused" && (
                        <Button size="sm" variant="outline" onClick={() => windowAction(w.id, "resume")}>
                          <Play className="h-3 w-3" />
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => windowAction(w.id, "archive")}>
                        <Archive className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedWindow(w.id); setActiveTab("missions"); loadMissions(w.id); }}>
                        <Calendar className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* === MISSIONS TAB === */}
      {activeTab === "missions" && (
        <div className="space-y-4">
          {/* Window selector */}
          <div className="flex items-center gap-2">
            <Label>לוח עבודה:</Label>
            <Select value={selectedWindow || ""} onChange={(e) => { setSelectedWindow(e.target.value); loadMissions(e.target.value); }}>
              {windows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </div>

          {missions.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">אין משימות בלוח זה. צור משימה או השתמש בתבנית.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {missions.map((m) => (
                <Card key={m.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between cursor-pointer"
                         onClick={() => setExpandedMission(expandedMission === m.id ? null : m.id)}>
                      <div className="flex items-center gap-3">
                        {m.mission_type_name && (
                          <div className="w-2 h-8 rounded-full" style={{ backgroundColor: "#3b82f6" }} />
                        )}
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
                            setAssignForm({ employee_id: employees[0]?.id || "", work_role_id: workRoles[0]?.id || "", slot_id: "default" });
                            setShowAssignModal(true);
                          }}>
                            <UserPlus className="me-1 h-3 w-3" />שבץ עובד
                          </Button>
                          {m.status === "draft" && (
                            <Button size="sm" variant="outline" onClick={() => missionAction(m.id, "approve")}>אשר</Button>
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
                                    <Badge variant="warning">⚠ {a.conflicts_detected.length} התנגשויות</Badge>
                                  )}
                                  <Badge variant={a.status === "assigned" ? "success" : "default"}>{a.status}</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">אין שיבוצים עדיין</p>
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
          {missionTypes.map((mt) => (
            <Card key={mt.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-4 w-4 rounded-full" style={{ backgroundColor: mt.color || "#3b82f6" }} />
                  <h3 className="font-semibold">{mt.name[lang] || mt.name.he}</h3>
                </div>
                {mt.duration_hours && (
                  <p className="text-sm text-muted-foreground"><Clock className="inline h-3 w-3" /> {mt.duration_hours} שעות</p>
                )}
                {mt.required_slots?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">סלוטים נדרשים:</p>
                    {mt.required_slots.map((s: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                        <span>{s.label?.[lang] || s.label?.he || s.slot_id}</span>
                        <span>×{s.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* === TEMPLATES TAB === */}
      {activeTab === "templates" && (
        <div className="space-y-3">
          {templates.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">אין תבניות. צור תבנית ראשונה!</CardContent></Card>
          ) : templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{t.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t.recurrence?.type === "daily" ? "יומי" : t.recurrence?.type === "weekly" ? "שבועי" : "ימים ספציפיים"}
                    {t.time_slots?.[0] && ` · ${t.time_slots[0].start}-${t.time_slots[0].end}`}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  setGenerateForm({ template_id: t.id, start_date: "", end_date: "" });
                  setShowGenerateModal(true);
                }}>
                  <Calendar className="me-1 h-3 w-3" />צור משימות
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* === MODALS === */}

      {/* Create Window */}
      <Dialog open={showWindowModal} onOpenChange={setShowWindowModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("createWindow")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>שם</Label><Input value={windowForm.name} onChange={e => setWindowForm({...windowForm, name: e.target.value})} /></div>
            <div className="space-y-2"><Label>תאריך התחלה</Label><Input type="date" value={windowForm.start_date} onChange={e => setWindowForm({...windowForm, start_date: e.target.value})} /></div>
            <div className="space-y-2"><Label>תאריך סיום</Label><Input type="date" value={windowForm.end_date} onChange={e => setWindowForm({...windowForm, end_date: e.target.value})} /></div>
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

      {/* Create Mission Type */}
      <Dialog open={showTypeModal} onOpenChange={setShowTypeModal}>
        <DialogContent className="max-w-[650px]">
          <DialogHeader><DialogTitle>סוג משימה חדש</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>שם (עברית)</Label><Input value={typeForm.name_he} onChange={e => setTypeForm({...typeForm, name_he: e.target.value})} /></div>
              <div className="space-y-2"><Label>שם (אנגלית)</Label><Input value={typeForm.name_en} onChange={e => setTypeForm({...typeForm, name_en: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>צבע</Label><Input type="color" value={typeForm.color} onChange={e => setTypeForm({...typeForm, color: e.target.value})} /></div>
              <div className="space-y-2"><Label>משך (שעות)</Label><Input type="number" value={typeForm.duration_hours} onChange={e => setTypeForm({...typeForm, duration_hours: Number(e.target.value)})} /></div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>סלוטים נדרשים</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setTypeForm({...typeForm, required_slots: [...typeForm.required_slots, { slot_id: `s${typeForm.required_slots.length + 1}`, work_role_id: workRoles[0]?.id || "", count: 1, label_he: "", label_en: "" }]})}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {typeForm.required_slots.map((slot, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 items-end">
                  <div><Label className="text-xs">שם (עב)</Label><Input value={slot.label_he} onChange={e => { const s = [...typeForm.required_slots]; s[i].label_he = e.target.value; setTypeForm({...typeForm, required_slots: s}); }} /></div>
                  <div>
                    <Label className="text-xs">תפקיד</Label>
                    <Select value={slot.work_role_id} onChange={e => { const s = [...typeForm.required_slots]; s[i].work_role_id = e.target.value; setTypeForm({...typeForm, required_slots: s}); }}>
                      {workRoles.map(wr => <option key={wr.id} value={wr.id}>{wr.name[lang] || wr.name.he}</option>)}
                    </Select>
                  </div>
                  <div><Label className="text-xs">כמות</Label><Input type="number" min={1} value={slot.count} onChange={e => { const s = [...typeForm.required_slots]; s[i].count = Number(e.target.value); setTypeForm({...typeForm, required_slots: s}); }} /></div>
                  <Button size="sm" variant="ghost" onClick={() => setTypeForm({...typeForm, required_slots: typeForm.required_slots.filter((_, j) => j !== i)})}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTypeModal(false)}>ביטול</Button>
            <Button onClick={createMissionType}>צור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Template */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>תבנית חדשה</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>שם</Label><Input value={templateForm.name} onChange={e => setTemplateForm({...templateForm, name: e.target.value})} /></div>
            <div className="space-y-2">
              <Label>סוג משימה</Label>
              <Select value={templateForm.mission_type_id} onChange={e => setTemplateForm({...templateForm, mission_type_id: e.target.value})}>
                {missionTypes.map(mt => <option key={mt.id} value={mt.id}>{mt.name[lang] || mt.name.he}</option>)}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>חזרתיות</Label>
              <Select value={templateForm.recurrence_type} onChange={e => setTemplateForm({...templateForm, recurrence_type: e.target.value})}>
                <option value="daily">יומי</option>
                <option value="weekly">שבועי</option>
                <option value="specific_days">ימים ספציפיים</option>
              </Select>
            </div>
            {templateForm.recurrence_type !== "daily" && (
              <div className="flex flex-wrap gap-2">
                {["א", "ב", "ג", "ד", "ה", "ו", "ש"].map((d, i) => (
                  <button key={i} onClick={() => {
                    const days = templateForm.recurrence_days.includes(i)
                      ? templateForm.recurrence_days.filter(x => x !== i)
                      : [...templateForm.recurrence_days, i];
                    setTemplateForm({...templateForm, recurrence_days: days});
                  }} className={`h-8 w-8 rounded-full text-sm ${
                    templateForm.recurrence_days.includes(i) ? "bg-primary-500 text-white" : "bg-muted"
                  }`}>{d}</button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>שעת התחלה</Label><Input type="time" value={templateForm.time_start} onChange={e => setTemplateForm({...templateForm, time_start: e.target.value})} /></div>
              <div className="space-y-2"><Label>שעת סיום</Label><Input type="time" value={templateForm.time_end} onChange={e => setTemplateForm({...templateForm, time_end: e.target.value})} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateModal(false)}>ביטול</Button>
            <Button onClick={createTemplate}>צור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Employee */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>שיבוץ עובד</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>עובד</Label>
              <Select value={assignForm.employee_id} onChange={e => setAssignForm({...assignForm, employee_id: e.target.value})}>
                <option value="">בחר עובד</option>
                {employees.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_number})</option>)}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>תפקיד</Label>
              <Select value={assignForm.work_role_id} onChange={e => setAssignForm({...assignForm, work_role_id: e.target.value})}>
                {workRoles.map(wr => <option key={wr.id} value={wr.id}>{wr.name[lang] || wr.name.he}</option>)}
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
          <DialogHeader><DialogTitle>יצירת משימות מתבנית</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>תבנית</Label>
              <Select value={generateForm.template_id} onChange={e => setGenerateForm({...generateForm, template_id: e.target.value})}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
            <div className="space-y-2"><Label>מתאריך</Label><Input type="date" value={generateForm.start_date} onChange={e => setGenerateForm({...generateForm, start_date: e.target.value})} /></div>
            <div className="space-y-2"><Label>עד תאריך</Label><Input type="date" value={generateForm.end_date} onChange={e => setGenerateForm({...generateForm, end_date: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateModal(false)}>ביטול</Button>
            <Button onClick={generateMissions}>צור משימות</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
