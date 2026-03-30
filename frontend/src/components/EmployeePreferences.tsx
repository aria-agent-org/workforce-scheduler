import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Users, Clock, Target, Save, X, Search, Plus } from "lucide-react";
import api, { tenantApi } from "@/lib/api";

interface PartnerPref {
  employee_id: string;
  weight: number;
  notes: string;
}

interface MissionTypePref {
  mission_type_id: string;
  preference: "prefer" | "avoid" | "neutral";
  weight: number;
}

interface TimeSlotPref {
  slot_key: "morning" | "afternoon" | "night";
  preference: "prefer" | "avoid" | "neutral";
  weight: number;
}

interface Preferences {
  partner_preferences: PartnerPref[];
  mission_type_preferences: MissionTypePref[];
  time_slot_preferences: TimeSlotPref[];
  custom_preferences: Record<string, any>;
  notes: string | null;
}

interface Props {
  employeeId?: string;  // If provided, admin mode (uses /employees/{id}/preferences)
  selfService?: boolean; // If true, uses /my/preferences
  compact?: boolean;     // Compact view for embedding
}

const TIME_SLOTS = [
  { key: "morning" as const, label: "בוקר", time: "07:00–15:00", icon: "🌅" },
  { key: "afternoon" as const, label: "צהריים", time: "15:00–23:00", icon: "☀️" },
  { key: "night" as const, label: "לילה", time: "23:00–07:00", icon: "🌙" },
];

const PREF_OPTIONS = [
  { value: "prefer" as const, label: "מעדיף", color: "bg-green-100 text-green-700 border-green-300", activeColor: "bg-green-500 text-white" },
  { value: "neutral" as const, label: "ניטרלי", color: "bg-gray-100 text-gray-700 border-gray-300", activeColor: "bg-gray-500 text-white" },
  { value: "avoid" as const, label: "מעדיף להימנע", color: "bg-red-100 text-red-700 border-red-300", activeColor: "bg-red-500 text-white" },
];

