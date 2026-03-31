/**
 * Role Definitions & Permissions page — used both in tenant Settings and system Admin.
 * Shows a full permission matrix for creating/editing custom roles.
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Shield, Plus, Pencil, Trash2, Users, Check, X, Lock } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";

// ═══════════════════════════════════════════
// Permission Matrix Configuration
// ═══════════════════════════════════════════

const RESOURCES = [
  { key: "soldiers", label: { he: "חיילים", en: "Soldiers" }, icon: "👥" },
  { key: "missions", label: { he: "משימות", en: "Missions" }, icon: "📋" },
  { key: "rules", label: { he: "חוקים", en: "Rules" }, icon: "📏" },
  { key: "attendance", label: { he: "נוכחות", en: "Attendance" }, icon: "✅" },
  { key: "settings", label: { he: "הגדרות", en: "Settings" }, icon: "⚙️" },
  { key: "reports", label: { he: "דוחות", en: "Reports" }, icon: "📊" },
  { key: "audit_log", label: { he: "יומן פעולות", en: "Audit Log" }, icon: "📝" },
  { key: "notifications", label: { he: "התראות", en: "Notifications" }, icon: "🔔" },
  { key: "users", label: { he: "משתמשים", en: "Users" }, icon: "👤" },
] as const;

const ACTIONS = [
  { key: "read", label: { he: "צפייה", en: "View" } },
  { key: "write", label: { he: "עריכה", en: "Edit" } },
  { key: "delete", label: { he: "מחיקה", en: "Delete" } },
  { key: "approve", label: { he: "אישור", en: "Approve" } },
  { key: "export", label: { he: "ייצוא", en: "Export" } },
] as const;

const SPECIAL_PERMISSIONS = [
  { key: "override_soft", label: { he: "עקיפת חוקים רכים", en: "Override Soft Rules" } },
  { key: "override_hard", label: { he: "עקיפת חוקים קשים", en: "Override Hard Rules" } },
] as const;

// System roles that cannot be edited
const SYSTEM_ROLE_NAMES = ["super_admin", "tenant_admin", "scheduler", "viewer"];

interface RoleDefinition {
  id: string;
  name: string;
  label: { he?: string; en?: string };
  permissions: Record<string, any>;
  ui_visibility?: Record<string, any> | null;
  is_system: boolean;
  tenant_id?: string | null;
  tenant_name?: string | null;
  user_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface Props {
  /** "tenant" = Settings page (scoped to tenant), "system" = Admin page (all tenants) */
  mode: "tenant" | "system";
}

