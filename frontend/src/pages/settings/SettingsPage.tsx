import { useState, useEffect, useCallback } from "react";
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
import HelpTooltip from "@/components/common/HelpTooltip";
import BilingualRoleName from "@/components/common/BilingualRoleName";
import AttendanceStatusesPage from "./AttendanceStatusesPage";
import GoogleSheetsPage from "./GoogleSheetsPage";
import BotConfigPage from "./BotConfigPage";
import BoardTemplateEditor from "./BoardTemplateEditor";
import UsersSettingsPage from "./UsersSettingsPage";
import RegistrationCodesPage from "./RegistrationCodesPage";
import CommunicationChannelsPage from "./CommunicationChannelsPage";
import { KeyRound, Radio } from "lucide-react";

type Tab = "general" | "work-roles" | "role-definitions" | "attendance-statuses" | "google-sheets" | "bot-config" | "board-template" | "users" | "registration" | "channels";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any[]>([]);
  const [workRoles, setWorkRoles] = useState<any[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<any[]>([]);

  // Modals
  const [showWRModal, setShowWRModal] = useState(false);
  const [wrForm, setWrForm] = useState({ name_he: "", name_en: "", color: "#3b82f6" });
  const [editingWR, setEditingWR] = useState<any>(null);

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
      toast("error", e.response?.data?.detail || "שגיאה");
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
    { key: "role-definitions", label: "הרשאות", icon: Shield },
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

      {/* General Settings */}
      {activeTab === "general" && (
        loading ? <TableSkeleton rows={5} cols={3} /> : (
        <div className="space-y-3">
          {settings.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">אין הגדרות מוגדרות</CardContent></Card>
          ) : settings.map(s => (
            <Card key={s.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{s.label?.[lang] || s.label?.he || s.key}</h3>
                  <p className="text-xs text-muted-foreground">
                    קבוצה: {s.group} · סוג: {s.value_type}
                  </p>
                </div>
                <div className="text-sm font-mono max-w-[200px] truncate">
                  {JSON.stringify(s.value)?.slice(0, 50)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}

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

      {/* Role Definitions */}
      {activeTab === "role-definitions" && (
        loading ? <TableSkeleton rows={3} cols={3} /> : (
        <div className="space-y-3">
          {roleDefinitions.map(rd => (
            <Card key={rd.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{rd.label?.[lang] || rd.label?.he || rd.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {Object.keys(rd.permissions || {}).length} הרשאות
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {rd.is_system && <Badge>מערכת</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}

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
