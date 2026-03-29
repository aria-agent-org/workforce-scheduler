import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Clock, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
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
  status: string;
  mission_status: string;
  conflicts_detected: any;
}

export default function MySchedulePage() {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
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
      end.setDate(end.getDate() + 13); // Two weeks
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

  const moveWeek = (dir: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().split("T")[0]);
  };

  // Group by date
  const grouped = assignments.reduce<Record<string, Assignment[]>>((acc, a) => {
    (acc[a.date] = acc[a.date] || []).push(a);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort();
  const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary-500" />
          השיבוץ שלי
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => moveWeek(-1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">{weekStart}</span>
          <Button variant="ghost" size="icon" onClick={() => moveWeek(1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {sortedDates.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-lg font-medium">אין שיבוצים בתקופה זו</p>
            <p className="text-sm">השיבוצים שלך יופיעו כאן כשיוקצו</p>
          </CardContent>
        </Card>
      ) : (
        sortedDates.map(date => {
          const d = new Date(date);
          const dayName = dayNames[d.getDay()];
          return (
            <div key={date} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground sticky top-0 bg-background py-1">
                יום {dayName} · {date}
              </h3>
              {grouped[date].map(a => (
                <Card key={a.assignment_id} className="overflow-hidden">
                  <div className="flex">
                    <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: a.mission_type_color || "#3b82f6" }} />
                    <CardContent className="flex-1 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{a.mission_type_icon || "📋"}</span>
                          <div>
                            <p className="font-medium text-sm">{a.mission_name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {a.start_time?.slice(0, 5)} - {a.end_time?.slice(0, 5)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {a.conflicts_detected?.length > 0 && (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                          <Badge className={
                            a.status === "assigned" ? "bg-green-100 text-green-700" :
                            a.status === "proposed" ? "bg-purple-100 text-purple-700" :
                            "bg-gray-100 text-gray-700"
                          }>
                            {a.status === "assigned" ? "משובץ" : a.status === "proposed" ? "מוצע" : a.status}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