export default function RolePermissionsPage({ mode }: Props) {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const lang = (i18n.language || "he") as "he" | "en";

  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formLabelHe, setFormLabelHe] = useState("");
  const [formLabelEn, setFormLabelEn] = useState("");
  const [formPermissions, setFormPermissions] = useState<Record<string, string[]>>({});
  const [formOverrideSoft, setFormOverrideSoft] = useState(false);
  const [formOverrideHard, setFormOverrideHard] = useState(false);

  // API paths differ based on mode
  const apiBase = mode === "system" ? "/admin" : tenantApi("/settings");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`${apiBase}/role-definitions`);
      setRoles(res.data);
    } catch (e) {
      toast("error", "שגיאה בטעינת תפקידים");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  // ═══════════════════════════════════════════
  // Permission Matrix Helpers
  // ═══════════════════════════════════════════

  const isChecked = (resource: string, action: string): boolean => {
    return (formPermissions[resource] || []).includes(action);
  };

  const togglePermission = (resource: string, action: string) => {
    setFormPermissions(prev => {
      const current = prev[resource] || [];
      if (current.includes(action)) {
        return { ...prev, [resource]: current.filter(a => a !== action) };
      }
      // If adding write/delete/approve/export, auto-add read
      const newActions = [...current, action];
      if (action !== "read" && !newActions.includes("read")) {
        newActions.push("read");
      }
      return { ...prev, [resource]: newActions };
    });
  };

  const toggleResourceAll = (resource: string) => {
    const current = formPermissions[resource] || [];
    const allActions = ACTIONS.map(a => a.key);
    if (current.length === allActions.length) {
      setFormPermissions(prev => ({ ...prev, [resource]: [] }));
    } else {
      setFormPermissions(prev => ({ ...prev, [resource]: [...allActions] }));
    }
  };

  const toggleActionAll = (action: string) => {
    const allHave = RESOURCES.every(r => (formPermissions[r.key] || []).includes(action));
    setFormPermissions(prev => {
      const next = { ...prev };
      for (const r of RESOURCES) {
        const current = next[r.key] || [];
        if (allHave) {
          next[r.key] = current.filter(a => a !== action);
        } else {
          if (!current.includes(action)) {
            next[r.key] = [...current, action];
            // Auto-add read when adding other actions
            if (action !== "read" && !next[r.key].includes("read")) {
              next[r.key].push("read");
            }
          }
        }
      }
      return next;
    });
  };

  const selectAllPermissions = () => {
    const allActions = ACTIONS.map(a => a.key);
    const perms: Record<string, string[]> = {};
    for (const r of RESOURCES) {
      perms[r.key] = [...allActions];
    }
    setFormPermissions(perms);
    setFormOverrideSoft(true);
    setFormOverrideHard(false);
  };

  const clearAllPermissions = () => {
    setFormPermissions({});
    setFormOverrideSoft(false);
    setFormOverrideHard(false);
  };

  // ═══════════════════════════════════════════
  // CRUD
  // ═══════════════════════════════════════════

  const openCreate = () => {
    setEditingRole(null);
    setFormName("");
    setFormLabelHe("");
    setFormLabelEn("");
    setFormPermissions({});
    setFormOverrideSoft(false);
    setFormOverrideHard(false);
    setShowModal(true);
  };

  const openEdit = (role: RoleDefinition) => {
    setEditingRole(role);
    setFormName(role.name);
    setFormLabelHe(role.label?.he || "");
    setFormLabelEn(role.label?.en || "");
    // Parse permissions
    const perms: Record<string, string[]> = {};
    for (const r of RESOURCES) {
      if (Array.isArray(role.permissions?.[r.key])) {
        perms[r.key] = [...role.permissions[r.key]];
      }
    }
    setFormPermissions(perms);
    setFormOverrideSoft(!!role.permissions?.override_soft);
    setFormOverrideHard(!!role.permissions?.override_hard);
    setShowModal(true);
  };

  const save = async () => {
    if (!formName.trim()) { toast("error", "יש למלא שם תפקיד"); return; }
    if (!formLabelHe.trim()) { toast("error", "יש למלא שם בעברית"); return; }

    setSaving(true);
    try {
      const permissions: Record<string, any> = { ...formPermissions };
      permissions.override_soft = formOverrideSoft;
      permissions.override_hard = formOverrideHard;

      const body = {
        name: formName.trim(),
        label: { he: formLabelHe.trim(), en: formLabelEn.trim() || formLabelHe.trim() },
        permissions,
      };

      if (editingRole) {
        await api.patch(`${apiBase}/role-definitions/${editingRole.id}`, body);
        toast("success", "תפקיד עודכן בהצלחה");
      } else {
        await api.post(`${apiBase}/role-definitions`, body);
        toast("success", "תפקיד נוצר בהצלחה");
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בשמירה"));
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (role: RoleDefinition) => {
    if (!confirm(`למחוק את התפקיד "${role.label?.[lang] || role.name}"?`)) return;
    try {
      await api.delete(`${apiBase}/role-definitions/${role.id}`);
      toast("success", "תפקיד נמחק");
      load();
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה במחיקה"));
    }
  };

  // ═══════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">טוען תפקידים...</div>;
  }

  const systemRoles = roles.filter(r => r.is_system);
  const customRoles = roles.filter(r => !r.is_system);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {mode === "system" ? "תפקידים והרשאות (מערכת)" : "תפקידים והרשאות"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "system"
              ? "נהל תפקידים והרשאות ברמת המערכת עבור כל הטננטים"
              : "צור תפקידים מותאמים עם הרשאות מדויקות"}
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="min-h-[44px]">
          <Plus className="me-1 h-4 w-4" />תפקיד חדש
        </Button>
      </div>

      {/* System Roles */}
      {systemRoles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-1">
            <Lock className="h-3 w-3" /> תפקידי מערכת (לקריאה בלבד)
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {systemRoles.map(role => (
              <Card key={role.id} className="bg-muted/30 border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <Shield className="h-4 w-4 text-gray-500" />
                      </div>
                      <div>
                        <h4 className="font-medium text-sm">{role.label?.[lang] || role.name}</h4>
                        <p className="text-[11px] text-muted-foreground font-mono">{role.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {role.user_count !== undefined && (
                        <Badge variant="outline" className="text-[10px]">
                          <Users className="h-3 w-3 me-1" />{role.user_count}
                        </Badge>
                      )}
                      <Badge>מערכת</Badge>
                    </div>
                  </div>
                  {/* Show permissions summary */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {RESOURCES.filter(r => {
                      const perms = role.permissions?.[r.key];
                      return Array.isArray(perms) && perms.length > 0;
                    }).map(r => (
                      <span key={r.key} className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                        {r.icon} {r.label[lang]}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Custom Roles */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-muted-foreground">
          תפקידים מותאמים ({customRoles.length})
        </h3>
        {customRoles.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium">אין תפקידים מותאמים</p>
              <p className="text-sm mt-1">צור תפקיד חדש כדי להגדיר הרשאות מדויקות</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {customRoles.map(role => {
              const permCount = RESOURCES.reduce((sum, r) => {
                const perms = role.permissions?.[r.key];
                return sum + (Array.isArray(perms) ? perms.length : 0);
              }, 0);
              return (
                <Card key={role.id} className="hover:shadow-md transition-shadow group">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                          <Shield className="h-4 w-4 text-primary-500" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">{role.label?.[lang] || role.name}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-muted-foreground font-mono">{role.name}</span>
                            <span className="text-[10px] text-muted-foreground">{permCount} הרשאות</span>
                            {mode === "system" && role.tenant_name && (
                              <Badge variant="outline" className="text-[10px]">{role.tenant_name}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {role.user_count !== undefined && (
                          <Badge variant="outline" className="text-[10px]">
                            <Users className="h-3 w-3 me-1" />{role.user_count}
                          </Badge>
                        )}
                        {role.permissions?.override_soft && (
                          <Badge className="bg-amber-100 text-amber-700 text-[10px]">חוקים רכים</Badge>
                        )}
                        {role.permissions?.override_hard && (
                          <Badge className="bg-red-100 text-red-700 text-[10px]">חוקים קשים</Badge>
                        )}
                        <Button
                          size="sm" variant="ghost"
                          className="opacity-0 group-hover:opacity-100 transition-opacity min-h-[40px] min-w-[40px]"
                          onClick={() => openEdit(role)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="opacity-0 group-hover:opacity-100 transition-opacity min-h-[40px] min-w-[40px]"
                          onClick={() => deleteRole(role)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                    {/* Permissions summary */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {RESOURCES.filter(r => {
                        const perms = role.permissions?.[r.key];
                        return Array.isArray(perms) && perms.length > 0;
                      }).map(r => {
                        const perms = role.permissions[r.key] as string[];
                        return (
                          <span key={r.key} className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
                            {r.icon} {r.label[lang]} ({perms.length})
                          </span>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* Permission Matrix Modal */}
      {/* ═══════════════════════════════════════════ */}
      <Dialog open={showModal} onOpenChange={(open) => { setShowModal(open); if (!open) setEditingRole(null); }}>
        <DialogContent className="max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {editingRole ? `✏️ עריכת תפקיד — ${editingRole.label?.[lang] || editingRole.name}` : "➕ תפקיד חדש"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-muted-foreground">📝 פרטי התפקיד</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">מזהה (אנגלית) <span className="text-red-500">*</span></Label>
                  <Input
                    value={formName}
                    onChange={e => setFormName(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                    placeholder="custom_role"
                    dir="ltr"
                    className="min-h-[44px] font-mono text-sm"
                    disabled={!!editingRole}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">שם (עברית) <span className="text-red-500">*</span></Label>
                  <Input
                    value={formLabelHe}
                    onChange={e => setFormLabelHe(e.target.value)}
                    placeholder="למשל: מפקד פלוגה"
                    className="min-h-[44px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">שם (אנגלית)</Label>
                  <Input
                    value={formLabelEn}
                    onChange={e => setFormLabelEn(e.target.value)}
                    placeholder="e.g. Company Commander"
                    dir="ltr"
                    className="min-h-[44px]"
                  />
                </div>
              </div>
            </div>

            {/* Permission Matrix */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-muted-foreground">🔐 מטריצת הרשאות</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllPermissions}
                    className="text-[11px] text-primary-500 hover:underline"
                  >
                    בחר הכל
                  </button>
                  <span className="text-muted-foreground">|</span>
                  <button
                    type="button"
                    onClick={clearAllPermissions}
                    className="text-[11px] text-red-500 hover:underline"
                  >
                    נקה הכל
                  </button>
                </div>
              </div>

              {/* Matrix Table */}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="px-3 py-2.5 text-start font-semibold text-xs min-w-[140px]">משאב</th>
                      {ACTIONS.map(action => (
                        <th key={action.key} className="px-2 py-2.5 text-center font-semibold text-xs min-w-[60px]">
                          <button
                            type="button"
                            onClick={() => toggleActionAll(action.key)}
                            className="hover:text-primary-500 transition-colors"
                            title={`סמן/בטל הכל — ${action.label[lang]}`}
                          >
                            {action.label[lang]}
                          </button>
                        </th>
                      ))}
                      <th className="px-2 py-2.5 text-center text-xs min-w-[50px]">הכל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RESOURCES.map((resource, idx) => {
                      const resourcePerms = formPermissions[resource.key] || [];
                      const allChecked = ACTIONS.every(a => resourcePerms.includes(a.key));
                      return (
                        <tr
                          key={resource.key}
                          className={`border-t transition-colors ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'} hover:bg-primary-50/50 dark:hover:bg-primary-900/10`}
                        >
                          <td className="px-3 py-2.5">
                            <span className="flex items-center gap-1.5 text-xs font-medium">
                              <span>{resource.icon}</span>
                              {resource.label[lang]}
                            </span>
                          </td>
                          {ACTIONS.map(action => (
                            <td key={action.key} className="px-2 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => togglePermission(resource.key, action.key)}
                                className={`h-7 w-7 rounded-md border-2 inline-flex items-center justify-center transition-all active:scale-90 ${
                                  isChecked(resource.key, action.key)
                                    ? 'bg-primary-500 border-primary-500 text-white'
                                    : 'border-gray-300 dark:border-gray-600 hover:border-primary-300'
                                }`}
                              >
                                {isChecked(resource.key, action.key) && <Check className="h-3.5 w-3.5" />}
                              </button>
                            </td>
                          ))}
                          <td className="px-2 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => toggleResourceAll(resource.key)}
                              className={`h-7 w-7 rounded-md border-2 inline-flex items-center justify-center transition-all active:scale-90 ${
                                allChecked
                                  ? 'bg-green-500 border-green-500 text-white'
                                  : 'border-gray-300 dark:border-gray-600 hover:border-green-300'
                              }`}
                            >
                              {allChecked && <Check className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Special Permissions */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-muted-foreground">⚡ הרשאות מיוחדות</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-all ${
                    formOverrideSoft ? 'ring-2 ring-amber-400 border-amber-300 bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formOverrideSoft}
                    onChange={e => setFormOverrideSoft(e.target.checked)}
                    className="rounded accent-amber-500 h-4 w-4"
                  />
                  <div>
                    <p className="font-medium text-sm">⚠️ עקיפת חוקים רכים</p>
                    <p className="text-[11px] text-muted-foreground">מאפשר לעקוף כללי שיבוץ רכים (מנוחה, העדפות)</p>
                  </div>
                </label>
                <label
                  className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-all ${
                    formOverrideHard ? 'ring-2 ring-red-400 border-red-300 bg-red-50 dark:bg-red-900/20' : 'hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formOverrideHard}
                    onChange={e => setFormOverrideHard(e.target.checked)}
                    className="rounded accent-red-500 h-4 w-4"
                  />
                  <div>
                    <p className="font-medium text-sm">🚫 עקיפת חוקים קשים</p>
                    <p className="text-[11px] text-muted-foreground">מאפשר לעקוף כללי שיבוץ קשים (מסוכן — השתמש בזהירות)</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Permissions Summary */}
            <div className="rounded-lg bg-muted/30 border p-3">
              <p className="text-xs font-bold text-muted-foreground mb-2">📋 סיכום הרשאות:</p>
              <div className="flex flex-wrap gap-1">
                {RESOURCES.map(r => {
                  const perms = formPermissions[r.key] || [];
                  if (perms.length === 0) return null;
                  return (
                    <span key={r.key} className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
                      {r.icon} {r.label[lang]}: {perms.map(p => {
                        const act = ACTIONS.find(a => a.key === p);
                        return act?.label[lang] || p;
                      }).join(", ")}
                    </span>
                  );
                })}
                {formOverrideSoft && (
                  <span className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-700 px-1.5 py-0.5 rounded-full">⚠️ חוקים רכים</span>
                )}
                {formOverrideHard && (
                  <span className="text-[10px] bg-red-50 dark:bg-red-900/30 text-red-700 px-1.5 py-0.5 rounded-full">🚫 חוקים קשים</span>
                )}
                {Object.values(formPermissions).every(v => v.length === 0) && !formOverrideSoft && !formOverrideHard && (
                  <span className="text-[10px] text-muted-foreground">אין הרשאות — התפקיד ללא גישה</span>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)} className="min-h-[44px]">
              ביטול
            </Button>
            <Button onClick={save} disabled={saving} className="min-h-[44px]">
              {saving ? "שומר..." : editingRole ? "💾 עדכן תפקיד" : "➕ צור תפקיד"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
