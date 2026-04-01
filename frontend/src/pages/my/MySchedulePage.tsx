import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Calendar, Clock, ChevronLeft, ChevronRight, AlertTriangle, Users, ArrowRightLeft, Timer, Sun, Moon, Sunrise } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import { useToast } from "@/components/ui/toast";

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
  crew?: Array<{ name: string; full_name?: string; slot_id?: string; slot_label?: string; is_me?: boolean }>;
  timeline_items?: Array<{ label: any; time: string; offset_minutes: number }>;
  pre_mission_events?: Array<{ label: any; offset_minutes: number; location?: any }>;
}

function formatTimeLeft(targetDate: string, targetTime: string): string {
  const target = new Date(`${targetDate}T${targetTime}`);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return "עכשיו";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)} ימים`;
  if (hours > 0) return `${hours} שעות ${minutes} דקות`;
  return `${minutes} דקות`;
}

function getTimeIcon(time: string) {
  const h = parseInt(time?.split(":")[0] || "12");
  if (h >= 6 && h < 12) return <Sunrise className="h-4 w-4 text-orange-500" />;
  if (h >= 12 && h < 18) return <Sun className="h-4 w-4 text-yellow-500" />;
  return <Moon className="h-4 w-4 text-indigo-500" />;
}

export default function MySchedulePage() {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [swapTarget, setSwapTarget] = useState<Assignment | null>(null);
  const [swapReason, setSwapReason] = useState("");
  const [swapType, setSwapType] = useState<"give_away" | "swap_mutual">("give_away");
  const [swapPartner, setSwapPartner] = useState("");
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [soldiers, setSoldiers] = useState<any[]>([]);
  const [countdown, setCountdown] = useState("");
  const touchStartX = useRef(0);

  const today = new Date().toISOString().split("T")[0];

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date(selectedDate);
      start.setDate(start.getDate() - 7);
      const end = new Date(selectedDate);
      end.setDate(end.getDate() + 14);
      const res = await api.get(tenantApi("/my/schedule"), {
        params: { date_from: start.toISOString().split("T")[0], date_to: end.toISOString().split("T")[0] },
      });
      setAssignments(res.data);
    } catch {
      toast("error", "שגיאה בטעינת לוח זמנים");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  // Countdown timer for next duty
  useEffect(() => {
    const todayAssignments = assignments.filter(a => a.date >= today).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.start_time || "").localeCompare(b.start_time || "");
    });
    
    const updateCountdown = () => {
      const now = new Date();
      const next = todayAssignments.find(a => {
        const start = new Date(`${a.date}T${a.start_time || "00:00"}`);
        return start > now;
      });
      if (next) {
        setCountdown(formatTimeLeft(next.date, next.start_time));
      } else {
        setCountdown("");
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [assignments, today]);

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      // RTL: swipe right = next day, swipe left = previous day  
      navigateDay(diff > 0 ? 1 : -1);
    }
  };

  const navigateDay = (dir: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const dayAssignments = assignments.filter(a => a.date === selectedDate)
    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  // Upcoming assignments for mini calendar dots
  const upcomingDates = new Set(assignments.filter(a => a.date >= today).map(a => a.date));

  // Day labels for navigation strip
  const dayStrip: Array<{ date: string; label: string; dayNum: number; isToday: boolean; hasAssignment: boolean }> = [];
  for (let i = -3; i <= 4; i++) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    dayStrip.push({
      date: dateStr,
      label: d.toLocaleDateString("he-IL", { weekday: "narrow" }),
      dayNum: d.getDate(),
      isToday: dateStr === today,
      hasAssignment: upcomingDates.has(dateStr) || assignments.some(a => a.date === dateStr),
    });
  }

  // Load soldiers for swap
  useEffect(() => {
    if (swapTarget && swapType === "swap_mutual") {
      api.get(tenantApi("/my/teammates"))
        .then(res => setSoldiers(Array.isArray(res.data) ? res.data : (res.data.items || [])))
        .catch(() => setSoldiers([]));
    }
  }, [swapTarget, swapType]);

  const requestSwap = async () => {
    if (!swapTarget || !swapReason.trim()) { toast("error", "נא למלא סיבה"); return; }
    if (swapType === "swap_mutual" && !swapPartner) { toast("error", "נא לבחור חייל להחלפה"); return; }
    setSwapSubmitting(true);
    try {
      await api.post(tenantApi("/swap-requests"), {
        requester_assignment_id: swapTarget.assignment_id,
        swap_type: swapType,
        target_employee_id: swapType === "swap_mutual" ? swapPartner : undefined,
        reason: swapReason,
      });
      toast("success", "בקשת החלפה נשלחה בהצלחה! 🔄");
      setSwapTarget(null); setSwapReason(""); setSwapType("give_away"); setSwapPartner("");
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בשליחת בקשה"));
    } finally { setSwapSubmitting(false); }
  };

  const isToday = selectedDate === today;
  const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const selectedDateObj = new Date(selectedDate);
  const dayName = dayNames[selectedDateObj.getDay()];

  // Currently active mission
  const now = new Date();
  const currentMission = dayAssignments.find(a => {
    if (a.date !== today) return false;
    const start = new Date(`${a.date}T${a.start_time || "00:00"}`);
    const end = new Date(`${a.date}T${a.end_time || "23:59"}`);
    return now >= start && now <= end;
  });

  return (
    <div className="space-y-4 pb-20" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Countdown Banner */}
      {countdown && !currentMission && (
        <div className="glass-card p-3 flex items-center gap-3 animate-fade-in" role="status" aria-label="ספירה לאחור למשימה הבאה">
          <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
            <Timer className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">המשימה הבאה בעוד</p>
            <p className="text-lg font-bold gradient-text">{countdown}</p>
          </div>
        </div>
      )}

      {/* Current Mission Banner */}
      {currentMission && (
        <div className="card-premium p-4 animate-scale-in border-2 border-green-300 dark:border-green-700" role="alert" aria-label="משימה פעילה כרגע">
          <div className="flex items-center gap-2 mb-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
            <span className="text-sm font-bold text-green-700 dark:text-green-300">משימה פעילה כרגע</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: (currentMission.mission_type_color || "#22c55e") + "20" }}>
              {currentMission.mission_type_icon || "📋"}
            </div>
            <div>
              <p className="font-bold text-base">{currentMission.mission_name}</p>
              <p className="text-sm text-muted-foreground">⏰ {currentMission.start_time?.slice(0, 5)} - {currentMission.end_time?.slice(0, 5)} · 📍 {currentMission.slot_label || currentMission.slot_id}</p>
            </div>
          </div>
          {currentMission.crew && currentMission.crew.length > 0 && (
            <div className="flex items-center gap-1 mt-3 flex-wrap">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">צוות:</span>
              {currentMission.crew.map((cm, i) => (
                <Badge key={i} className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">{cm.name || cm.full_name}</Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Day Navigation Strip */}
      <div className="flex items-center gap-1" role="tablist" aria-label="בחירת יום">
        <Button variant="ghost" size="icon" className="h-10 w-10 flex-shrink-0" onClick={() => navigateDay(-1)} aria-label="יום קודם">
          <ChevronRight className="h-5 w-5" />
        </Button>
        <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-hide justify-center">
          {dayStrip.map(d => (
            <button
              key={d.date}
              role="tab"
              aria-selected={d.date === selectedDate}
              aria-label={`יום ${d.label} ${d.dayNum}`}
              onClick={() => setSelectedDate(d.date)}
              className={`flex flex-col items-center min-w-[44px] py-2 px-1.5 rounded-xl transition-all ${
                d.date === selectedDate
                  ? "bg-primary-500 text-white shadow-elevation-2 scale-105"
                  : d.isToday
                  ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                  : "hover:bg-muted"
              }`}
            >
              <span className="text-[10px] font-medium">{d.label}</span>
              <span className="text-base font-bold leading-tight">{d.dayNum}</span>
              {d.hasAssignment && d.date !== selectedDate && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary-500 mt-0.5" />
              )}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" className="h-10 w-10 flex-shrink-0" onClick={() => navigateDay(1)} aria-label="יום הבא">
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>

      {/* Today button */}
      {!isToday && (
        <div className="text-center">
          <button
            onClick={() => setSelectedDate(today)}
            className="text-xs px-4 py-1.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 hover:bg-primary-200 transition-colors touch-target"
            aria-label="חזור להיום"
          >
            ← חזרה להיום
          </button>
        </div>
      )}

      {/* Day Header */}
      <div className="text-center">
        <h2 className="text-lg font-bold">
          {isToday ? "היום" : `יום ${dayName}`} — {selectedDateObj.toLocaleDateString("he-IL", { day: "numeric", month: "long" })}
        </h2>
        <p className="text-xs text-muted-foreground">{dayAssignments.length} {dayAssignments.length === 1 ? "משימה" : "משימות"}</p>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border p-4 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-muted rounded" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : dayAssignments.length === 0 ? (
        /* Empty State */
        <div className="empty-state" role="status">
          <Calendar className="empty-state-icon" />
          <p className="empty-state-title">אין משימות ב{isToday ? "היום" : "יום זה"}</p>
          <p className="empty-state-description">
            {isToday ? "אין לך שיבוצים להיום. תהנה מהמנוחה! 😊" : "אין שיבוצים ליום זה"}
          </p>
        </div>
      ) : (
        /* Assignments List */
        <div className="space-y-3">
          {dayAssignments.map(a => {
            const missionTypeName = typeof a.mission_type_name === "object"
              ? (a.mission_type_name?.he || a.mission_type_name?.en || "")
              : (a.mission_type_name || "");
            const isActive = currentMission?.assignment_id === a.assignment_id;
            const color = a.mission_type_color || "#3b82f6";

            return (
              <Card
                key={a.assignment_id}
                className={`overflow-hidden card-hover ${isActive ? "ring-2 ring-green-500 shadow-elevation-3" : "shadow-elevation-1"}`}
                role="article"
                aria-label={`משימה: ${a.mission_name}`}
              >
                <div className="flex">
                  <div className="w-1.5 flex-shrink-0 rounded-s-lg" style={{ backgroundColor: color }} />
                  <CardContent className="flex-1 p-4">
                    {/* Mission Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-12 w-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 shadow-elevation-1"
                             style={{ backgroundColor: color + "15" }}>
                          {a.mission_type_icon || "📋"}
                        </div>
                        <div className="min-w-0">
                          <a href={`/my/mission/${a.mission_id}`} className="font-bold text-base truncate block hover:text-primary-600 transition-colors">
                            {a.mission_name}
                          </a>
                          {missionTypeName && (
                            <Badge className="text-[10px] mt-0.5" style={{ backgroundColor: color + "20", color }}>
                              {missionTypeName}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Badge className={`text-[10px] flex-shrink-0 ${
                        a.status === "assigned" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                        a.status === "proposed" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-700"
                      }`}>
                        {a.status === "assigned" ? "✓ משובץ" : a.status === "proposed" ? "מוצע" : a.status}
                      </Badge>
                    </div>

                    {/* Time & Location */}
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                      <span className="flex items-center gap-1.5">
                        {getTimeIcon(a.start_time)}
                        <span className="font-medium">{a.start_time?.slice(0, 5)} - {a.end_time?.slice(0, 5)}</span>
                      </span>
                      {(a.slot_label || a.slot_id) && (
                        <span className="flex items-center gap-1">📍 {a.slot_label || a.slot_id}</span>
                      )}
                    </div>

                    {/* Conflicts */}
                    {a.conflicts_detected?.length > 0 && (
                      <div className="flex items-center gap-1 mb-2 p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800" role="alert">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                        <span className="text-xs text-yellow-700 dark:text-yellow-300">{a.conflicts_detected.length} אזהרות</span>
                      </div>
                    )}

                    {/* Crew */}
                    {a.crew && a.crew.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        {a.crew.map((cm, i) => (
                          <Badge key={i} className="text-[10px] bg-muted">{cm.name || cm.full_name}</Badge>
                        ))}
                      </div>
                    )}

                    {/* Swap Button */}
                    <div className="mt-3 pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-10 text-sm text-muted-foreground hover:text-primary-600"
                        onClick={() => setSwapTarget(a)}
                        aria-label={`בקש החלפה עבור ${a.mission_name}`}
                      >
                        <ArrowRightLeft className="h-4 w-4 me-2" />
                        בקש החלפה
                      </Button>
                    </div>
                  </CardContent>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Swap Request Dialog */}
      <Dialog open={!!swapTarget} onOpenChange={() => { setSwapTarget(null); setSwapReason(""); setSwapType("give_away"); setSwapPartner(""); }}>
        <DialogContent className="max-w-[450px] mobile-bottom-sheet">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              בקשת החלפה
            </DialogTitle>
          </DialogHeader>
          {swapTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border p-3 bg-muted/50">
                <p className="font-semibold text-sm">{swapTarget.mission_name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  📅 {swapTarget.date} • ⏰ {swapTarget.start_time?.slice(0, 5)} - {swapTarget.end_time?.slice(0, 5)}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">סוג בקשה</Label>
                <div className="flex gap-2">
                  {[
                    { key: "give_away" as const, icon: "🙋", title: "ויתור", desc: "אני רוצה לוותר על המשימה" },
                    { key: "swap_mutual" as const, icon: "🔄", title: "החלפה", desc: "להחליף עם חייל אחר" },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => { setSwapType(opt.key); if (opt.key === "give_away") setSwapPartner(""); }}
                      className={`flex-1 rounded-xl border-2 p-3 text-sm text-start transition-all min-h-[44px] ${
                        swapType === opt.key ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-muted hover:border-primary-300"
                      }`}
                      role="radio"
                      aria-checked={swapType === opt.key}
                    >
                      <p className="font-medium">{opt.icon} {opt.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              {swapType === "swap_mutual" && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">חייל להחלפה <span className="text-red-500">*</span></Label>
                  <Select value={swapPartner} onChange={e => setSwapPartner(e.target.value)} className="min-h-[44px]" aria-label="בחר חייל להחלפה">
                    <option value="">בחר חייל...</option>
                    {soldiers.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.full_name} ({s.employee_number || ""})</option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">סיבה <span className="text-red-500">*</span></Label>
                <textarea
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                  value={swapReason}
                  onChange={e => setSwapReason(e.target.value)}
                  placeholder="למה אתה רוצה להחליף?"
                  aria-label="סיבת בקשת ההחלפה"
                  aria-required="true"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSwapTarget(null); setSwapReason(""); }}>ביטול</Button>
            <Button onClick={requestSwap} disabled={swapSubmitting || !swapReason.trim()} className="min-h-[44px]">
              {swapSubmitting ? "שולח..." : "שלח בקשה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
