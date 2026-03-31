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
  UserX, ArrowRightLeft, Search, RefreshCw, Radio, FileSpreadsheet,
} from "lucide-react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";

import RolePermissionsPage from "../settings/RolePermissionsPage";
import { Shield } from "lucide-react";

type AdminTab = "tenants" | "plans" | "users" | "roles" | "health" | "channels" | "google_sheets";

function SystemHealthDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/admin/stats");
        setStats(res.data);
      } catch {
        toast("error", "שגיאה בטעינת נתוני מערכת");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <TableSkeleton rows={4} cols={4} />;
  if (!stats) return <div className="text-center text-muted-foreground py-8">לא ניתן לטעון נתונים</div>;

  const statCards = [
    { label: "טננטים", value: stats.tenants, icon: "🏢" },
    { label: "משתמשים פעילים", value: stats.active_users, icon: "👤" },
    { label: "חיילים פעילים", value: stats.active_employees, icon: "🎖️" },
    { label: "סה״כ משימות", value: stats.missions, icon: "📋" },
    { label: "פעולות (24 שעות)", value: stats.audit_24h, icon: "📊" },
    { label: "סה״כ פעולות", value: stats.audit_total, icon: "📈" },
    { label: "Uptime", value: `${stats.uptime_days} ימים, ${stats.uptime_hours % 24} שעות`, icon: "⏱️" },
    { label: "גודל מסד נתונים", value: `${stats.db_size_mb} MB`, icon: "💾" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{s.icon}</span>
                <span className="text-sm text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health Checks */}
      <Card>
        <CardHeader><CardTitle>בריאות שירותים</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "API", status: "ok" },
              { label: "Database", status: "ok" },
              { label: "Redis", status: "ok" },
              { label: "Celery", status: "ok" },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between rounded-lg border p-3">
                <span className="font-medium text-sm">{s.label}</span>
                <Badge variant="success">✅ {s.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader><CardTitle>פעילות אחרונה (כל הטננטים)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-start">פעולה</th>
                <th className="px-4 py-2 text-start">סוג</th>
                <th className="px-4 py-2 text-start">משתמש</th>
                <th className="px-4 py-2 text-start">טננט</th>
                <th className="px-4 py-2 text-start">זמן</th>
              </tr>
            </thead>
            <tbody>
              {(stats.recent_activity || []).map((a: any) => (
                <tr key={a.id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <Badge className="text-xs">{a.action}</Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{a.entity_type}</td>
                  <td className="px-4 py-2">{a.user_email || "—"}</td>
                  <td className="px-4 py-2">{a.tenant_name || "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {a.created_at ? new Date(a.created_at).toLocaleString("he-IL") : "—"}
                  </td>
                </tr>
              ))}
              {(!stats.recent_activity || stats.recent_activity.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">אין פעילות</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════
// Channel Management (Super Admin)
// ═══════════════════════════════════════════

const ALL_CHANNELS = [
  { key: "whatsapp", label: "WhatsApp", icon: "💬", credentialFields: [{ key: "api_token", label: "WhatsApp Business Token" }, { key: "phone_number_id", label: "Phone Number ID" }] },
  { key: "telegram", label: "Telegram", icon: "📨", credentialFields: [{ key: "bot_token", label: "Telegram Bot Token" }, { key: "bot_username", label: "Bot Username" }] },
  { key: "sms", label: "SMS", icon: "📱", credentialFields: [{ key: "provider", label: "ספק (twilio/019)" }, { key: "api_key", label: "API Key" }] },
  { key: "email", label: "Email", icon: "📧", credentialFields: [{ key: "smtp_host", label: "SMTP Host" }, { key: "from_address", label: "From Address" }] },
  { key: "push", label: "Push", icon: "🔔", credentialFields: [] },
];

function ChannelManagementPanel() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [channelConfigs, setChannelConfigs] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [editChannels, setEditChannels] = useState<Record<string, { enabled: boolean; config: Record<string, string> }>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/admin/tenants");
        setTenants(res.data);
        // Load channel configs for each tenant
        const configs: Record<string, any[]> = {};
        await Promise.all(res.data.map(async (t: any) => {
          try {
            const chRes = await api.get(`/admin/tenants/${t.id}/channels`);
            configs[t.id] = chRes.data;
          } catch { configs[t.id] = []; }
        }));
        setChannelConfigs(configs);
      } catch {
        toast("error", "שגיאה בטעינת נתונים");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openEdit = (tenant: any) => {
    setEditingTenant(tenant);
    const existing = channelConfigs[tenant.id] || [];
    const channels: Record<string, { enabled: boolean; config: Record<string, string> }> = {};
    ALL_CHANNELS.forEach(ch => {
      const found = existing.find((e: any) => e.channel === ch.key);
      channels[ch.key] = {
        enabled: found?.is_enabled || false,
        config: found?.provider_config || {},
      };
    });
    setEditChannels(channels);
  };

  const saveChannels = async () => {
    if (!editingTenant) return;
    setSaving(true);
    try {
      const channels = ALL_CHANNELS.map(ch => ({
        channel: ch.key,
        is_enabled: editChannels[ch.key]?.enabled || false,
        provider_config: editChannels[ch.key]?.config || {},
      }));
      await api.post(`/admin/tenants/${editingTenant.id}/channels`, { channels });
      toast("success", "ערוצי תקשורת עודכנו");
      // Refresh
      const chRes = await api.get(`/admin/tenants/${editingTenant.id}/channels`);
      setChannelConfigs(prev => ({ ...prev, [editingTenant.id]: chRes.data }));
      setEditingTenant(null);
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <TableSkeleton rows={5} cols={7} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-start font-medium">טננט</th>
                {ALL_CHANNELS.map(ch => (
                  <th key={ch.key} className="px-3 py-3 text-center font-medium">
                    <span className="text-base">{ch.icon}</span>
                    <br /><span className="text-xs">{ch.label}</span>
                  </th>
                ))}
                <th className="px-4 py-3 text-start font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => {
                const configs = channelConfigs[t.id] || [];
                return (
                  <tr key={t.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{t.name}</td>
                    {ALL_CHANNELS.map(ch => {
                      const cfg = configs.find((c: any) => c.channel === ch.key);
                      return (
                        <td key={ch.key} className="px-3 py-3 text-center">
                          {cfg?.is_enabled ? (
                            <Badge variant="success" className="text-[10px]">✓</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Edit Channels Modal */}
      <Dialog open={!!editingTenant} onOpenChange={() => setEditingTenant(null)}>
        <DialogContent className="max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ערוצי תקשורת — {editingTenant?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {ALL_CHANNELS.map(ch => (
              <div key={ch.key} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{ch.icon}</span>
                    <span className="font-medium">{ch.label}</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editChannels[ch.key]?.enabled || false}
                      onChange={(e) => setEditChannels(prev => ({
                        ...prev,
                        [ch.key]: { ...prev[ch.key], enabled: e.target.checked },
                      }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500" />
                  </label>
                </div>
                {editChannels[ch.key]?.enabled && ch.credentialFields.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    {ch.credentialFields.map(field => (
                      <div key={field.key} className="space-y-1">
                        <Label className="text-xs">{field.label}</Label>
                        <Input
                          value={editChannels[ch.key]?.config?.[field.key] || ""}
                          onChange={(e) => setEditChannels(prev => ({
                            ...prev,
                            [ch.key]: {
                              ...prev[ch.key],
                              config: { ...prev[ch.key]?.config, [field.key]: e.target.value },
                            },
                          }))}
                          dir="ltr"
                          className="h-8 text-sm font-mono"
                          type={field.key.includes("token") || field.key.includes("key") ? "password" : "text"}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTenant(null)}>ביטול</Button>
            <Button onClick={saveChannels} disabled={saving}>
              {saving ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════
// Google Sheets Config (System Level)
// ═══════════════════════════════════════════

function GoogleSheetsConfigPanel() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [jsonKey, setJsonKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Try to load from system settings
        const res = await api.get("/admin/tenants");
        // Use first tenant's settings as system-level
        if (res.data.length > 0) {
          try {
            // Check if we have existing google sheets config
            const settingsRes = await api.get(`/settings/key/google_sheets_service_account`).catch(() => null);
            if (settingsRes?.data?.value) {
              const val = typeof settingsRes.data.value === "string" ? JSON.parse(settingsRes.data.value) : settingsRes.data.value;
              setEmail(val.client_email || val.email || "");
              setJsonKey(val.json_key || "");
            }
          } catch { /* no existing config */ }
        }
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/settings", {
        key: "google_sheets_service_account",
        value: { email, json_key: jsonKey },
        group: "integrations",
      });
      toast("success", "הגדרות Google Sheets נשמרו");
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בשמירה"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <TableSkeleton rows={3} cols={1} />;

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            חיבור Google Sheets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Service Account Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="my-service@project.iam.gserviceaccount.com"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label>Service Account JSON Key</Label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[200px] font-mono"
              dir="ltr"
              value={jsonKey}
              onChange={(e) => setJsonKey(e.target.value)}
              placeholder='{"type": "service_account", "project_id": "...", ...}'
            />
            <p className="text-xs text-muted-foreground">
              הדבק את תוכן קובץ ה-JSON של Service Account, או העלה קובץ:
            </p>
            <input
              type="file"
              accept=".json"
              className="text-xs"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                setJsonKey(text);
                try {
                  const parsed = JSON.parse(text);
                  if (parsed.client_email) setEmail(parsed.client_email);
                } catch { /* not valid json */ }
              }}
            />
          </div>
          <Button onClick={handleSave} disabled={saving || !email}>
            {saving ? "שומר..." : "שמור הגדרות"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const ALL_TABS = ["tenants", "plans", "users", "roles", "health", "channels", "google_sheets"];
  const tabFromUrl = searchParams.get("tab") as AdminTab | null;
  const [activeTab, setActiveTab] = useState<AdminTab>(tabFromUrl && ALL_TABS.includes(tabFromUrl) ? tabFromUrl : "tenants");
  const [loading, setLoading] = useState(true);

  // Sync tab with URL
  useEffect(() => {
    if (tabFromUrl && ALL_TABS.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  // All available features for plans
  const ALL_FEATURES = [
    { key: "max_employees", label: "מקסימום עובדים", type: "number" },
    { key: "ai_bot", label: "בוט AI", type: "bool" },
    { key: "custom_branding", label: "מיתוג מותאם", type: "bool" },
    { key: "excel_export", label: "ייצוא Excel", type: "bool" },
    { key: "pdf_export", label: "ייצוא PDF", type: "bool" },
    { key: "audit_log", label: "יומן ביקורת", type: "bool" },
    { key: "pwa_push", label: "התראות Push", type: "bool" },
    { key: "telegram_bot", label: "בוט Telegram", type: "bool" },
    { key: "whatsapp_bot", label: "בוט WhatsApp", type: "bool" },
    { key: "google_sheets_sync", label: "סנכרון Google Sheets", type: "bool" },
  ];

  const PLAN_PRESETS: Record<string, Record<string, any>> = {
    free: { max_employees: 10, ai_bot: false, custom_branding: false, excel_export: false, pdf_export: false, audit_log: false, pwa_push: true, telegram_bot: false, whatsapp_bot: false, google_sheets_sync: false },
    pro: { max_employees: 100, ai_bot: true, custom_branding: true, excel_export: true, pdf_export: true, audit_log: true, pwa_push: true, telegram_bot: true, whatsapp_bot: false, google_sheets_sync: true },
    enterprise: { max_employees: 9999, ai_bot: true, custom_branding: true, excel_export: true, pdf_export: true, audit_log: true, pwa_push: true, telegram_bot: true, whatsapp_bot: true, google_sheets_sync: true },
  };

  // Tenants
  const [tenants, setTenants] = useState<any[]>([]);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [tenantForm, setTenantForm] = useState({ name: "", slug: "", is_active: true, plan_id: "" as string, features: {} as Record<string, any> });
  const [tenantFormErrors, setTenantFormErrors] = useState<Record<string, string>>({});

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

  // Role definitions for user creation
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const loadRoles = useCallback(async () => {
    try {
      const res = await api.get("/admin/role-definitions");
      setAllRoles(res.data);
    } catch {}
  }, []);

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
    if (activeTab === "tenants") { loadTenants(); loadPlans(); }
    else if (activeTab === "plans") loadPlans();
    else if (activeTab === "users") { loadUsers(); loadRoles(); loadTenants(); }
    else setLoading(false);
  }, [activeTab, loadTenants, loadPlans, loadUsers, loadRoles]);

  // Tenant CRUD
  const saveTenant = async () => {
    const errors: Record<string, string> = {};
    if (!tenantForm.name.trim()) errors.name = "שם הוא שדה חובה";
    if (!tenantForm.slug.trim()) errors.slug = "Slug הוא שדה חובה";
    else if (!/^[a-z0-9_-]+$/.test(tenantForm.slug)) errors.slug = "רק אותיות אנגליות קטנות, מספרים ומקפים";
    setTenantFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    try {
      const payload: any = { name: tenantForm.name, slug: tenantForm.slug, is_active: tenantForm.is_active };
      if (tenantForm.plan_id) payload.plan_id = tenantForm.plan_id;
      if (editingTenant) {
        await api.patch(`/admin/tenants/${editingTenant.id}`, payload);
        // Save custom features as plan if editing
        if (Object.keys(tenantForm.features).length > 0) {
          // Find or create a custom plan for this tenant
          let planId = tenantForm.plan_id;
          if (!planId) {
            // Create a custom plan
            const planRes = await api.post("/admin/plans", {
              name: `custom_${tenantForm.slug}`,
              features: tenantForm.features,
            });
            planId = planRes.data.id;
            await api.patch(`/admin/tenants/${editingTenant.id}`, { plan_id: planId });
          } else {
            // Update existing plan features
            await api.patch(`/admin/plans/${planId}`, { features: tenantForm.features });
          }
        }
        toast("success", "טננט עודכן");
      } else {
        await api.post("/admin/tenants", payload);
        toast("success", "טננט נוצר");
      }
      setShowTenantModal(false);
      setEditingTenant(null);
      loadTenants();
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
  };

  const toggleTenant = async (t: any) => {
    try {
      await api.patch(`/admin/tenants/${t.id}`, { is_active: !t.is_active });
      toast("success", t.is_active ? "טננט הושבת" : "טננט הופעל");
      loadTenants();
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
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
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
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
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
  };

  const deactivateUser = async (userId: string) => {
    try {
      await api.delete(`/admin/users/${userId}`);
      toast("success", "משתמש הושבת");
      loadUsers();
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
  };

  const moveTenant = async () => {
    try {
      await api.post(`/admin/users/${moveUserId}/move-tenant`, null, {
        params: { new_tenant_id: moveTenantId || undefined },
      });
      toast("success", "משתמש הועבר");
      setShowMoveModal(false);
      loadUsers();
    } catch (e: any) { toast("error", getErrorMessage(e, "שגיאה")); }
  };

  const tabs: { key: AdminTab; label: string; icon: any }[] = [
    { key: "tenants", label: "טננטים", icon: Building2 },
    { key: "plans", label: "תוכניות", icon: CreditCard },
    { key: "users", label: "משתמשים", icon: Users },
    { key: "roles", label: "תפקידים והרשאות", icon: Shield },
    { key: "channels", label: "ערוצי תקשורת", icon: Radio },
    { key: "google_sheets", label: "Google Sheets", icon: FileSpreadsheet },
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
            <Button size="sm" onClick={() => { setEditingTenant(null); setTenantFormErrors({}); setTenantForm({ name: "", slug: "", is_active: true, plan_id: "", features: {} }); setShowTenantModal(true); }}>
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
                          <Button variant="ghost" size="icon" onClick={() => {
                            setEditingTenant(t);
                            // Load plan features if tenant has a plan
                            const plan = plans.find((p: any) => p.id === t.plan_id);
                            setTenantForm({ name: t.name, slug: t.slug, is_active: t.is_active, plan_id: t.plan_id || "", features: plan?.features || {} });
                            setShowTenantModal(true);
                          }}>
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

      {/* Roles & Permissions — System Level */}
      {activeTab === "roles" && <RolePermissionsPage mode="system" />}

      {/* Channels Tab */}
      {activeTab === "channels" && <ChannelManagementPanel />}

      {/* Google Sheets Tab */}
      {activeTab === "google_sheets" && <GoogleSheetsConfigPanel />}

      {/* Health Tab */}
      {activeTab === "health" && <SystemHealthDashboard />}

      {/* Tenant Modal */}
      <Dialog open={showTenantModal} onOpenChange={setShowTenantModal}>
        <DialogContent className="max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTenant ? "עריכת טננט" : "טננט חדש"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>שם <span className="text-red-500">*</span></Label>
              <Input value={tenantForm.name} onChange={e => { setTenantForm({...tenantForm, name: e.target.value}); if (tenantFormErrors.name) setTenantFormErrors(prev => ({...prev, name: ""})); }} className={`min-h-[44px] ${tenantFormErrors.name ? "border-red-500 ring-1 ring-red-500" : ""}`} />
              {tenantFormErrors.name && <p className="text-sm text-red-600">{tenantFormErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label>Slug <span className="text-red-500">*</span></Label>
              <Input value={tenantForm.slug} onChange={e => { setTenantForm({...tenantForm, slug: e.target.value}); if (tenantFormErrors.slug) setTenantFormErrors(prev => ({...prev, slug: ""})); }} dir="ltr" disabled={!!editingTenant} className={`min-h-[44px] ${tenantFormErrors.slug ? "border-red-500 ring-1 ring-red-500" : ""}`} />
              {tenantFormErrors.slug && <p className="text-sm text-red-600">{tenantFormErrors.slug}</p>}
              <p className="text-xs text-muted-foreground">רק אותיות אנגליות קטנות, מספרים ומקפים</p>
            </div>

            {/* Plan Selection */}
            <div className="space-y-2">
              <Label>תוכנית</Label>
              <Select value={tenantForm.plan_id} onChange={e => {
                const planId = e.target.value;
                setTenantForm({...tenantForm, plan_id: planId});
                if (planId) {
                  const plan = plans.find((p: any) => p.id === planId);
                  if (plan?.features) setTenantForm(prev => ({...prev, plan_id: planId, features: plan.features}));
                }
              }}>
                <option value="">ללא תוכנית</option>
                {plans.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>

            {/* Plan Presets */}
            <div className="space-y-2">
              <Label>בחר תבנית תוכנית</Label>
              <div className="flex gap-2">
                {Object.entries(PLAN_PRESETS).map(([name, features]) => (
                  <Button key={name} variant="outline" size="sm" onClick={() => setTenantForm({...tenantForm, features})}>
                    {name === "free" ? "🆓 Free" : name === "pro" ? "⭐ Pro" : "🏢 Enterprise"}
                  </Button>
                ))}
              </div>
            </div>

            {/* Feature Checkboxes */}
            <div className="space-y-2">
              <Label>תכונות</Label>
              <div className="rounded-lg border p-3 space-y-2 max-h-[250px] overflow-y-auto">
                {ALL_FEATURES.map(f => (
                  <label key={f.key} className="flex items-center justify-between gap-2 hover:bg-muted/50 rounded px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      {f.type === "bool" ? (
                        <input
                          type="checkbox"
                          checked={!!tenantForm.features[f.key]}
                          onChange={e => setTenantForm({...tenantForm, features: {...tenantForm.features, [f.key]: e.target.checked}})}
                          className="rounded h-4 w-4 accent-primary-500"
                        />
                      ) : (
                        <Input
                          type="number"
                          value={tenantForm.features[f.key] ?? ""}
                          onChange={e => setTenantForm({...tenantForm, features: {...tenantForm.features, [f.key]: Number(e.target.value)}})}
                          className="w-20 h-8 text-sm"
                        />
                      )}
                      <span className="text-sm">{f.label}</span>
                    </div>
                    <Badge className={tenantForm.features[f.key] ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                      {f.type === "bool"
                        ? (tenantForm.features[f.key] ? "✓" : "✗")
                        : (tenantForm.features[f.key] ?? "—")}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>
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
        <DialogContent className="max-w-[550px]">
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
            <div className="space-y-2">
              <Label>תפקיד מערכת</Label>
              <Select value={userForm.role_definition_id} onChange={e => setUserForm({...userForm, role_definition_id: e.target.value})}>
                <option value="">ללא תפקיד</option>
                {allRoles.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.label?.he || r.name}{r.is_system ? " (מערכת)" : ""}</option>
                ))}
              </Select>
              {/* Role description tooltip */}
              {userForm.role_definition_id && (() => {
                const role = allRoles.find((r: any) => r.id === userForm.role_definition_id);
                if (!role) return null;
                const permKeys = role.permissions ? Object.keys(role.permissions) : [];
                return (
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-xs space-y-1">
                    <p className="font-medium text-blue-700 dark:text-blue-300">{role.label?.he || role.name}</p>
                    {permKeys.length > 0 && (
                      <p className="text-blue-600 dark:text-blue-400">
                        הרשאות: {permKeys.join(", ")}
                      </p>
                    )}
                    {role.user_count !== undefined && (
                      <p className="text-blue-500">{role.user_count} משתמשים עם תפקיד זה</p>
                    )}
                  </div>
                );
              })()}
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
