import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ArrowLeftRight, Check, X } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

export default function SwapRequestsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [swaps, setSwaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(tenantApi("/swap-requests"));
      setSwaps(data);
    } catch (e) {
      toast("error", "שגיאה בטעינת בקשות");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    try {
      await api.post(tenantApi(`/swap-requests/${id}/${action}`));
      toast("success", action === "approve" ? "בקשה אושרה" : "בקשה נדחתה");
      load();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  if (loading) return <TableSkeleton rows={5} cols={4} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("scheduling.swap.title")}</h1>

      {swaps.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">אין בקשות החלפה</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {swaps.map(sr => (
            <Card key={sr.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ArrowLeftRight className="h-5 w-5 text-blue-500" />
                    <div>
                      <h3 className="font-medium">{sr.requester_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        סוג: {sr.swap_type === "swap" ? "החלפה" : "מסירה"}
                        {sr.target_name && ` → ${sr.target_name}`}
                      </p>
                      {sr.reason && (
                        <p className="text-xs text-muted-foreground mt-1">סיבה: {sr.reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[sr.status] || ""}>
                      {sr.status === "pending" ? "ממתין" : sr.status === "approved" ? "אושר" : "נדחה"}
                    </Badge>
                    {sr.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleAction(sr.id, "approve")}>
                          <Check className="h-4 w-4 text-green-500" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleAction(sr.id, "reject")}>
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                {sr.validation_result && (
                  <div className="mt-2 rounded bg-muted/50 px-3 py-2 text-xs">
                    {JSON.stringify(sr.validation_result)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
