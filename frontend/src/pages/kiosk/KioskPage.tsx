import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import api, { tenantApi } from "@/lib/api";

export default function KioskPage() {
  const { toast } = useToast();
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [mode, setMode] = useState<"checkin" | "checkout">("checkin");

  const handleAction = async () => {
    if (!employeeNumber.trim()) return;
    setLoading(true);
    try {
      const res = await api.post(tenantApi("/kiosk/action"), {
        employee_number: employeeNumber.trim(),
        action: mode,
      });
      setResult(res.data);
      toast("success", mode === "checkin" ? "✅ נרשם בהצלחה" : "👋 יציאה נרשמה");
      setTimeout(() => { setResult(null); setEmployeeNumber(""); }, 3000);
    } catch (e: any) {
      toast("error", e?.response?.data?.detail || "שגיאה");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 to-primary-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardContent className="p-8 space-y-6 text-center">
          <div className="text-5xl mb-2">🎖️</div>
          <h1 className="text-2xl font-bold">שבצק — קיוסק</h1>
          <p className="text-muted-foreground">הזן מספר אישי לדיווח נוכחות</p>
          <div className="flex gap-2 justify-center">
            <Button variant={mode === "checkin" ? "default" : "outline"} onClick={() => setMode("checkin")} className="flex-1 min-h-[48px] text-lg">✅ כניסה</Button>
            <Button variant={mode === "checkout" ? "default" : "outline"} onClick={() => setMode("checkout")} className="flex-1 min-h-[48px] text-lg">👋 יציאה</Button>
          </div>
          <Input value={employeeNumber} onChange={e => setEmployeeNumber(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAction()} placeholder="מספר אישי" className="text-center text-2xl h-16 font-mono" dir="ltr" autoFocus />
          <Button onClick={handleAction} disabled={loading || !employeeNumber.trim()} className="w-full min-h-[56px] text-xl">
            {loading ? "⏳" : mode === "checkin" ? "✅ דווח כניסה" : "👋 דווח יציאה"}
          </Button>
          {result && (
            <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border-2 border-green-300 p-4 animate-scale-in">
              <p className="text-xl font-bold text-green-700">✅ {result.employee_name}</p>
              <p className="text-sm text-green-600">{result.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
