import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight, Clock } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import LoadingSpinner from "@/components/common/LoadingSpinner";

interface SwapRequest {
  id: string;
  swap_type: string;
  reason: string | null;
  status: string;
  target_name: string | null;
  target_response: string;
  created_at: string;
}

const statusMap: Record<string, { label: string; cls: string }> = {
  pending: { label: "ממתין", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "אושר", cls: "bg-green-100 text-green-700" },
  rejected: { label: "נדחה", cls: "bg-red-100 text-red-700" },
};

export default function MySwapPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(tenantApi("/my/swap-requests"));
      setRequests(res.data);
    } catch {
      toast("error", "שגיאה בטעינת בקשות");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-primary-500" />
          בקשות החלפה
        </h2>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ArrowLeftRight className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-lg font-medium">אין בקשות החלפה</p>
            <p className="text-sm">ניתן לבקש החלפה מתוך עמוד השיבוץ שלי</p>
          </CardContent>
        </Card>
      ) : (
        requests.map(req => {
          const st = statusMap[req.status] || { label: req.status, cls: "bg-gray-100 text-gray-700" };
          return (
            <Card key={req.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">
                      {req.swap_type === "swap" ? "החלפה" : "ויתור"} 
                      {req.target_name && ` עם ${req.target_name}`}
                    </p>
                    {req.reason && <p className="text-xs text-muted-foreground mt-1">{req.reason}</p>}
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3" /> {req.created_at?.slice(0, 10)}
                    </p>
                  </div>
                  <Badge className={st.cls}>{st.label}</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
