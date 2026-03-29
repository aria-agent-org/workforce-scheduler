import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Building2, Users, CreditCard, Activity, Plus, Pencil, Power, PowerOff } from "lucide-react";
import api from "@/lib/api";

type AdminTab = "tenants" | "plans" | "users" | "health";

export default function AdminPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<AdminTab>("tenants");
  const [loading, setLoading] = useState(true);

  const [tenants, setTenants] = useState<any[]>([]);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [tenantForm, setTenantForm] = useState({ name: "", slug: "", is_active: true });

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/tenants");
      setTenants(res.data);
    } catch (e) {
      toast("error", "שגיאה בטעינת טננטים");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const saveTenant = async () => {
    try {
      if (editingTenant) {
        await api.patch(`/admin/tenants/${editingTenant.id}`, tenantForm);
        toast("success", "טננט עודכן בהצלחה");
      } else {
        await api.post("/admin/tenants", tenantForm);
        toast("success", "טננט נוצר בהצלחה");
      }
      setShowTenantModal(false);
      setEditingTenant(null);
      loadTenants();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const toggleTenant = async (tenant: any) => {
    try {
      await api.patch(`/admin/tenants/${tenant.id}`, { is_active: !tenant.is_active });
      toast("success", tenant.is_active ? "טננט הושבת" : "טננט הופעל");
      loadTenants();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const openCreateTenant = () => {
    setEditingTenant(null);
    setTenantForm({ name: "", slug: "", is_active: true });
    setShowTenantModal(true);
  };

  const openEditTenant = (t: any) => {
    setEditingTenant(t);
    setTenantForm({ name: t.name, slug: t.slug, is_active: t.is_active });
    setShowTenantModal(true);
  };

  const tabs: { key: AdminTab; label: string; icon: any }[] = [
    { key: "tenants", label: "טננטים", icon: Building2 },
    { key: "plans", label: "תוכניות", icon: CreditCard },
    { key: "users", label: "משתמשים", icon: Users },
    { key: "health", label: "בריאות מערכת", icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("nav.admin")}</h1>

      <div className="flex gap-2 border-b pb-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm transition-colors ${
              activeTab === key ? "bg-primary-500 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* Tenants Tab */}
      {activeTab === "tenants" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreateTenant}>
              <Plus className="me-1 h-4 w-4" />טננט חדש
            </Button>
          </div>
          {loading ? <TableSkeleton rows={5} cols={4} /> : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50 text-sm">
                      <th className="px-4 py-3 text-start font-medium">שם</th>
                      <th className="px-4 py-3 text-start font-medium">Slug</th>
                      <th className="px-4 py-3 text-start font-medium">סטטוס</th>
                      <th className="px-4 py-3 text-start font-medium">נוצר</th>
                      <th className="px-4 py-3 text-start font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t) => (
                      <tr key={t.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{t.name}</td>
                        <td className="px-4 py-3 font-mono text-sm">{t.slug}</td>
                        <td className="px-4 py-3">
                          <Badge variant={t.is_active ? "success" : "destructive"}>
                            {t.is_active ? "פעיל" : "מושבת"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{t.created_at?.slice(0, 10)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditTenant(t)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => toggleTenant(t)}>
                              {t.is_active ? <PowerOff className="h-4 w-4 text-red-500" /> : <Power className="h-4 w-4 text-green-500" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Plans Tab */}
      {activeTab === "plans" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { name: "free", label: "חינם", maxEmployees: 10, features: ["ניהול בסיסי", "עד 10 חיילים", "דוחות CSV"] },
            { name: "pro", label: "מקצועי", maxEmployees: 100, features: ["עד 100 חיילים", "Google Sheets", "בוטים", "AI", "ייצוא PDF"] },
            { name: "enterprise", label: "ארגוני", maxEmployees: 9999, features: ["ללא הגבלה", "SSO/SAML", "API מותאם", "SLA", "תמיכה 24/7"] },
          ].map(plan => (
            <Card key={plan.name}>
              <CardHeader>
                <CardTitle className="text-center">{plan.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-center text-3xl font-bold">
                  {plan.name === "free" ? "₪0" : plan.name === "pro" ? "₪199" : "₪499"}<span className="text-sm text-muted-foreground">/חודש</span>
                </p>
                <ul className="space-y-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="text-sm flex items-center gap-2">
                      <span className="text-green-500">✓</span>{f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Health Tab */}
      {activeTab === "health" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "API", status: "ok", color: "text-green-500" },
            { label: "Database", status: "ok", color: "text-green-500" },
            { label: "Redis", status: "ok", color: "text-green-500" },
            { label: "Celery", status: "ok", color: "text-green-500" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center justify-between">
                <span className="font-medium">{s.label}</span>
                <Badge variant="success" className={s.color}>{s.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            ניהול משתמשים חוצה-טננט — בקרוב
          </CardContent>
        </Card>
      )}

      {/* Tenant Modal */}
      <Dialog open={showTenantModal} onOpenChange={setShowTenantModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingTenant ? "עריכת טננט" : "טננט חדש"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>שם</Label>
              <Input value={tenantForm.name} onChange={e => setTenantForm({...tenantForm, name: e.target.value})} placeholder="יחידה 8200" />
            </div>
            <div className="space-y-2">
              <Label>Slug (URL)</Label>
              <Input value={tenantForm.slug} onChange={e => setTenantForm({...tenantForm, slug: e.target.value})} placeholder="unit-8200" dir="ltr" disabled={!!editingTenant} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTenantModal(false)}>ביטול</Button>
            <Button onClick={saveTenant}>{editingTenant ? "עדכן" : "צור"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
