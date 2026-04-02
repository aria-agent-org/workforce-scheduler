import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";

interface IntegrationItem {
  key: string;
  value: string;
  category: string;
  label: string;
  label_he: string;
  sensitive: boolean;
  configured: boolean;
  updated_at: string | null;
}

interface CategoryGroup {
  category: string;
  label: string;
  items: IntegrationItem[];
}

interface TestResult {
  success: boolean;
  message: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  telegram: "🤖",
  whatsapp: "💬",
  email: "📧",
  sms: "📱",
  ai: "🧠",
  push: "🔔",
  google_sheets: "📊",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  telegram: "הגדר בוט טלגרם לקבלת הודעות וצ'אט עם חיילים",
  whatsapp: "חבר את WhatsApp Business API לשליחת התראות",
  email: "הגדר שרת SMTP לשליחת אימיילים (איפוס סיסמה, הזמנות)",
  sms: "הגדר AWS SNS לשליחת SMS",
  ai: "הגדר מודל AI לבוט החכם של המערכת",
  push: "הגדר VAPID keys להתראות Push בדפדפן",
  google_sheets: "חבר Google Sheets לסנכרון נתונים",
};

export default function IntegrationsPanel() {
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("telegram");
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [settingWebhook, setSettingWebhook] = useState(false);

  const loadConfigs = useCallback(async () => {
    try {
      const res = await api.get("/admin/integrations");
      setCategories(res.data);
      if (res.data.length > 0 && !res.data.find((c: CategoryGroup) => c.category === activeTab)) {
        setActiveTab(res.data[0].category);
      }
    } catch (err) {
      console.error("Failed to load integrations", err);
    } finally {
      setLoading(false);
    }
  }, [api, activeTab]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSave = async (key: string) => {
    const value = editValues[key];
    if (value === undefined || value === "") return;

    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      await api.put(`/admin/integrations/${key}`, { value });
      showToast(`✅ ${key} נשמר בהצלחה`, "success");
      setEditValues(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await loadConfigs();
    } catch (err) {
      showToast(`❌ שגיאה בשמירת ${key}`, "error");
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleTest = async (category: string) => {
    setTesting(prev => ({ ...prev, [category]: true }));
    setTestResults(prev => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
    try {
      const res = await api.post(`/admin/integrations/test/${category}`);
      setTestResults(prev => ({ ...prev, [category]: res.data }));
      showToast(res.data.message, res.data.success ? "success" : "error");
    } catch (err) {
      setTestResults(prev => ({ ...prev, [category]: { success: false, message: "שגיאת חיבור" } }));
      showToast("❌ שגיאה בבדיקת חיבור", "error");
    } finally {
      setTesting(prev => ({ ...prev, [category]: false }));
    }
  };

  const handleSetWebhook = async () => {
    setSettingWebhook(true);
    try {
      const res = await api.post("/admin/integrations/telegram/set-webhook");
      showToast(res.data.message, res.data.success ? "success" : "error");
    } catch {
      showToast("❌ שגיאה ברישום webhook", "error");
    } finally {
      setSettingWebhook(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const activeCategory = categories.find(c => c.category === activeTab);

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${
          toast.type === "success" ? "bg-green-600" : "bg-red-600"
        }`}>
          {toast.message}
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map(cat => (
          <button
            key={cat.category}
            onClick={() => setActiveTab(cat.category)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === cat.category
                ? "bg-primary-500 text-white shadow-md"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            <span>{CATEGORY_ICONS[cat.category] || "⚙️"}</span>
            <span>{cat.label}</span>
            {cat.items.every(i => i.configured) ? (
              <span className="w-2 h-2 rounded-full bg-green-400" />
            ) : cat.items.some(i => i.configured) ? (
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-red-400" />
            )}
          </button>
        ))}
      </div>

      {/* Active Category Content */}
      {activeCategory && (
        <div className="bg-card rounded-2xl border p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                {CATEGORY_ICONS[activeCategory.category]} {activeCategory.label}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {CATEGORY_DESCRIPTIONS[activeCategory.category]}
              </p>
            </div>

            <div className="flex gap-2">
              {/* Test Connection */}
              <button
                onClick={() => handleTest(activeCategory.category)}
                disabled={testing[activeCategory.category]}
                className="px-4 py-2 text-sm rounded-xl border hover:bg-accent disabled:opacity-50 flex items-center gap-2"
              >
                {testing[activeCategory.category] ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <span>🔌</span>
                )}
                בדיקת חיבור
              </button>

              {/* Telegram-specific: Set Webhook */}
              {activeCategory.category === "telegram" && (
                <button
                  onClick={handleSetWebhook}
                  disabled={settingWebhook}
                  className="px-4 py-2 text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {settingWebhook ? <span className="animate-spin">⏳</span> : <span>🔗</span>}
                  רישום Webhook
                </button>
              )}
            </div>
          </div>

          {/* Test Result */}
          {testResults[activeCategory.category] && (
            <div className={`p-3 rounded-xl text-sm ${
              testResults[activeCategory.category].success
                ? "bg-green-50 text-green-800 border border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800"
                : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"
            }`}>
              {testResults[activeCategory.category].message}
            </div>
          )}

          {/* WhatsApp webhook URL hint */}
          {activeCategory.category === "whatsapp" && (
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm">
              <strong>Webhook URL להגדרה ב-Meta Business Console:</strong>
              <code className="block mt-1 bg-white dark:bg-gray-800 p-2 rounded font-mono text-xs select-all">
                https://shavtzak.site/webhooks/whatsapp
              </code>
            </div>
          )}

          {/* Config Fields */}
          <div className="space-y-4">
            {activeCategory.items.map(item => (
              <div key={item.key} className="space-y-1">
                <label className="text-sm font-medium flex items-center gap-2">
                  {item.label_he}
                  {item.configured ? (
                    <span className="text-xs text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">מוגדר ✓</span>
                  ) : (
                    <span className="text-xs text-red-600 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">לא מוגדר</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    type={item.sensitive ? "password" : "text"}
                    placeholder={item.configured ? item.value : `הזן ${item.label_he}...`}
                    value={editValues[item.key] || ""}
                    onChange={e => setEditValues(prev => ({ ...prev, [item.key]: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    dir="ltr"
                  />
                  <button
                    onClick={() => handleSave(item.key)}
                    disabled={!editValues[item.key] || saving[item.key]}
                    className="px-4 py-2 rounded-xl bg-primary-500 text-white text-sm hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving[item.key] ? "⏳" : "שמור"}
                  </button>
                </div>
                {item.key === "ai_system_prompt" && (
                  <textarea
                    placeholder="הזן פרומפט מערכת..."
                    value={editValues[item.key] || ""}
                    onChange={e => setEditValues(prev => ({ ...prev, [item.key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 h-24 resize-y"
                    dir="rtl"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
