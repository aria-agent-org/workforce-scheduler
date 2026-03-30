import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2, Users, CreditCard, Activity, Plus, Pencil, Power, PowerOff,
  UserX, ArrowRightLeft, Search, RefreshCw,
} from "lucide-react";
import api from "@/lib/api";

import RolePermissionsPage from "../settings/RolePermissionsPage";
import { Shield } from "lucide-react";

type AdminTab = "tenants" | "plans" | "users" | "roles" | "health";

export default function AdminPage() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") as AdminTab | null;
  const [activeTab, setActiveTab] = useState<AdminTab>(tabFromUrl && ["tenants", "plans", "users", "roles", "health"].includes(tabFromUrl) ? tabFromUrl : "tenants");
  const [loading, setLoading] = useState(true);

  // Sync tab with URL
  useEffect(() => {
    if (tabFromUrl && ["tenants", "plans", "users", "roles", "health"].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  // Tenants
  const [tenants, setTenants] = useState<any[]>([]);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [tenantForm, setTenantForm] = useState({ name: "", slug: "", is_active: true });

  // Plans
  const [plans, setPlans] = useState<any[]>([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [planForm, setPlanForm] = useState({ name: "", features: {} as any });

  // Users
  const [users, setUsers] = useState<any[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm, setUserForm] = useState({ email: "", password: "", tenant_id: "", role_definition_id: "" });
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveUserId, setMoveUserId] = useState("");
  const [moveTenantId, setMoveTenantId] = useState("");

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/tenants");
      setTenants(res.data);
    } catch {
      toast("error", "שגיאה בטעינת טננטים");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/plans");
      setPlans(res.data);
    } catch {
      toast("error", "שגיאה בטעינת תוכניות");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/users", { params: { page: usersPage } });
      setUsers(res.data.items || []);
      setUsersTotal(res.data.total || 0);
    } catch {
      toast("error", "שגיאה בטעינת משתמשים");
    } finally {
      setLoading(false);
    }
  }, [usersPage]);

  useEffect(() => {
    if (activeTab === "tenants") loadTenants();
    else if (activeTab === "plans") loadPlans();
    else if (activeTab === "users") loadUsers();
    else setLoading(false);
  }, [activeTab, loadTenants, loadPlans, loadUsers]);

  // Tenant CRUD
  const saveTenant = async () => {
    try {
      if (editingTenant) {
        await api.patch(`/admin/tenants/${editingTenant.id}`, tenantForm);
        toast("success", "טננט עודכן");
      } else {
        await api.post("/admin/tenants", tenantForm);
        toast("success", "טננט נוצר");
      }
      setShowTenantModal(false);
      setEditingTenant(null);
      loadTenants();
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  const toggleTenant = async (t: any) => {
    try {
      await api.patch(`/admin/tenants/${t.id}`, { is_active: !t.is_active });
      toast("success", t.is_active ? "טננט הושבת" : "טננט הופעל");
      loadTenants();
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  // Plan CRUD
  const savePlan = async () => {
    try {
      if (editingPlan) {
        await api.patch(`/admin/plans/${editingPlan.id}`, planForm);
        toast("success", "תוכנית עודכנה");
      } else {
        await api.post("/admin/plans", planForm);
        toast("success", "תוכנית נוצרה");
      }
      setShowPlanModal(false);
      setEditingPlan(null);
      loadPlans();
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  // User CRUD
  const saveUser = async () => {
    try {
      if (editingUser) {
        await api.patch(`/admin/users/${editingUser.id}`, {
          email: userForm.email || undefined,
          tenant_id: userForm.tenant_id || undefined,
          role_definition_id: userForm.role_definition_id || undefined,
        });
        toast("success", "משתמש עודכן");
      } else {
        await api.post("/admin/users", userForm);
        toast("success", "משתמש נוצר");
      }
      setShowUserModal(false);
      setEditingUser(null);
      loadUsers();
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  const deactivateUser = async (userId: string) => {
    try {
      await api.delete(`/admin/users/${userId}`);
      toast("success", "משתמש הושבת");
      loadUsers();
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  const moveTenant = async () => {
    try {
      await api.post(`/admin/users/${moveUserId}/move-tenant`, null, {
        params: { new_tenant_id: moveTenantId || undefined },
      });
      toast("success", "משתמש הועבר");
      setShowMoveModal(false);
      loadUsers();
    } catch (e: any) { toast("error", e.response?.data?.detail || "שגיאה"); }
  };

  const tabs: { key: AdminTab; label: string; icon: any }[] = [
    { key: "tenants", label: "טננטים", icon: Building2 },
    { key: "plans", label: "תוכניות", icon: CreditCard },
    { key: "users", label: "משתמשים", icon: Users },
    { key: "roles", label: "תפקידים והרשאות", icon: Shield },
    { key: "health", label: "בריאות מערכת", icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ניהול מערכת</h1>

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
            <Button size="sm" onClick={() => { setEditingTenant(null); setTenantForm({ name: "", slug: "", is_active: true }); setShowTenantModal(true); }}>
              <Plus className="me-1 h-4 w-4" />טננט חדש
            </Button>
          </div>
          {loading ? <TableSkeleton rows={5} cols={4} /> : (
            <Card><CardContent className="p-0">
              <table className="w-full">
                <thead><tr className="border-b bg-muted/50 text-sm">
                  <th className="px-4 py-3 text-start font-medium">שם</th>
                  <th className="px-4 py-3 text-start font-medium">Slug</th>
                  <th className="px-4 py-3 text-start font-medium">סטטוס</th>
                  <th className="px-4 py-3 text-start font-medium">נוצר</th>
                  <th className="px-4 py-3 text-start font-medium">פעולות</th>
                </tr></thead>
                <tbody>
                  {tenants.map(t => (
                    <tr key={t.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{t.name}</td>
                      <td className="px-4 py-3 font-mono text-sm">{t.slug}</td>
                      <td className="px-4 py-3">
                        <Badge variant={t.is_active ? "success" : "destructive"}>{t.is_active ? "פעיל" : "מושבת"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{t.created_at?.slice(0, 10)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingTenant(t); setTenantForm({ name: t.name, slug: t.slug, is_active: t.is_active }); setShowTenantModal(true); }}>
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
            </CardContent></Card>
          )}
        </div>
      )}

      {/* Plans Tab */}
      {activeTab === "plans" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setEditingPlan(null); setPlanForm({ name: "", features: {} }); setShowPlanModal(true); }}>
              <Plus className="me-1 h-4 w-4" />תוכנית חדשה
            </Button>
          </div>
          {loading ? <TableSkeleton rows={3} cols={3} /> : (
            <div className="grid gap-4 sm:grid-cols-3">
              {plans.map(p => (
                <Card key={p.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{p.name}</CardTitle>
                      <Button variant="ghost" size="icon" onClick={() => { setEditingPlan(p); setPlanForm({ name: p.name, features: p.features || {} }); setShowPlanModal(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {p.features && Object.entries(p.features).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-mono">{String(v)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setEditingUser(null); setUserForm({ email: "", password: "", tenant_id: "", role_definition_id: "" }); setShowUserModal(true); }}>
              <Plus className="me-1 h-4 w-4" />משתמש חדש
            </Button>
          </div>
          {loading ? <TableSkeleton rows={6} cols={6} /> : (
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b bg-muted/50 text-sm">
                    <th className="px-4 py-3 text-start font-medium">אימייל</th>
                    <th className="px-4 py-3 text-start font-medium">טננט</th>
                    <th className="px-4 py-3 text-start font-medium">תפקיד</th>
                    <th className="px-4 py-3 text-start font-medium">סטטוס</th>
                    <th className="px-4 py-3 text-start font-medium">כניסה אחרונה</th>
                    <th className="px-4 py-3 text-start font-medium">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3 text-sm">{u.email}</td>
                        <td className="px-4 py-3 text-sm">{u.tenant_name || "—"}</td>
                        <td className="px-4 py-3"><Badge className="bg-blue-100 text-blue-700">{u.role_name || "—"}</Badge></td>
                        <td className="px-4 py-3">
                          <Badge className={u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                            {u.is_active ? "פעיל" : "מושבת"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{u.last_login?.slice(0, 16) || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setEditingUser(u); setUserForm({ email: u.email, password: "", tenant_id: u.tenant_id || "", role_definition_id: u.role_definition_id || "" }); setShowUserModal(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setMoveUserId(u.id); setMoveTenantId(""); setShowMoveModal(true); }} title="העבר טננט">
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                            {u.is_active && (
                              <Button variant="ghost" size="icon" onClick={() => deactivateUser(u.id)}>
                                <UserX className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent></Card>
          )}
          {usersTotal > 50 && (
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" disabled={usersPage <= 1} onClick={() => setUsersPage(p => p - 1)}>הקודם</Button>
              <span className="text-sm self-center">עמוד {usersPage} מתוך {Math.ceil(usersTotal / 50)}</span>
              <Button variant="outline" size="sm" onClick={() => setUsersPage(p => p + 1)}>הבא</Button>
            </div>
          )}
        </div>
      )}

      {/* Health Tab */}
            {/* Roles & Permissions — System Level */}
      {activeTab === "roles" && <RolePermissionsPage mode="system" />}

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

      {/* Tenant Modal */}
      <Dialog open={showTenantModal} onOpenChange={setShowTenantModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingTenant ? "עריכת טננט" : "טננט חדש"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>שם</Label><Input value={tenantForm.name} onChange={e => setTenantForm({...tenantForm, name: e.target.value})} /></div>
            <div className="space-y-2"><Label>Slug</Label><Input value={tenantForm.slug} onChange={e => setTenantForm({...tenantForm, slug: e.target.value})} dir="ltr" disabled={!!editingTenant} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTenantModal(false)}>ביטול</Button>
            <Button onClick={saveTenant}>{editingTenant ? "עדכן" : "צור"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan Modal */}
      <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingPlan ? "עריכת תוכנית" : "תוכנית חדשה"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>שם</Label><Input value={planForm.name} onChange={e => setPlanForm({...planForm, name: e.target.value})} /></div>
            <div className="space-y-2">
              <Label>תכונות (JSON)</Label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[120px] font-mono"
                dir="ltr"
                value={JSON.stringify(planForm.features, null, 2)}
                onChange={e => { try { setPlanForm({...planForm, features: JSON.parse(e.target.value)}); } catch {} }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanModal(false)}>ביטול</Button>
            <Button onClick={savePlan}>{editingPlan ? "עדכן" : "צור"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingUser ? "עריכת משתמש" : "משתמש חדש"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>אימייל</Label><Input value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} dir="ltr" /></div>
            {!editingUser && (
              <div className="space-y-2"><Label>סיסמה</Label><Input type="password" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} dir="ltr" /></div>
            )}
            <div className="space-y-2">
              <Label>טננט</Label>
              <Select value={userForm.tenant_id} onChange={e => setUserForm({...userForm, tenant_id: e.target.value})}>
                <option value="">ללא טננט</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserModal(false)}>ביטול</Button>
            <Button onClick={saveUser}>{editingUser ? "עדכן" : "צור"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Tenant Modal */}
      <Dialog open={showMoveModal} onOpenChange={setShowMoveModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>העברת משתמש לטננט אחר</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>טננט יעד</Label>
              <Select value={moveTenantId} onChange={e => setMoveTenantId(e.target.value)}>
                <option value="">ללא טננט</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMoveModal(false)}>ביטול</Button>
            <Button onClick={moveTenant}>העבר</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
