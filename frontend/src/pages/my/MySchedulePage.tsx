import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, ChevronLeft, ChevronRight, AlertTriangle, MapPin, Users, ArrowRightLeft } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api, { tenantApi } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import LoadingSpinner from "@/components/common/LoadingSpinner";

interface Assignment {
  assignment_id: string;
  mission_id: string;
  mission_name: string;
  mission_type_name: any;
  mission_type_color: string;
  mission_type_icon: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_id: string;
  slot_label?: string;
  status: string;
  mission_status: string;
  conflicts_detected: any;
  crew?: Array<{
    employee_id: string;
    full_name: string;
    slot_label?: string;
  }>;
}

export default function MySchedulePage() {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [swapTarget, setSwapTarget] = useState<Assignment | null>(null);
  const [swapReason, setSwapReason] = useState("");
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split("T")[0];
  });

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const start = new Date(weekStart);
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 13);
      const res = await api.get(tenantApi("/my/schedule"), {
        params: { date_from: start.toISOString().split("T")[0], date_to: end.toISOString().split("T")[0] },
      });
      setAssignments(res.data);
    } catch {
      toast("error", "שגיאה בטעינת לוח זמנים");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSchedule(); }, [weekStart]);

  const requestSwap = async () => {
    if (!swapTarget) return;
    setSwapSubmitting(true);
    try {
      await api.post(tenantApi("/swap-requests"), {
        requester_assignment_id: swapTarget.assignment_id,
        swap_type: "give_away",
        reason: swapReason || undefined,
      });
      toast("success", "בקשת החלפה נשלחה בהצלחה! 🔄");
      setSwapTarget(null);
      setSwapReason("");
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה בשליחת בקשה");
    } finally {
      setSwapSubmitting(false);
    }
  };

  const moveWeek = (dir: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().split("T")[0]);
  };

  const grouped = assignments.reduce<Record<string, Assignment[]>>((acc, a) => {
    (acc[a.date] = acc[a.date] || []).push(a);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort();
  const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const today = new Date().toISOString().split("T")[0];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4 pb-4">
      {/* Header with navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary-500" />
          השיבוץ שלי
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => moveWeek(-1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
          <button 
            onClick={() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); setWeekStart(d.toISOString().split("T")[0]); }}
            className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-accent transition-colors"
          >
            היום
          </button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => moveWeek(1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Week indicator */}
      <div className="text-sm text-center text-muted-foreground">
        {new Date(weekStart).toLocaleDateString("he-IL", { day: "numeric", month: "long" })} — {new Date(new Date(weekStart).getTime() + 13 * 86400000).toLocaleDateString("he-IL", { day: "numeric", month: "long" })}
      </div>

      {sortedDates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-lg font-medium">אין שיבוצים בתקופה זו</p>
            <p className="text-sm mt-1">השיבוצים שלך יופיעו כאן כשיוקצו</p>
          </CardContent>
        </Card>
      ) : (
        sortedDates.map(date => {
          const d = new Date(date);
          const dayName = dayNames[d.getDay()];
          const isToday = date === today;
          return (
            <div key={date} className="space-y-2">
              <div className={`sticky top-0 z-10 flex items-center gap-2 py-2 px-1 ${isToday ? "bg-primary-50 dark:bg-primary-900/20 rounded-lg" : "bg-background"}`}>
                <div className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl ${isToday ? "bg-primary-500 text-white" : "bg-muted"}`}>
                  <span className="text-xs font-medium">{dayName}</span>
                  <span className="text-lg font-bold leading-tight">{d.getDate()}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{isToday ? "היום" : `יום ${dayName}`}</p>
                  <p className="text-xs text-muted-foreground">{grouped[date].length} משימות</p>
                </div>
              </div>
              {grouped[date].map(a => {
                const missionTypeName = typeof a.mission_type_name === "object"
                  ? (a.mission_type_name?.he || a.mission_type_name?.en || "")
                  : (a.mission_type_name || "");
                return (
                  <Card key={a.assignment_id} className="overflow-hidden transition-shadow hover:shadow-md active:scale-[0.99]">
                    <div className="flex">
                      <div className="w-1.5 flex-shrink-0 rounded-s-lg" style={{ backgroundColor: a.mission_type_color || "#3b82f6" }} />
                      <CardContent className="flex-1 p-3 sm:p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="h-10 w-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                                 style={{ backgroundColor: (a.mission_type_color || "#3b82f6") + "15" }}>
                              {a.mission_type_icon || "📋"}
                            </div>
                            <div className="min-w-0">
                              <a href={`/missions/${a.mission_id}`} className="font-semibold text-sm truncate text-primary-600 hover:underline">{a.mission_name}</a>
                              {missionTypeName && (
                                <Badge
                                  className="text-[10px] mt-0.5"
                                  style={{
                                    backgroundColor: (a.mission_type_color || "#3b82f6") + "20",
                                    color: a.mission_type_color || "#3b82f6",
                                  }}
                                >
                                  {a.mission_type_icon && <span className="me-0.5">{a.mission_type_icon}</span>}
                                  {missionTypeName}
                                </Badge>
                              )}
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {a.start_time?.slice(0, 5)} - {a.end_time?.slice(0, 5)}
                                </span>
                                {(a.slot_label || a.slot_id) && (
                                  <span className="text-xs text-muted-foreground">
                                    📍 {a.slot_label || a.slot_id}
                                  </span>
                                )}
                              </div>

                              {/* Crew members */}
                              {a.crew && a.crew.length > 0 && (
                                <div className="flex items-center gap-1 mt-2 flex-wrap">
                                  <Users className="h-3 w-3 text-muted-foreground" />
                                  {a.crew.map((cm, i) => (
                                    <Badge key={i} className="text-[10px] bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                      {cm.full_name}
                                      {cm.slot_label && <span className="text-muted-foreground mr-0.5"> ({cm.slot_label})</span>}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            {a.conflicts_detected?.length > 0 && (
                              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 text-[10px]">
                                <AlertTriangle className="h-3 w-3 me-0.5" />{a.conflicts_detected.length}
                              </Badge>
                            )}
                            <Badge className={`text-[10px] ${
                              a.status === "assigned" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                              a.status === "proposed" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" :
                              "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                            }`}>
                              {a.status === "assigned" ? "משובץ" : a.status === "proposed" ? "מוצע" : a.status}
                            </Badge>
                            {/* Swap request button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 mt-1"
                              onClick={(e) => { e.stopPropagation(); setSwapTarget(a); }}
                            >
                              <ArrowRightLeft className="h-3 w-3 me-1" />
                              בקש החלפה
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </div>
                  </Card>
                );
              })}
            </div>
          );
        })
      )}
      {/* Swap Request Dialog */}
      <Dialog open={!!swapTarget} onOpenChange={() => { setSwapTarget(null); setSwapReason(""); }}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              בקשת החלפה
            </DialogTitle>
          </DialogHeader>
          {swapTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border p-3 bg-muted/50">
                <p className="font-medium text-sm">{swapTarget.mission_name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {swapTarget.date} • {swapTarget.start_time?.slice(0, 5)} - {swapTarget.end_time?.slice(0, 5)}
                </p>
              </div>
              <div className="space-y-2">
                <Label>סיבה (אופציונלי)</Label>
                <Input
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                  placeholder="למה אתה רוצה להחליף?"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSwapTarget(null); setSwapReason(""); }}>ביטול</Button>
            <Button onClick={requestSwap} disabled={swapSubmitting}>
              {swapSubmitting ? "שולח..." : "שלח בקשה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
