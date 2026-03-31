import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Settings, Users, Shield, Plus, Pencil, Trash2, Palette,
  ClipboardList, Sheet, Bot, LayoutTemplate,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import HelpTooltip from "@/components/common/HelpTooltip";
import AutoSaveIndicator from "@/components/common/AutoSaveIndicator";
import { useAutoSave } from "@/hooks/useAutoSave";
import BilingualRoleName from "@/components/common/BilingualRoleName";
import AttendanceStatusesPage from "./AttendanceStatusesPage";
import GoogleSheetsPage from "./GoogleSheetsPage";
import BotConfigPage from "./BotConfigPage";
import BoardTemplateEditor from "./BoardTemplateEditor";
import UsersSettingsPage from "./UsersSettingsPage";
import RegistrationCodesPage from "./RegistrationCodesPage";
import CommunicationChannelsPage from "./CommunicationChannelsPage";
import RolePermissionsPage from "./RolePermissionsPage";
import VisibilitySettingsPage from "./VisibilitySettingsPage";
import SecuritySettingsPage from "./SecuritySettingsPage";
import { KeyRound, Radio, Eye, Lock } from "lucide-react";

type Tab = "general" | "work-roles" | "role-definitions" | "attendance-statuses" | "google-sheets" | "bot-config" | "board-template" | "users" | "registration" | "channels" | "visibility" | "security";

