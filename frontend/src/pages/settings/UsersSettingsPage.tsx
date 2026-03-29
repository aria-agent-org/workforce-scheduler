import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Users, Plus, Pencil, Key, UserX, Link, Search } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

interface TenantUser {
  id: string;
  email: string;
  role_definition_id: string | null;
  role_name: string | null;
  role_label: any;
  employee_id: string | null;
  employee_name: string | null;
  preferred_language: string;
  is_active: boolean;
  two_factor_enabled: boolean;
  last_login: string | null;
  active_sessions: number;
  created_at: string;
}

export default function UsersSettingsPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [form, setForm] = useState({ email: "", password: "", role_definition_id: "", employee_id: "" });

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetUserId, setResetUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUserId, setLinkUserId] = useState("");
  const [linkEmployeeId, setLinkEmployeeId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, empsRes] = await Promise.all([
        api.get(tenantApi("/users"), { params: { page, search: search || undefined } }),
        api.get(tenantApi("/settings/role-definitions")),
        api.get(tenantApi("/employees"), { params: { page_size: 200 } }),
      ]);
      setUsers(usersRes.data.items || []);
      setTotal(usersRes.data.total || 0);
      setRoles(rolesRes.data);
      setEmployees(empsRes.data.items || []);
    } catch {
      toast("error", "שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const saveUser = async () => {
    try {
      if (editingUser) {
        await api.patch(tenantApi(`/users/${editingUser.id}`), {
          email: form.email || undefined,
          role_definition_id: form.role_definition_id || undefined,
          employee_id: form.employee_id || undefined,
        });
        toast("success", "משתמש עודכן");
      } else {
        await api.post(tenantApi("/users"), form);
        toast("success", "משתמש נוצר");
      }
      setShowModal(false);
      setEditingUser(null);
      load();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const deactivateUser = async (userId: string) => {
    try {
      await api.delete(tenantApi(`/users/${userId}`));
      toast("success", "משתמש הושבת");
      load();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const resetPassword = async () => {
    try {
      await api.post(tenantApi(`/users/${resetUserId}/reset-password`), { new_password: newPassword });
      toast("success", "סיסמה עודכנה");
      setShowResetModal(false);
      setNewPassword("");
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const linkSoldier = async () => {
    try {
      await api.post(tenantApi(`/users/${linkUserId}/link-soldier`), null, {
        params: { employee_id: linkEmployeeId || undefined },
      });
      toast("success", "קישור עודכן");
      setShowLinkModal(false);
      load();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const openCreate = () => {
    setEditingUser(null);
    setForm({ email: "", password: "", role_definition_id: "", employee_id: "" });
    setShowModal(true);
  };

  const openEdit = (u: TenantUser) => {
    setEditingUser(u);
    setForm({
      email: u.email,
      password: "",
      role_definition_id: u.role_definition_id || "",
      employee_id: u.employee_id || "",
    });
    setShowModal(true);
  };

  if (loading) return <TableSkeleton rows={6} cols={5} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש לפי אימייל..." className="ps-10" />
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="me-1 h-4 w-4" />משתמש חדש
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50 text-sm">
                  <th className="px-4 py-3 text-start font-medium">אימייל</th>
                  <th className="px-4 py-3 text-start font-medium">תפקיד</th>
                  <th className="px-4 py-3 text-start font-medium">חייל מקושר</th>
                  <th className="px-4 py-3 text-start font-medium">סטטוס</th>
                  <th className="px-4 py-3 text-start font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.role_label ? (
                        <Badge className="bg-blue-100 text-blue-700">{u.role_label?.he || u.role_name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">{u.employee_name || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                        {u.is_active ? "פעיל" : "מושבת"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="ערוך">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setResetUserId(u.id); setShowResetModal(true); }} title="אפס סיסמה">
                          <Key className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setLinkUserId(u.id); setLinkEmployeeId(u.employee_id || ""); setShowLinkModal(true); }} title="קשר חייל">
                          <Link className="h-3.5 w-3.5" />
                        </Button>
                        {u.is_active && (
                          <Button variant="ghost" size="icon" onClick={() => deactivateUser(u.id)} title="השבת">
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
        </CardContent>
      </Card>

      {total > 50 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>הקודם</Button>
          <span className="text-sm self-center">עמוד {page}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>הבא</Button>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingUser ? "עריכת משתמש" : "משתמש חדש"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>אימייל</Label>
              <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} dir="ltr" />
            </div>
            {!editingUser && (
              <div className="space-y-2">
                <Label>סיסמה</Label>
                <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} dir="ltr" />
              </div>
            )}
            <div className="space-y-2">
              <Label>תפקיד מערכת</Label>
              <Select value={form.role_definition_id} onChange={e => setForm({ ...form, role_definition_id: e.target.value })}>
                <option value="">ללא תפקיד</option>
                {roles.map((r: any) => <option key={r.id} value={r.id}>{r.label?.he || r.name}</option>)}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>קישור לחייל</Label>
              <Select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">ללא קישור</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_number})</option>)}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>ביטול</Button>
            <Button onClick={saveUser}>{editingUser ? "עדכן" : "צור"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>איפוס סיסמה</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>סיסמה חדשה</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} dir="ltr" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetModal(false)}>ביטול</Button>
            <Button onClick={resetPassword}>עדכן סיסמה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Soldier Modal */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>קישור לחייל</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>חייל</Label>
              <Select value={linkEmployeeId} onChange={e => setLinkEmployeeId(e.target.value)}>
                <option value="">ללא קישור</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_number})</option>)}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkModal(false)}>ביטול</Button>
            <Button onClick={linkSoldier}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
