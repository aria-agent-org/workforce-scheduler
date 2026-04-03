import { useState, useEffect, useCallback } from "react";
import api, { tenantApi } from "@/lib/api";
import { Shield, AlertTriangle, CheckCircle, Plus, Play } from "lucide-react";

interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  rule_type: string;
  parameters: Record<string, any>;
  severity: string;
  is_system: boolean;
}

interface Violation {
  id: string;
  employee_id: string;
  violation_type: string;
  description: string;
  severity: string;
  resolved: boolean;
  created_at: string;
}

interface CheckResult {
  employee_id: string;
  employee_name: string;
  violations: any[];
  is_compliant: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const SEVERITY_ICONS: Record<string, string> = {
  error: "🔴",
  warning: "🟡",
  info: "🔵",
};

export default function CompliancePage() {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [checkResults, setCheckResults] = useState<CheckResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [activeTab, setActiveTab] = useState<"rules" | "violations" | "check">("rules");

  const loadData = useCallback(async () => {
    try {
      const [rulesRes, violationsRes] = await Promise.all([
        tenantApi("get", "/compliance/rules"),
        tenantApi("get", "/compliance/violations?limit=50"),
      ]);
      setRules(rulesRes.data.items);
      setViolations(violationsRes.data.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      await tenantApi("post", "/compliance/seed-defaults");
      await loadData();
    } catch {
      // ignore
    } finally {
      setSeeding(false);
    }
  };

  const handleRunCheck = async () => {
    setChecking(true);
    setCheckResults(null);
    try {
      const res = await tenantApi("post", "/compliance/check?days=7");
      setCheckResults(res.data.results);
      await loadData(); // refresh violations
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6" /> תאימות ורגולציה
        </h1>
        <div className="flex gap-2">
          {rules.length === 0 && (
            <button
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="px-4 py-2 text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {seeding ? "⏳" : "📋"} טען כללי ברירת מחדל
            </button>
          )}
          <button
            onClick={handleRunCheck}
            disabled={checking}
            className="px-4 py-2 text-sm rounded-xl bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
          >
            {checking ? <span className="animate-spin">⏳</span> : <Play className="h-4 w-4" />}
            הרצת בדיקה
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {[
          { key: "rules" as const, label: "כללים", count: rules.length },
          { key: "violations" as const, label: "הפרות", count: violations.filter(v => !v.resolved).length },
          { key: "check" as const, label: "תוצאות בדיקה", count: checkResults?.length || 0 },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${
              activeTab === tab.key
                ? "bg-primary-500 text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Rules Tab */}
      {activeTab === "rules" && (
        <div className="space-y-3">
          {rules.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">אין כללים מוגדרים. לחץ "טען כללי ברירת מחדל" להתחלה.</p>
          ) : (
            rules.map(rule => (
              <div key={rule.id} className="bg-card rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold flex items-center gap-2">
                      {SEVERITY_ICONS[rule.severity]} {typeof rule.name === "object" ? (rule.name?.he || rule.name?.en || "") : String(rule.name || "")}
                      {rule.is_system && <span className="text-xs bg-muted px-2 py-0.5 rounded-full">מערכת</span>}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
                    <div className="flex gap-2 mt-2">
                      {Object.entries(rule.parameters).map(([k, v]) => (
                        <span key={k} className="text-xs bg-muted px-2 py-1 rounded-full">
                          {k}: {String(v)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${SEVERITY_COLORS[rule.severity]}`}>
                    {rule.severity === "error" ? "שגיאה" : rule.severity === "warning" ? "אזהרה" : "מידע"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Violations Tab */}
      {activeTab === "violations" && (
        <div className="space-y-3">
          {violations.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <p className="text-muted-foreground">אין הפרות! הכל תקין ✅</p>
            </div>
          ) : (
            violations.map(v => (
              <div key={v.id} className={`rounded-xl border p-3 ${v.resolved ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2">
                  {SEVERITY_ICONS[v.severity]}
                  <span className="font-medium text-sm">{v.description}</span>
                  {v.resolved && <span className="text-xs text-green-600">✅ טופל</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(v.created_at).toLocaleDateString("he-IL")}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Check Results Tab */}
      {activeTab === "check" && (
        <div className="space-y-3">
          {!checkResults ? (
            <p className="text-muted-foreground text-center py-8">לחץ "הרצת בדיקה" לבדיקת תאימות של כל החיילים</p>
          ) : checkResults.length === 0 ? (
            <p className="text-center py-8">✅ כל החיילים עומדים בדרישות</p>
          ) : (
            checkResults.map(r => (
              <div key={r.employee_id} className={`rounded-xl border p-4 ${
                r.is_compliant ? "border-green-200 bg-green-50/50 dark:bg-green-900/10" : "border-red-200 bg-red-50/50 dark:bg-red-900/10"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {r.is_compliant ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />}
                  <span className="font-bold">{r.employee_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.is_compliant ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {r.is_compliant ? "תקין" : `${r.violations.length} הפרות`}
                  </span>
                </div>
                {r.violations.map((v, i) => (
                  <div key={i} className="text-sm text-red-700 dark:text-red-300 mr-7">
                    {SEVERITY_ICONS[v.severity]} {v.description}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
