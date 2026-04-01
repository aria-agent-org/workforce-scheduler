import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import api, { tenantApi } from "@/lib/api";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { ArrowLeftRight, Plus, Clock, X, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Assignment {
  id: string;
  mission_id: string;
  mission_name: string;
  date: string;
  window_name?: string;
  slot_label?: string;
}

interface SwapRequest {
  id: string;
  type: "open" | "specific";
  assignment_id: string;
  mission_name: string;
  date: string;
  target_soldier_name?: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
}

interface Soldier {
  id: string;
  full_name: string;
  employee_number: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: "ממתין",  color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  approved:  { label: "אושר",   color: "bg-green-100 text-green-800 border-green-200" },
  rejected:  { label: "נדחה",   color: "bg-red-100 text-red-800 border-red-200" },
  cancelled: { label: "בוטל",   color: "bg-gray-100 text-gray-700 border-gray-200" },
};

export default function SwapRequestPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);

  const [form, setForm] = useState({
    assignment_id: "",
    swap_type: "open" as "open" | "specific",
    target_soldier_id: "",
    reason: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [assignRes, swapRes] = await Promise.all([
        api.get(tenantApi("/my/assignments?upcoming=true")).catch(() => ({ data: [] })),
        api.get(tenantApi("/my/swap-requests")).catch(() => ({ data: [] })),
      ]);
      setAssignments(assignRes.data || []);
      setSwapRequests(swapRes.data || []);
    } catch {
      // ignore — show empty state
    } finally {
      setLoading(false);
    }
  };

  const loadSoldiers = async () => {
    try {
      const res = await api.get(tenantApi("/soldiers?is_active=true"));
      setSoldiers(res.data || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSwapTypeChange = (type: "open" | "specific") => {
    setForm(f => ({ ...f, swap_type: type, target_soldier_id: "" }));
    if (type === "specific" && soldiers.length === 0) {
      loadSoldiers();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.assignment_id) {
      toast("error", "יש לבחור משימה להחלפה");
      return;
    }
    if (!form.reason.trim()) {
      toast("error", "יש להוסיף סיבה להחלפה");
      return;
    }
    if (form.swap_type === "specific" && !form.target_soldier_id) {
      toast("error", "יש לבחור חייל לבקשת החלפה ספציפית");
      return;
    }

    setSubmitting(true);
    try {
      await api.post(tenantApi("/my/swap-requests"), {
        assignment_id: form.assignment_id,
        type: form.swap_type,
        target_soldier_id: form.swap_type === "specific" ? form.target_soldier_id : undefined,
        reason: form.reason.trim(),
      });
      toast("success", "בקשת ההחלפה נשלחה בהצלחה");
      setForm({ assignment_id: "", swap_type: "open", target_soldier_id: "", reason: "" });
      setShowForm(false);
      load();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "שגיאה בשליחת הבקשה";
      toast("error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await api.patch(tenantApi(`/my/swap-requests/${id}/cancel`));
      toast("success", "הבקשה בוטלה");
      load();
    } catch {
      toast("error", "שגיאה בביטול הבקשה");
    }
  };

  const selectedAssignment = assignments.find(a => a.id === form.assignment_id);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-muted/60 transition-colors"
          aria-label="חזרה"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">החלפות משמרת</h1>
          <p className="text-xs text-muted-foreground">ניהול בקשות החלפה</p>
        </div>
        <Button
          onClick={() => setShowForm(f => !f)}
          size="sm"
          className="min-h-[44px] rounded-lg gap-1"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "סגור" : "בקשה חדשה"}
        </Button>
      </div>

      <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">

        {/* New swap form */}
        {showForm && (
          <Card className="rounded-xl border shadow-sm">
            <CardContent className="p-4">
              <h2 className="font-semibold text-base mb-4 flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-primary" />
                בקשה חדשה להחלפה
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Assignment selection */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">משימה להחלפה *</label>
                  {assignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3 bg-muted/40 rounded-lg">
                      אין משימות קרובות להחלפה
                    </p>
                  ) : (
                    <select
                      value={form.assignment_id}
                      onChange={e => setForm(f => ({ ...f, assignment_id: e.target.value }))}
                      className="w-full min-h-[44px] text-base rounded-lg border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                      required
                    >
                      <option value="">בחר משימה...</option>
                      {assignments.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.mission_name} — {a.date}
                          {a.window_name ? ` (${a.window_name})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedAssignment && (
                    <p className="text-xs text-muted-foreground pr-1">
                      {selectedAssignment.slot_label ? `תפקיד: ${selectedAssignment.slot_label}` : ""}
                    </p>
                  )}
                </div>

                {/* Swap type */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">סוג החלפה *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSwapTypeChange("open")}
                      className={`min-h-[44px] rounded-lg border text-sm font-medium transition-colors ${
                        form.swap_type === "open"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-input hover:bg-muted/60"
                      }`}
                    >
                      החלפה פתוחה
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwapTypeChange("specific")}
                      className={`min-h-[44px] rounded-lg border text-sm font-medium transition-colors ${
                        form.swap_type === "specific"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-input hover:bg-muted/60"
                      }`}
                    >
                      חייל ספציפי
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground pr-1">
                    {form.swap_type === "open"
                      ? "כל חייל זמין יוכל לאשר את הבקשה"
                      : "שלח בקשה לחייל מסוים"}
                  </p>
                </div>

                {/* Target soldier (only for specific) */}
                {form.swap_type === "specific" && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">בחר חייל *</label>
                    <select
                      value={form.target_soldier_id}
                      onChange={e => setForm(f => ({ ...f, target_soldier_id: e.target.value }))}
                      className="w-full min-h-[44px] text-base rounded-lg border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                      required={form.swap_type === "specific"}
                    >
                      <option value="">בחר חייל...</option>
                      {soldiers.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({s.employee_number})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Reason */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">סיבה *</label>
                  <textarea
                    value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="הסבר מדוע אתה מבקש החלפה..."
                    rows={3}
                    className="w-full text-base rounded-lg border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    required
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground text-left">{form.reason.length}/500</p>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full min-h-[48px] rounded-lg text-base font-medium"
                  disabled={submitting || assignments.length === 0}
                >
                  {submitting ? "שולח..." : "שלח בקשת החלפה"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Existing swap requests */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">הבקשות שלי</h2>
          {swapRequests.length === 0 ? (
            <Card className="rounded-xl border shadow-sm">
              <CardContent className="p-8 text-center">
                <ArrowLeftRight className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">אין בקשות החלפה</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  לחץ על "בקשה חדשה" כדי ליצור בקשה
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {swapRequests.map(req => {
                const statusInfo = STATUS_LABELS[req.status] || STATUS_LABELS.pending;
                return (
                  <Card key={req.id} className="rounded-xl border shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{req.mission_name}</span>
                            <Badge className={`text-xs border ${statusInfo.color} px-2 py-0.5`}>
                              {statusInfo.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{req.date}</span>
                            {req.target_soldier_name && (
                              <span>• עם {req.target_soldier_name}</span>
                            )}
                            {!req.target_soldier_name && (
                              <span>• החלפה פתוחה</span>
                            )}
                          </div>
                          {req.reason && (
                            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                              {req.reason}
                            </p>
                          )}
                        </div>
                        {req.status === "pending" && (
                          <button
                            onClick={() => handleCancel(req.id)}
                            className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors shrink-0"
                            aria-label="בטל בקשה"
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
