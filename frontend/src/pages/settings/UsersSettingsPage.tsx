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
import { Users, Plus, Pencil, Key, UserX, Link, Search, AlertCircle } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

// Hebrew labels for built-in role names
const ROLE_LABELS_HE: Record<string, string> = {
  super_admin: "מנהל מערכת",
  tenant_admin: "מנהל ארגון",
  admin: "מנהל",
  scheduler: "משבץ",
  commander: "מפקד",
  viewer: "צופה",
  soldier: "חייל",
};

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

function getRoleDisplayName(role: any, lang: "he" | "en" = "he"): string {
  // Try label object first (from backend)
  if (role.label) {
    if (typeof role.label === "object" && role.label[lang]) return role.label[lang];
    if (typeof role.label === "string") return role.label;
  }
  // Fall back to our known Hebrew labels
  if (role.name && ROLE_LABELS_HE[role.name]) return ROLE_LABELS_HE[role.name];
  // Last resort: show name as-is
  return role.name || "ללא שם";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

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

  // Validate form and return errors object (empty = valid)
  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!form.email.trim()) {
      errors.email = "אימייל הוא שדה חובה";
    } else if (!isValidEmail(form.email.trim())) {
      errors.email = "פורמט אימייל לא תקין";
    }

    // Password required only on create
    if (!editingUser) {
      if (!form.password) {
        errors.password = "סיסמה היא שדה חובה";
      } else if (form.password.length < 6) {
        errors.password = "סיסמה חייבת להכיל לפחות 6 תווים";
      }
    }

    return errors;
  };

  const saveUser = async () => {
    // Validate
    const errors = validateForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (editingUser) {
        // PATCH: only send changed fields, never send password
        const updatePayload: any = {};
        if (form.email && form.email !== editingUser.email) {
          updatePayload.email = form.email.trim();
        }
        if (form.role_definition_id !== (editingUser.role_definition_id || "")) {
          updatePayload.role_definition_id = form.role_definition_id || null;
        }
        if (form.employee_id !== (editingUser.employee_id || "")) {
          updatePayload.employee_id = form.employee_id || null;
        }
        await api.patch(tenantApi(`/users/${editingUser.id}`), updatePayload);
        toast("success", "משתמש עודכן בהצלחה");
      } else {
        // POST: create new user - send all fields
        const createPayload: any = {
          email: form.email.trim(),
          password: form.password,
        };
        if (form.role_definition_id) {
          createPayload.role_definition_id = form.role_definition_id;
        }
        if (form.employee_id) {
          createPayload.employee_id = form.employee_id;
        }
        await api.post(tenantApi("/users"), createPayload);
        toast("success", "משתמש נוצר בהצלחה");
      }
      setShowModal(false);
      setEditingUser(null);
      setFormErrors({});
      load();
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      if (typeof detail === "string") {
        // Try to map backend error to field
        if (detail.includes("אימייל") || detail.includes("email")) {
          setFormErrors({ email: detail });
        } else if (detail.includes("סיסמה") || detail.includes("password")) {
          setFormErrors({ password: detail });
        } else {
          toast("error", detail);
        }
      } else if (Array.isArray(detail)) {
        // Pydantic validation errors
        const fieldErrors: Record<string, string> = {};
        for (const err of detail) {
          const field = err.loc?.[err.loc.length - 1];
          const msg = err.msg || "שגיאה";
          if (field === "password") {
            fieldErrors.password = msg.includes("at least") ? "סיסמה חייבת להכיל לפחות 6 תווים" : msg;
          } else if (field === "email") {
            fieldErrors.email = "פורמט אימייל לא תקין";
          } else {
            fieldErrors[field] = msg;
          }
        }
        setFormErrors(fieldErrors);
        if (Object.keys(fieldErrors).length === 0) {
          toast("error", "שגיאת ולידציה — בדוק את השדות");
        }
      } else {
        toast("error", "שגיאה ביצירת משתמש");
      }
    } finally {
      setSaving(false);
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
    if (!newPassword || newPassword.length < 6) {
      toast("error", "סיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }
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
    setFormErrors({});
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
    setFormErrors({});
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
        <Button size="sm" onClick={openCreate} className="min-h-[44px]">
          <Plus className="me-1 h-4 w-4" />משתמש חדש
        </Button>
      </div>

      {users.length === 0 && !search ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-lg font-medium">אין משתמשים עדיין</p>
            <p className="text-sm mt-1">צור משתמש ראשון כדי להתחיל</p>
            <Button size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="me-1 h-4 w-4" />צור משתמש ראשון
            </Button>
          </CardContent>
        </Card>
      ) : (
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
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        לא נמצאו משתמשים התואמים לחיפוש
                      </td>
                    </tr>
                  ) : users.map(u => (
                    <tr key={u.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium">{u.email}</td>
                      <td className="px-4 py-3">
                        {u.role_name ? (
                          <Badge className="bg-blue-100 text-blue-700">
                            {u.role_label?.he || ROLE_LABELS_HE[u.role_name] || u.role_name}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">ללא תפקיד</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{u.employee_name || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3">
                        <Badge className={u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                          {u.is_active ? "פעיל" : "מושבת"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="min-h-[36px] min-w-[36px]" onClick={() => openEdit(u)} title="ערוך">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="min-h-[36px] min-w-[36px]" onClick={() => { setResetUserId(u.id); setNewPassword(""); setShowResetModal(true); }} title="אפס סיסמה">
                            <Key className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="min-h-[36px] min-w-[36px]" onClick={() => { setLinkUserId(u.id); setLinkEmployeeId(u.employee_id || ""); setShowLinkModal(true); }} title="קשר חייל">
                            <Link className="h-3.5 w-3.5" />
                          </Button>
                          {u.is_active && (
                            <Button variant="ghost" size="icon" className="min-h-[36px] min-w-[36px]" onClick={() => deactivateUser(u.id)} title="השבת">
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
      )}

      {total > 50 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>הקודם</Button>
          <span className="text-sm self-center">עמוד {page} מתוך {Math.ceil(total / 50)}</span>
          <Button variant="outline" size="sm" disabled={users.length < 50} onClick={() => setPage(p => p + 1)}>הבא</Button>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(open) => { setShowModal(open); if (!open) { setFormErrors({}); setEditingUser(null); } }}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {editingUser ? "✏️ עריכת משתמש" : "➕ משתמש חדש"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Email */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                אימייל <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.email}
                onChange={e => {
                  setForm({ ...form, email: e.target.value });
                  if (formErrors.email) setFormErrors(prev => ({ ...prev, email: "" }));
                }}
                dir="ltr"
                placeholder="user@example.com"
                className={`min-h-[44px] ${formErrors.email ? "border-red-500 ring-1 ring-red-500" : ""}`}
                autoFocus={!editingUser}
              />
              {formErrors.email && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {formErrors.email}
                </p>
              )}
            </div>

            {/* Password — only for create */}
            {!editingUser && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  סיסמה <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={e => {
                    setForm({ ...form, password: e.target.value });
                    if (formErrors.password) setFormErrors(prev => ({ ...prev, password: "" }));
                  }}
                  dir="ltr"
                  placeholder="לפחות 6 תווים"
                  className={`min-h-[44px] ${formErrors.password ? "border-red-500 ring-1 ring-red-500" : ""}`}
                />
                {formErrors.password && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    {formErrors.password}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">מינימום 6 תווים</p>
              </div>
            )}

            {/* Role */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">תפקיד מערכת</Label>
              <Select
                value={form.role_definition_id}
                onChange={e => setForm({ ...form, role_definition_id: e.target.value })}
                className="min-h-[44px]"
              >
                <option value="">ללא תפקיד (בסיסי)</option>
                {roles.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {getRoleDisplayName(r)}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                התפקיד קובע את ההרשאות של המשתמש במערכת
              </p>
            </div>

            {/* Link to Soldier */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">קישור לחייל</Label>
              <Select
                value={form.employee_id}
                onChange={e => setForm({ ...form, employee_id: e.target.value })}
                className="min-h-[44px]"
              >
                <option value="">ללא קישור</option>
                {employees.map((emp: any) => {
                  const linkedUser = users.find(u => u.employee_id === emp.id && u.id !== editingUser?.id);
                  return (
                    <option key={emp.id} value={emp.id} disabled={!!linkedUser}>
                      {emp.full_name} ({emp.employee_number}){linkedUser ? ` — כבר מקושר ל-${linkedUser.email}` : ""}
                    </option>
                  );
                })}
              </Select>
              <p className="text-xs text-muted-foreground">
                קישור חייל מאפשר למשתמש לצפות בלוח המשימות שלו
              </p>
            </div>

            {/* General form error */}
            {formErrors._general && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                {formErrors._general}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowModal(false); setFormErrors({}); }} className="min-h-[44px]">
              ביטול
            </Button>
            <Button onClick={saveUser} disabled={saving} className="min-h-[44px]">
              {saving ? "שומר..." : editingUser ? "💾 עדכן משתמש" : "➕ צור משתמש"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader><DialogTitle>🔑 איפוס סיסמה</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                סיסמה חדשה <span className="text-red-500">*</span>
              </Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                dir="ltr"
                placeholder="לפחות 6 תווים"
                className="min-h-[44px]"
              />
              <p className="text-xs text-muted-foreground">מינימום 6 תווים</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetModal(false)} className="min-h-[44px]">ביטול</Button>
            <Button onClick={resetPassword} disabled={!newPassword || newPassword.length < 6} className="min-h-[44px]">
              עדכן סיסמה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Soldier Modal */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent className="max-w-[450px]">
          <DialogHeader><DialogTitle>🔗 קישור לחייל</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">חייל</Label>
              <Select value={linkEmployeeId} onChange={e => setLinkEmployeeId(e.target.value)} className="min-h-[44px]">
                <option value="">ללא קישור</option>
                {employees.map((e: any) => {
                  const linkedUser = users.find(u => u.employee_id === e.id && u.id !== linkUserId);
                  return (
                    <option key={e.id} value={e.id} disabled={!!linkedUser}>
                      {e.full_name} ({e.employee_number}){linkedUser ? ` ⚠️ מקושר ל-${linkedUser.email}` : ""}
                    </option>
                  );
                })}
              </Select>
            </div>
            {linkEmployeeId && (() => {
              const linkedUser = users.find(u => u.employee_id === linkEmployeeId && u.id !== linkUserId);
              if (!linkedUser) return null;
              return (
                <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 text-sm text-yellow-700 dark:text-yellow-300">
                  ⚠️ חייל זה כבר מקושר למשתמש <strong>{linkedUser.email}</strong>. קישור חדש ייכשל.
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkModal(false)} className="min-h-[44px]">ביטול</Button>
            <Button onClick={linkSoldier} className="min-h-[44px]">שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
