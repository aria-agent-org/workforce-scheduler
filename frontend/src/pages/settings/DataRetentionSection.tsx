import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Database } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";

interface RetentionConfig {
  entity_type: string;
  label: string;
  retention_days: number;
  archive_to_s3: boolean;
}

const DEFAULT_CONFIGS: RetentionConfig[] = [
  { entity_type: "audit_log", label: "יומן פעולות", retention_days: 365, archive_to_s3: false },
  { entity_type: "notification_log", label: "יומן התראות", retention_days: 90, archive_to_s3: false },
  { entity_type: "attendance_log", label: "יומן נוכחות", retention_days: 730, archive_to_s3: false },
  { entity_type: "mission_history", label: "היסטוריית משימות", retention_days: 365, archive_to_s3: false },
];

export default function DataRetentionSection() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<RetentionConfig[]>(DEFAULT_CONFIGS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadRetention();
  }, []);

  const loadRetention = async () => {
    try {
      const res = await api.get(tenantApi("/settings/data-retention"));
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        // Merge server data with defaults
        const merged = DEFAULT_CONFIGS.map(dc => {
          const serverItem = res.data.find((s: any) => s.entity_type === dc.entity_type);
          return serverItem ? { ...dc, ...serverItem } : dc;
        });
        setConfigs(merged);
      }
    } catch {
      // API might not exist yet — use defaults
    } finally {
      setLoaded(true);
    }
  };

  const updateConfig = (index: number, field: keyof RetentionConfig, value: any) => {
    setConfigs(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(tenantApi("/settings/data-retention"), configs);
      toast("success", "הגדרות שמירת נתונים נשמרו");
    } catch (e: any) {
      toast("error", getErrorMessage(e, "שגיאה בשמירת הגדרות"));
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-2">
        <span>🗄️</span>
        שמירת נתונים
        <Badge className="bg-muted text-muted-foreground text-xs">{configs.length}</Badge>
      </h2>
      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            הגדר כמה זמן לשמור כל סוג מידע. נתונים ישנים יימחקו אוטומטית לאחר תקופת השמירה.
          </p>
          <div className="space-y-3">
            {configs.map((config, i) => (
              <div key={config.entity_type} className="flex items-center gap-3 flex-wrap rounded-lg border p-3 bg-muted/20">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{config.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">ימי שמירה:</Label>
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    value={config.retention_days}
                    onChange={e => updateConfig(i, "retention_days", Number(e.target.value))}
                    className="w-24 min-h-[40px] text-center"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.archive_to_s3}
                    onChange={e => updateConfig(i, "archive_to_s3", e.target.checked)}
                    className="rounded accent-primary-500"
                  />
                  <span className="text-xs whitespace-nowrap">ארכיב ל-S3</span>
                </label>
              </div>
            ))}
          </div>
          <Button onClick={handleSave} disabled={saving} className="min-h-[44px]">
            {saving ? "שומר..." : "💾 שמור הגדרות שמירת נתונים"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