function BrandingSection({ initialColor, initialLogo, initialFavicon, onSave }: {
  initialColor: string;
  initialLogo: string;
  initialFavicon: string;
  onSave: (color: string, logo: string, favicon: string) => Promise<void>;
}) {
  const [color, setColor] = useState(initialColor);
  const [logo, setLogo] = useState(initialLogo);
  const [favicon, setFavicon] = useState(initialFavicon);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(color, logo, favicon);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-2">
        <span>🎨</span>
        מיתוג
        <Badge className="bg-muted text-muted-foreground text-xs">3</Badge>
      </h2>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">צבע ראשי</Label>
            <div className="flex items-center gap-3">
              <Input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-14 h-10 p-1 cursor-pointer"
              />
              <Input
                value={color}
                onChange={e => setColor(e.target.value)}
                placeholder="#3b82f6"
                className="w-32 min-h-[44px] font-mono text-sm"
              />
              <div className="h-8 w-8 rounded-lg" style={{ backgroundColor: color }} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">כתובת לוגו (URL)</Label>
            <Input
              value={logo}
              onChange={e => setLogo(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="min-h-[44px]"
              dir="ltr"
            />
            {logo && (
              <div className="rounded-lg border p-2 bg-muted/30">
                <img src={logo} alt="לוגו" className="h-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">כתובת Favicon (URL)</Label>
            <Input
              value={favicon}
              onChange={e => setFavicon(e.target.value)}
              placeholder="https://example.com/favicon.ico"
              className="min-h-[44px]"
              dir="ltr"
            />
            {favicon && (
              <div className="flex items-center gap-2">
                <img src={favicon} alt="favicon" className="h-6 w-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <span className="text-xs text-muted-foreground">תצוגה מקדימה</span>
              </div>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving} className="min-h-[44px]">
            {saving ? "שומר..." : "💾 שמור מיתוג"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && ["general","users","registration","work-roles","attendance-statuses","board-template","channels","google-sheets","bot-config","visibility","role-definitions","security"].includes(tab)) {
      return tab as Tab;
    }
    return "general";
  });
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any[]>([]);
  const [workRoles, setWorkRoles] = useState<any[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<any[]>([]);

  // Modals
  const [showWRModal, setShowWRModal] = useState(false);
  const [wrForm, setWrForm] = useState({ name_he: "", name_en: "", color: "#3b82f6" });
  const [editingWR, setEditingWR] = useState<any>(null);
  // Inline editing for settings
  const [editingSettingId, setEditingSettingId] = useState<string | null>(null);
  const [editingSettingValue, setEditingSettingValue] = useState<string>("");

  const saveSetting = async (settingId: string, value: any) => {
    try {
      await api.patch(tenantApi(`/settings/${settingId}`), { value });
      toast("success", "הגדרה נשמרה");
      setEditingSettingId(null);
      load();
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בשמירת הגדרה"));
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settRes, wrRes, rdRes] = await Promise.all([
        api.get(tenantApi("/settings")),
        api.get(tenantApi("/settings/work-roles")),
        api.get(tenantApi("/settings/role-definitions")),
      ]);
      setSettings(settRes.data);
      setWorkRoles(wrRes.data);
      setRoleDefinitions(rdRes.data);
    } catch (e) {
      toast("error", "שגיאה בטעינת הגדרות");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveWorkRole = async () => {
    try {
      const body = {
        name: { he: wrForm.name_he, en: wrForm.name_en },
        color: wrForm.color,
      };
      if (editingWR) {
        await api.patch(tenantApi(`/settings/work-roles/${editingWR.id}`), body);
        toast("success", "תפקיד עודכן");
      } else {
        await api.post(tenantApi("/settings/work-roles"), body);
        toast("success", "תפקיד נוצר");
      }
      setShowWRModal(false);
      setEditingWR(null);
      load();
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה"));
    }
  };

  const deleteWorkRole = async (id: string) => {
    try {
      await api.delete(tenantApi(`/settings/work-roles/${id}`));
      toast("success", "תפקיד נמחק");
      load();
    } catch (e) {
      toast("error", "שגיאה");
    }
  };

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "general", label: "כללי", icon: Settings },
    { key: "users", label: "משתמשים", icon: Users },
    { key: "registration", label: "קודי הרשמה", icon: KeyRound },
    { key: "work-roles", label: "תפקידים", icon: Users },
    { key: "attendance-statuses", label: "סטטוסי נוכחות", icon: ClipboardList },
    { key: "board-template", label: "תבנית לוח", icon: LayoutTemplate },
    { key: "channels", label: "ערוצים", icon: Radio },
    { key: "google-sheets", label: "Google Sheets", icon: Sheet },
    { key: "bot-config", label: "בוט", icon: Bot },
    { key: "visibility", label: "נראות חייל", icon: Eye },
    { key: "role-definitions", label: "הרשאות", icon: Shield },
    { key: "security", label: "אבטחה", icon: Lock },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("nav.settings")}</h1>

      {/* Tab Navigation - horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-all active:scale-95 min-h-[44px] ${
              activeTab === key
                ? "bg-primary-500 text-white shadow-md"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* Users Management */}
      {activeTab === "users" && <UsersSettingsPage />}

      {/* Registration Codes */}
      {activeTab === "registration" && <RegistrationCodesPage />}

      {/* General Settings — Grouped by Category */}
      {activeTab === "general" && (
        loading ? <TableSkeleton rows={5} cols={3} /> : (() => {
          // Branding state & save handler (hoisted into the IIFE)
          const brandingSettings = {
            primary_color: settings.find((s: any) => s.key === "branding_primary_color")?.value || "#3b82f6",
            logo_url: settings.find((s: any) => s.key === "branding_logo_url")?.value || "",
            favicon_url: settings.find((s: any) => s.key === "branding_favicon_url")?.value || "",
          };
          // Unwrap _v wrapper if present
          const unwrap = (v: any) => (v && typeof v === "object" && "_v" in v) ? v._v : v;
          const brandColor = String(unwrap(brandingSettings.primary_color) || "#3b82f6");
          const brandLogo = String(unwrap(brandingSettings.logo_url) || "");
          const brandFavicon = String(unwrap(brandingSettings.favicon_url) || "");

          const GROUP_LABELS: Record<string, { label: string; icon: string; isAdvanced?: boolean }> = {
            general: { label: "הגדרות כלליות", icon: "⚙️" },
            scheduling: { label: "שיבוץ", icon: "📅" },
            notifications: { label: "התראות", icon: "🔔" },
            branding: { label: "מיתוג", icon: "🎨" },
            integrations: { label: "אינטגרציות", icon: "🔗", isAdvanced: true },
            ai: { label: "בינה מלאכותית", icon: "🤖", isAdvanced: true },
            visibility: { label: "הרשאות צפייה", icon: "👁️" },
          };
          const groups = settings.reduce((acc: Record<string, any[]>, s: any) => {
            const g = s.group || "general";
            if (!acc[g]) acc[g] = [];
            acc[g].push(s);
            return acc;
          }, {});
          const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
            const order = ["general", "scheduling", "visibility", "notifications", "branding", "integrations", "ai"];
            return order.indexOf(a) - order.indexOf(b);
          });
          const advancedGroups = sortedGroups.filter(([g]) => GROUP_LABELS[g]?.isAdvanced);
          const mainGroups = sortedGroups.filter(([g]) => !GROUP_LABELS[g]?.isAdvanced);

          return (
            <div className="space-y-6">
              {settings.length === 0 ? (
                <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground">
                  <Settings className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-lg font-medium">אין הגדרות מוגדרות</p>
                </CardContent></Card>
              ) : (
                <>
                  {mainGroups.map(([group, items]) => (
                    <div key={group} className="space-y-3">
                      <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-2">
                        <span>{GROUP_LABELS[group]?.icon || "📌"}</span>
                        {GROUP_LABELS[group]?.label || group}
                        <Badge className="bg-muted text-muted-foreground text-xs">{items.length}</Badge>
                      </h2>
                      <div className="grid gap-2">
                        {items.map((s: any) => (
                          <Card key={s.id} className="hover:shadow-sm transition-shadow">
                            <CardContent className="p-4 flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-sm">{s.label?.[lang] || s.label?.he || s.key}</h3>
                                {s.description?.[lang] && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{s.description[lang]}</p>
                                )}
                              </div>
                              <div className="text-sm font-mono max-w-[250px] truncate bg-muted/50 px-2 py-1 rounded text-xs">
                                {s.value_type === "bool"
                                  ? (s.value === true || s.value?._v === true ? "✅ פעיל" : "❌ כבוי")
                                  : s.value_type === "color"
                                    ? <span className="flex items-center gap-1"><span className="w-4 h-4 rounded" style={{ backgroundColor: String(s.value?._v || s.value || "#ccc") }} />{String(s.value?._v || s.value)}</span>
                                    : JSON.stringify(s.value)?.slice(0, 60)
                                }
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Branding Settings */}
                  <BrandingSection
                    initialColor={brandColor}
                    initialLogo={brandLogo}
                    initialFavicon={brandFavicon}
                    onSave={async (color: string, logo: string, favicon: string) => {
                      try {
                        const brandKeys = [
                          { key: "branding_primary_color", value: color },
                          { key: "branding_logo_url", value: logo },
                          { key: "branding_favicon_url", value: favicon },
                        ];
                        for (const { key, value } of brandKeys) {
                          const existing = settings.find((s: any) => s.key === key);
                          if (existing) {
                            await api.patch(tenantApi(`/settings/${existing.id}`), { value });
                          } else {
                            await api.post(tenantApi("/settings"), { key, value, group: "branding" });
                          }
                        }
                        toast("success", "הגדרות מיתוג נשמרו");
                        load();
                      } catch (e: any) {
                        toast("error", getErrorMessage(e, "שגיאה בשמירת מיתוג"));
                      }
                    }}
                  />

                  {/* Advanced Settings - Expandable */}
                  {advancedGroups.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer text-lg font-bold flex items-center gap-2 border-b pb-2 hover:text-primary-500 transition-colors list-none">
                        <span className="group-open:rotate-90 transition-transform">▶</span>
                        🔧 הגדרות מתקדמות
                        <Badge className="bg-muted text-muted-foreground text-xs">
                          {advancedGroups.reduce((sum, [, items]) => sum + items.length, 0)}
                        </Badge>
                      </summary>
                      <div className="mt-4 space-y-6">
                        {advancedGroups.map(([group, items]) => (
                          <div key={group} className="space-y-3">
                            <h3 className="text-base font-semibold flex items-center gap-2">
                              <span>{GROUP_LABELS[group]?.icon || "📌"}</span>
                              {GROUP_LABELS[group]?.label || group}
                            </h3>
                            <div className="grid gap-2">
                              {items.map((s: any) => (
                                <Card key={s.id} className="hover:shadow-sm transition-shadow border-dashed">
                                  <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <h3 className="font-medium text-sm">{s.label?.[lang] || s.label?.he || s.key}</h3>
                                    </div>
                                    <div className="text-sm font-mono max-w-[200px] truncate bg-muted/50 px-2 py-1 rounded text-xs">
                                      {JSON.stringify(s.value)?.slice(0, 50)}
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          );
        })()
      )}

      {/* Work Roles */}
      {activeTab === "work-roles" && (
        loading ? <TableSkeleton rows={4} cols={3} /> : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => {
              setEditingWR(null);
              setWrForm({ name_he: "", name_en: "", color: "#3b82f6" });
              setShowWRModal(true);
            }} className="min-h-[44px]">
              <Plus className="me-1 h-4 w-4" />תפקיד חדש
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workRoles.map(wr => (
              <Card key={wr.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: wr.color || "#ccc" }}>
                        {(wr.name?.he || "?")[0]}
                      </div>
                      <div>
                        <BilingualRoleName name={wr.name} className="font-medium" showBoth />
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="min-h-[44px] min-w-[44px]" onClick={() => {
                        setEditingWR(wr);
                        setWrForm({ name_he: wr.name?.he || "", name_en: wr.name?.en || "", color: wr.color || "#3b82f6" });
                        setShowWRModal(true);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="min-h-[44px] min-w-[44px]" onClick={() => deleteWorkRole(wr.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* Attendance Statuses - Dedicated sub-page */}
      {activeTab === "attendance-statuses" && <AttendanceStatusesPage />}

      {/* Board Template Editor */}
      {activeTab === "board-template" && <BoardTemplateEditor />}

      {/* Communication Channels */}
      {activeTab === "channels" && <CommunicationChannelsPage />}

      {/* Google Sheets Integration */}
      {activeTab === "google-sheets" && <GoogleSheetsPage />}

      {/* Bot Configuration */}
      {activeTab === "bot-config" && <BotConfigPage />}

      {/* Soldier Visibility Settings */}
      {activeTab === "visibility" && <VisibilitySettingsPage />}

      {/* Role Definitions — Full Permission Matrix */}
      {activeTab === "role-definitions" && <RolePermissionsPage mode="tenant" />}

      {/* Security — 2FA & Sessions */}
      {activeTab === "security" && <SecuritySettingsPage />}

      {/* Work Role Modal */}
      <Dialog open={showWRModal} onOpenChange={setShowWRModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingWR ? "עריכת תפקיד" : "תפקיד חדש"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>שם (עברית)</Label>
              <Input value={wrForm.name_he} onChange={e => setWrForm({...wrForm, name_he: e.target.value})} className="min-h-[44px]" />
            </div>
            <div className="space-y-2">
              <Label>שם (אנגלית)</Label>
              <Input value={wrForm.name_en} onChange={e => setWrForm({...wrForm, name_en: e.target.value})} className="min-h-[44px]" />
            </div>
            <div className="space-y-2">
              <Label>צבע</Label>
              <div className="flex items-center gap-3">
                <Input type="color" value={wrForm.color} onChange={e => setWrForm({...wrForm, color: e.target.value})} className="w-16 h-12" />
                <span className="text-sm font-mono">{wrForm.color}</span>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: wrForm.color }}>
                  {(wrForm.name_he || "?")[0]}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWRModal(false)} className="min-h-[44px]">ביטול</Button>
            <Button onClick={saveWorkRole} className="min-h-[44px]">שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