export default function EmployeePreferences({ employeeId, selfService, compact }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>({
    partner_preferences: [],
    mission_type_preferences: [],
    time_slot_preferences: [],
    custom_preferences: {},
    notes: null,
  });

  // Employee list for partner search
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [missionTypes, setMissionTypes] = useState<any[]>([]);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [showPartnerSearch, setShowPartnerSearch] = useState(false);

  const apiBase = selfService
    ? tenantApi("/my/preferences")
    : tenantApi(`/employees/${employeeId}/preferences`);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prefsRes, empRes, mtRes] = await Promise.all([
        api.get(apiBase),
        api.get(tenantApi("/employees"), { params: { page_size: 200, is_active: true } }),
        api.get(tenantApi("/mission-types")),
      ]);
      setPrefs({
        partner_preferences: prefsRes.data.partner_preferences || [],
        mission_type_preferences: prefsRes.data.mission_type_preferences || [],
        time_slot_preferences: prefsRes.data.time_slot_preferences || [],
        custom_preferences: prefsRes.data.custom_preferences || {},
        notes: prefsRes.data.notes || null,
      });
      setAllEmployees(empRes.data.items || []);
      setMissionTypes(mtRes.data || []);
    } catch {
      toast("error", "שגיאה בטעינת העדפות");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { loadData(); }, [loadData]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(apiBase, prefs);
      toast("success", "העדפות נשמרו בהצלחה");
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה בשמירת העדפות");
    } finally {
      setSaving(false);
    }
  };

  // Partner helpers
  const addPartner = (empId: string) => {
    if (prefs.partner_preferences.some(p => p.employee_id === empId)) return;
    if (empId === employeeId) return; // Can't prefer yourself
    setPrefs({
      ...prefs,
      partner_preferences: [...prefs.partner_preferences, { employee_id: empId, weight: 5, notes: "" }],
    });
    setPartnerSearch("");
    setShowPartnerSearch(false);
  };

  const removePartner = (empId: string) => {
    setPrefs({
      ...prefs,
      partner_preferences: prefs.partner_preferences.filter(p => p.employee_id !== empId),
    });
  };

  const updatePartnerWeight = (empId: string, weight: number) => {
    setPrefs({
      ...prefs,
      partner_preferences: prefs.partner_preferences.map(p =>
        p.employee_id === empId ? { ...p, weight } : p
      ),
    });
  };

  // Mission type preference helpers
  const getMissionPref = (mtId: string): MissionTypePref | undefined =>
    prefs.mission_type_preferences.find(p => p.mission_type_id === mtId);

  const setMissionPref = (mtId: string, preference: "prefer" | "avoid" | "neutral", weight: number = 5) => {
    const existing = prefs.mission_type_preferences.filter(p => p.mission_type_id !== mtId);
    if (preference !== "neutral") {
      existing.push({ mission_type_id: mtId, preference, weight });
    }
    setPrefs({ ...prefs, mission_type_preferences: existing });
  };

  // Time slot preference helpers
  const getTimeSlotPref = (key: string): TimeSlotPref | undefined =>
    prefs.time_slot_preferences.find(p => p.slot_key === key);

  const setTimeSlotPref = (key: "morning" | "afternoon" | "night", preference: "prefer" | "avoid" | "neutral", weight: number = 5) => {
    const existing = prefs.time_slot_preferences.filter(p => p.slot_key !== key);
    if (preference !== "neutral") {
      existing.push({ slot_key: key, preference, weight });
    }
    setPrefs({ ...prefs, time_slot_preferences: existing });
  };

  const getEmployeeName = (empId: string) => {
    const emp = allEmployees.find(e => e.id === empId);
    return emp?.full_name || empId;
  };

  const filteredEmployees = allEmployees.filter(e => {
    if (e.id === employeeId) return false;
    if (prefs.partner_preferences.some(p => p.employee_id === e.id)) return false;
    if (!partnerSearch) return true;
    return (
      e.full_name?.toLowerCase().includes(partnerSearch.toLowerCase()) ||
      e.employee_number?.toLowerCase().includes(partnerSearch.toLowerCase())
    );
  });

  if (loading) {
    return <div className="flex items-center justify-center h-32 text-muted-foreground">טוען העדפות...</div>;
  }

  const CardWrapper = compact ? "div" : Card;
  const HeaderWrapper = compact ? "div" : CardHeader;
  const ContentWrapper = compact ? "div" : CardContent;

  return (
    <div className="space-y-4">
      {/* Partner Preferences */}
      <CardWrapper className={compact ? "" : undefined}>
        {!compact && (
          <HeaderWrapper>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              חברים מועדפים למשימות
            </CardTitle>
          </HeaderWrapper>
        )}
        {compact && (
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Users className="h-4 w-4" />
            חברים מועדפים למשימות
          </h3>
        )}
        <ContentWrapper className={compact ? "space-y-3" : "space-y-3"}>
          {/* Current partners */}
          {prefs.partner_preferences.length > 0 && (
            <div className="space-y-2">
              {prefs.partner_preferences.map((p) => (
                <div key={p.employee_id} className="flex items-center gap-2 rounded-lg border p-2">
                  <span className="flex-1 text-sm font-medium">{getEmployeeName(p.employee_id)}</span>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">עדיפות:</Label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={p.weight}
                      onChange={(e) => updatePartnerWeight(p.employee_id, parseInt(e.target.value))}
                      className="w-20 h-2 accent-primary-500"
                    />
                    <span className="text-xs font-mono w-4">{p.weight}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePartner(p.employee_id)}>
                    <X className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add partner */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setShowPartnerSearch(!showPartnerSearch)}
            >
              <Plus className="me-1 h-3.5 w-3.5" />
              הוסף חבר מועדף
            </Button>
            {showPartnerSearch && (
              <div className="absolute z-10 top-full mt-1 w-full bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                <div className="p-2 border-b sticky top-0 bg-background">
                  <div className="relative">
                    <Search className="absolute start-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="חיפוש חייל..."
                      value={partnerSearch}
                      onChange={(e) => setPartnerSearch(e.target.value)}
                      className="ps-7 h-8 text-sm"
                      autoFocus
                    />
                  </div>
                </div>
                {filteredEmployees.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">לא נמצאו חיילים</p>
                ) : (
                  filteredEmployees.slice(0, 20).map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => addPartner(emp.id)}
                      className="w-full text-start px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between"
                    >
                      <span>{emp.full_name}</span>
                      <span className="text-xs text-muted-foreground">{emp.employee_number}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </ContentWrapper>
      </CardWrapper>

      {/* Mission Type Preferences */}
      <CardWrapper>
        {!compact && (
          <HeaderWrapper>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              העדפות סוגי משימות
            </CardTitle>
          </HeaderWrapper>
        )}
        {compact && (
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Target className="h-4 w-4" />
            העדפות סוגי משימות
          </h3>
        )}
        <ContentWrapper className="space-y-2">
          {missionTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין סוגי משימות מוגדרים</p>
          ) : (
            missionTypes.map((mt: any) => {
              const currentPref = getMissionPref(mt.id);
              const currentValue = currentPref?.preference || "neutral";
              return (
                <div key={mt.id} className="flex items-center gap-3 rounded-lg border p-2">
                  <span className="text-lg">{mt.icon || "📋"}</span>
                  <span className="flex-1 text-sm font-medium">{mt.name?.he || mt.name}</span>
                  <div className="flex gap-1">
                    {PREF_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setMissionPref(mt.id, opt.value, currentPref?.weight || 5)}
                        className={`rounded-md px-2 py-1 text-xs border transition-all ${
                          currentValue === opt.value ? opt.activeColor : opt.color
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {currentValue !== "neutral" && (
                    <div className="flex items-center gap-1">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={currentPref?.weight || 5}
                        onChange={(e) => setMissionPref(mt.id, currentValue as any, parseInt(e.target.value))}
                        className="w-16 h-2 accent-primary-500"
                      />
                      <span className="text-xs font-mono w-4">{currentPref?.weight || 5}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </ContentWrapper>
      </CardWrapper>

      {/* Time Slot Preferences */}
      <CardWrapper>
        {!compact && (
          <HeaderWrapper>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              העדפות זמנים
            </CardTitle>
          </HeaderWrapper>
        )}
        {compact && (
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4" />
            העדפות זמנים
          </h3>
        )}
        <ContentWrapper className="space-y-2">
          {TIME_SLOTS.map((slot) => {
            const currentPref = getTimeSlotPref(slot.key);
            const currentValue = currentPref?.preference || "neutral";
            return (
              <div key={slot.key} className="flex items-center gap-3 rounded-lg border p-2">
                <span className="text-lg">{slot.icon}</span>
                <div className="flex-1">
                  <span className="text-sm font-medium">{slot.label}</span>
                  <span className="text-xs text-muted-foreground ms-2">{slot.time}</span>
                </div>
                <div className="flex gap-1">
                  {PREF_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTimeSlotPref(slot.key, opt.value, currentPref?.weight || 5)}
                      className={`rounded-md px-2 py-1 text-xs border transition-all ${
                        currentValue === opt.value ? opt.activeColor : opt.color
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {currentValue !== "neutral" && (
                  <div className="flex items-center gap-1">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={currentPref?.weight || 5}
                      onChange={(e) => setTimeSlotPref(slot.key, currentValue as any, parseInt(e.target.value))}
                      className="w-16 h-2 accent-primary-500"
                    />
                    <span className="text-xs font-mono w-4">{currentPref?.weight || 5}</span>
                  </div>
                )}
              </div>
            );
          })}
        </ContentWrapper>
      </CardWrapper>

      {/* Notes */}
      <CardWrapper>
        {!compact && (
          <HeaderWrapper>
            <CardTitle className="text-base">הערות נוספות</CardTitle>
          </HeaderWrapper>
        )}
        {compact && (
          <h3 className="text-sm font-semibold mb-2">הערות נוספות</h3>
        )}
        <ContentWrapper>
          <textarea
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
            value={prefs.notes || ""}
            onChange={(e) => setPrefs({ ...prefs, notes: e.target.value || null })}
            placeholder="הערות חופשיות לגבי העדפות שיבוץ..."
          />
        </ContentWrapper>
      </CardWrapper>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="min-h-[44px]">
          <Save className="me-1 h-4 w-4" />
          {saving ? "שומר..." : "שמור העדפות"}
        </Button>
      </div>
    </div>
  );
}
