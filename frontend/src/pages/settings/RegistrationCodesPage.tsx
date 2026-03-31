import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { KeyRound, RefreshCw, Copy, Users, Search } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";

interface RegStatus {
  employee_id: string;
  employee_name: string;
  employee_number: string;
  phone: string | null;
  email: string | null;
  status: string;
  code: string | null;
  expires_at: string | null;
  has_user: boolean;
  user_email: string | null;
}

const statusStyles: Record<string, string> = {
  "רשום": "bg-green-100 text-green-700",
  "ממתין לרישום": "bg-yellow-100 text-yellow-700",
  "פג תוקף": "bg-red-100 text-red-700",
  "ללא קוד": "bg-gray-100 text-gray-700",
};

export default function RegistrationCodesPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<RegStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(tenantApi("/registration/registration-status"));
      setItems(res.data);
    } catch {
      toast("error", "שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generateCode = async (employeeId: string) => {
    setGenerating(employeeId);
    try {
      const res = await api.post(tenantApi("/registration/generate-code"), { employee_id: employeeId });
      toast("success", `קוד נוצר: ${res.data.code}`);
      load();
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה ביצירת קוד"));
    } finally {
      setGenerating(null);
    }
  };

  const bulkGenerate = async () => {
    try {
      const res = await api.post(tenantApi("/registration/generate-bulk-codes"));
      const created = res.data.filter((r: any) => r.code).length;
      toast("success", `נוצרו ${created} קודים`);
      load();
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה"));
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast("success", "הקוד הועתק");
  };

  const filtered = items.filter(i =>
    !search || i.employee_name.includes(search) || i.employee_number.includes(search)
  );

  if (loading) return <TableSkeleton rows={8} cols={5} />;

  const stats = {
    total: items.length,
    registered: items.filter(i => i.status === "רשום").length,
    pending: items.filter(i => i.status === "ממתין לרישום").length,
    expired: items.filter(i => i.status === "פג תוקף").length,
    noCode: items.filter(i => i.status === "ללא קוד").length,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.registered}</p>
          <p className="text-xs text-muted-foreground">רשומים</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          <p className="text-xs text-muted-foreground">ממתינים</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
          <p className="text-xs text-muted-foreground">פג תוקף</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-gray-600">{stats.noCode}</p>
          <p className="text-xs text-muted-foreground">ללא קוד</p>
        </CardContent></Card>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם או מספר..." className="ps-10" />
        </div>
        <Button variant="outline" size="sm" onClick={bulkGenerate}>
          <Users className="me-1 h-4 w-4" />יצירת קודים לכולם
        </Button>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Desktop Table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50 text-sm">
                  <th className="px-4 py-3 text-start font-medium">שם</th>
                  <th className="px-4 py-3 text-start font-medium">מספר</th>
                  <th className="px-4 py-3 text-start font-medium">סטטוס</th>
                  <th className="px-4 py-3 text-start font-medium">קוד</th>
                  <th className="px-4 py-3 text-start font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.employee_id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{item.employee_name}</td>
                    <td className="px-4 py-3 text-sm font-mono">{item.employee_number}</td>
                    <td className="px-4 py-3">
                      <Badge className={statusStyles[item.status] || "bg-gray-100 text-gray-700"}>
                        {item.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {item.code ? (
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono text-lg font-bold tracking-wider">{item.code}</code>
                          <button onClick={() => copyCode(item.code!)} className="p-1 hover:bg-accent rounded min-h-[44px] min-w-[44px] flex items-center justify-center">
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      ) : item.has_user ? (
                        <span className="text-xs text-muted-foreground">{item.user_email}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!item.has_user && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateCode(item.employee_id)}
                          disabled={generating === item.employee_id}
                          className="min-h-[44px]"
                        >
                          <KeyRound className="me-1 h-3 w-3" />
                          {item.code ? "חדש" : "צור קוד"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">אין תוצאות</p>
        ) : filtered.map(item => (
          <Card key={item.employee_id}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm">{item.employee_name}</p>
                    <Badge className={`text-[10px] ${statusStyles[item.status] || "bg-gray-100 text-gray-700"}`}>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{item.employee_number}</p>
                  {item.code && (
                    <div className="flex items-center gap-2 mt-2">
                      <code className="font-mono text-xl font-bold tracking-[0.3em] bg-muted px-3 py-1.5 rounded-lg">{item.code}</code>
                      <button onClick={() => copyCode(item.code!)} className="p-2 hover:bg-accent rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                  {!item.code && item.has_user && (
                    <p className="text-xs text-muted-foreground mt-1">{item.user_email}</p>
                  )}
                </div>
                {!item.has_user && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateCode(item.employee_id)}
                    disabled={generating === item.employee_id}
                    className="min-h-[44px] flex-shrink-0"
                  >
                    <KeyRound className="me-1 h-3 w-3" />
                    {item.code ? "חדש" : "צור קוד"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
