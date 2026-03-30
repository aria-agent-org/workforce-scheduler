import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight, Calendar, Clock, Users, CheckCircle, XCircle,
  Pencil, AlertTriangle, MessageSquare, Save, Loader2,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  proposed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
};

const statusLabels: Record<string, string> = {
  draft: "טיוטה",
  active: "פעיל",
  approved: "מאושר",
  completed: "הושלם",
  cancelled: "בוטל",
  proposed: "מוצע",
  paused: "מושהה",
};

export default function MissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mission, setMission] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [missionType, setMissionType] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", date: "", start_time: "", end_time: "" });

  const loadMission = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [missionRes, assignRes] = await Promise.all([
        api.get(tenantApi(`/missions/${id}`)),
        api.get(tenantApi(`/missions/${id}/assignments`)),
      ]);
      const m = missionRes.data;
      setMission(m);
      setAssignments(assignRes.data || []);
      setNotes(m.notes || "");
      setEditForm({
        name: m.name || "",
        date: m.date || "",
        start_time: m.start_time?.slice(0, 5) || "",
        end_time: m.end_time?.slice(0, 5) || "",
      });

      // Load mission type
      if (m.mission_type_id) {
        try {
          const mtRes = await api.get(tenantApi(`/mission-types/${m.mission_type_id}`));
          setMissionType(mtRes.data);
        } catch { /* optional */ }
      }
    } catch (e: any) {
      toast("error", "שגיאה בטעינת משימה");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadMission(); }, [loadMission]);

  const saveNotes = async () => {
    if (!id) return;
    setSavingNotes(true);
    try {
      await api.patch(tenantApi(`/missions/${id}`), { notes });
      toast("success", "הערות נשמרו");
    } catch {
      toast("error", "שגיאה בשמירת הערות");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAction = async (action: string) => {
    if (!id) return;
    try {
      await api.post(tenantApi(`/missions/${id}/${action}`));
      toast("success", `פעולה בוצעה: ${action === "approve" ? "אושר" : "בוטל"}`);
      loadMission();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const saveEdit = async () => {
    if (!id) return;
    try {
      await api.patch(tenantApi(`/missions/${id}`), {
        name: editForm.name || undefined,
        date: editForm.date || undefined,
        start_time: editForm.start_time || undefined,
        end_time: editForm.end_time || undefined,
      });
      toast("success", "משימה עודכנה");
      setEditing(false);
      loadMission();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה בעדכון");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium text-muted-foreground">משימה לא נמצאה</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          <ArrowRight className="me-1 h-4 w-4" />חזרה
        </Button>
      </div>
    );
  }

  const mtName = missionType?.name
    ? (typeof missionType.name === "object" ? (missionType.name.he || missionType.name.en || "") : missionType.name)
    : "";
  const mtColor = missionType?.color || "#3b82f6";
  const mtIcon = missionType?.icon || "📋";

  // Timeline items from mission type
  const timelineItems = missionType?.timeline_items || [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowRight className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: mtColor + "20" }}>
              {mtIcon}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{mission.name}</h1>
              <p className="text-sm text-muted-foreground">{mtName}</p>
            </div>
          </div>
        </div>
        <Badge className={`${statusColors[mission.status] || ""} text-sm px-3 py-1`}>
          {statusLabels[mission.status] || mission.status}
        </Badge>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {(mission.status === "draft" || mission.status === "proposed") && (
          <Button size="sm" className="min-h-[40px]" onClick={() => handleAction("approve")}>
            <CheckCircle className="me-1 h-4 w-4" />אשר משימה
          </Button>
        )}
        {mission.status !== "cancelled" && (
          <Button size="sm" variant="destructive" className="min-h-[40px]" onClick={() => handleAction("cancel")}>
            <XCircle className="me-1 h-4 w-4" />בטל משימה
          </Button>
        )}
        <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => setEditing(!editing)}>
          <Pencil className="me-1 h-4 w-4" />{editing ? "ביטול עריכה" : "ערוך"}
        </Button>
      </div>

      {/* Edit Form */}
      {editing && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label>שם המשימה</Label>
              <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="min-h-[44px]" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>תאריך</Label>
                <Input type="date" value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>שעת התחלה</Label>
                <Input type="time" value={editForm.start_time} onChange={e => setEditForm({ ...editForm, start_time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>שעת סיום</Label>
                <Input type="time" value={editForm.end_time} onChange={e => setEditForm({ ...editForm, end_time: e.target.value })} />
              </div>
            </div>
            <Button onClick={saveEdit} className="min-h-[44px]">
              <Save className="me-1 h-4 w-4" />שמור שינויים
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mission Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              פרטי משימה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">תאריך</p>
                <p className="font-medium">{mission.date}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">שעות</p>
                <p className="font-medium flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {mission.start_time?.slice(0, 5) || "—"} – {mission.end_time?.slice(0, 5) || "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">סוג משימה</p>
                <p className="font-medium">{mtName || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">סטטוס</p>
                <Badge className={statusColors[mission.status] || ""}>
                  {statusLabels[mission.status] || mission.status}
                </Badge>
              </div>
            </div>

            {/* Assigned Crew */}
            <div className="border-t pt-4">
              <h3 className="font-semibold flex items-center gap-2 mb-3">
                <Users className="h-5 w-5" />
                צוות משובץ ({assignments.filter(a => a.status !== "replaced").length})
              </h3>
              {assignments.filter(a => a.status !== "replaced").length === 0 ? (
                <p className="text-sm text-muted-foreground">אין חיילים משובצים</p>
              ) : (
                <div className="space-y-2">
                  {assignments.filter(a => a.status !== "replaced").map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-sm font-bold text-primary-700 dark:text-primary-300">
                          {(a.employee_name || "?")[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{a.employee_name}</p>
                          <p className="text-xs text-muted-foreground">משבצת: {a.slot_id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.conflicts_detected?.length > 0 && (
                          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                            <AlertTriangle className="inline h-3 w-3 me-1" />
                            {a.conflicts_detected.length} התנגשויות
                          </Badge>
                        )}
                        <Badge className="text-xs">{a.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Side Panel */}
        <div className="space-y-4">
          {/* Timeline */}
          {timelineItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  ציר זמן
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {timelineItems.map((ti: any, i: number) => {
                    const label = typeof ti.label === "object" ? (ti.label.he || ti.label.en || "") : (ti.label || "");
                    const timeStr = ti.time_mode === "exact"
                      ? ti.exact_time
                      : ti.offset_minutes != null
                        ? `+${ti.offset_minutes} דקות`
                        : "";
                    return (
                      <div key={ti.item_id || i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-3 w-3 rounded-full bg-primary-500 mt-1" />
                          {i < timelineItems.length - 1 && <div className="w-0.5 h-6 bg-border" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{label}</p>
                          <p className="text-xs text-muted-foreground">{timeStr}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                הערות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="הוסף הערות למשימה..."
              />
              <Button
                size="sm"
                className="mt-2 min-h-[36px]"
                onClick={saveNotes}
                disabled={savingNotes}
              >
                {savingNotes ? <Loader2 className="me-1 h-3 w-3 animate-spin" /> : <Save className="me-1 h-3 w-3" />}
                שמור הערות
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
