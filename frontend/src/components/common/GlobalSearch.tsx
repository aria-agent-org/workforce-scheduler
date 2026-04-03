import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ArrowRight } from "lucide-react";
import { Badge } from "../ui/badge";
import api, { tenantApi } from "@/lib/api";

interface SearchResult {
  id: string;
  label: string;
  sublabel?: string;
  path: string;
  category: string;
  icon?: string;
}

const staticPages: SearchResult[] = [
  { id: "nav-dashboard", label: "לוח בקרה", path: "/dashboard", category: "ניווט" },
  { id: "nav-soldiers", label: "חיילים", path: "/soldiers", category: "ניווט" },
  { id: "nav-scheduling", label: "שיבוצים", path: "/scheduling", category: "ניווט" },
  { id: "nav-attendance", label: "נוכחות", path: "/attendance", category: "ניווט" },
  { id: "nav-rules", label: "חוקים", path: "/rules", category: "ניווט" },
  { id: "nav-notifications", label: "התראות", path: "/notifications", category: "ניווט" },
  { id: "nav-reports", label: "דוחות", path: "/reports", category: "ניווט" },
  { id: "nav-settings", label: "הגדרות", path: "/settings", category: "ניווט" },
  { id: "nav-admin", label: "ניהול מערכת", path: "/admin", category: "ניווט" },
  { id: "nav-audit", label: "יומן פעולות", path: "/audit-log", category: "ניווט" },
  { id: "nav-swaps", label: "החלפות", path: "/swaps", category: "ניווט" },
  { id: "nav-help", label: "מרכז למידה", path: "/help", category: "ניווט" },
  { id: "nav-portal", label: "הפורטל שלי", path: "/my/schedule", category: "ניווט" },
  { id: "set-roles", label: "תפקידי עבודה", path: "/settings", sublabel: "הגדרות", category: "הגדרות" },
  { id: "set-statuses", label: "סטטוסי נוכחות", path: "/settings", sublabel: "הגדרות", category: "הגדרות" },
  { id: "set-codes", label: "קודי הרשמה", path: "/settings", sublabel: "הגדרות", category: "הגדרות" },
  { id: "set-channels", label: "ערוצי תקשורת", path: "/settings", sublabel: "הגדרות", category: "הגדרות" },
  { id: "set-sheets", label: "Google Sheets", path: "/settings", sublabel: "הגדרות", category: "הגדרות" },
];

const categoryColors: Record<string, string> = {
  "ניווט": "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
  "הגדרות": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "חיילים": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "משימות": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "חוקים": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "לוחות": "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [apiResults, setApiResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Keyboard shortcut: Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Search API when query changes (debounced)
  useEffect(() => {
    if (query.length < 2) { setApiResults([]); return; }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results: SearchResult[] = [];

        // Search soldiers
        const empRes = await api.get(tenantApi("/employees"), { params: { search: query, page_size: 5 } }).catch(() => null);
        if (empRes?.data?.items) {
          empRes.data.items.forEach((e: any) => {
            results.push({
              id: `emp-${e.id}`,
              label: e.full_name,
              sublabel: `מספר: ${e.employee_number}`,
              path: "/soldiers",
              category: "חיילים",
            });
          });
        }

        // Search missions
        const missRes = await api.get(tenantApi("/missions"), { params: { search: query, page_size: 5 } }).catch(() => null);
        if (missRes?.data && Array.isArray(missRes.data)) {
          missRes.data.slice(0, 5).forEach((m: any) => {
            results.push({
              id: `miss-${m.id}`,
              label: m.name,
              sublabel: `${m.date} · ${m.start_time?.slice(0, 5)}-${m.end_time?.slice(0, 5)}`,
              path: "/scheduling",
              category: "משימות",
            });
          });
        }

        // Search rules
        const ruleRes = await api.get(tenantApi("/rules"), { params: { search: query } }).catch(() => null);
        if (ruleRes?.data && Array.isArray(ruleRes.data)) {
          ruleRes.data.slice(0, 5).forEach((r: any) => {
            results.push({
              id: `rule-${r.id}`,
              label: r.name?.he || r.name,
              sublabel: r.severity === "hard" ? "קשיח" : "רך",
              path: "/rules",
              category: "חוקים",
            });
          });
        }

        // Search schedule windows
        const winRes = await api.get(tenantApi("/schedule-windows")).catch(() => null);
        if (winRes?.data && Array.isArray(winRes.data)) {
          winRes.data
            .filter((w: any) => w.name?.includes(query))
            .slice(0, 5)
            .forEach((w: any) => {
              results.push({
                id: `win-${w.id}`,
                label: w.name,
                sublabel: `${w.start_date} → ${w.end_date} · ${w.status}`,
                path: "/scheduling",
                category: "לוחות",
              });
            });
        }

        setApiResults(results);
      } catch {
        // ignore search errors
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Combine static + API results
  const staticFiltered = query.length > 0
    ? staticPages.filter(p => p.label.includes(query) || (p.sublabel && p.sublabel.includes(query)))
    : [];

  const allResults = [...apiResults, ...staticFiltered];

  // Group by category
  const grouped = allResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  const flatResults = allResults;

  // Arrow key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatResults[selectedIdx]) {
      go(flatResults[selectedIdx].path);
    }
  };

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
    setQuery("");
    setApiResults([]);
    setSelectedIdx(0);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors min-h-[40px]"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">חיפוש...</span>
        <kbd className="hidden sm:inline-block rounded bg-background px-1.5 py-0.5 text-[10px] font-mono border">⌘K</kbd>
      </button>
    );
  }

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-xl bg-card shadow-2xl border overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center border-b px-4">
          <Search className={`h-4 w-4 ${loading ? "animate-pulse text-primary-500" : "text-muted-foreground"}`} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="חיפוש חיילים, משימות, לוחות, חוקים, הגדרות..."
            className="flex-1 bg-transparent py-3.5 px-3 text-sm outline-none"
            autoComplete="off"
          />
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {Object.keys(grouped).length > 0 && (
          <div className="max-h-[350px] overflow-y-auto py-1">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="px-4 py-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">{category}</span>
                </div>
                {items.map((r) => {
                  flatIndex++;
                  const idx = flatIndex;
                  const isSelected = idx === selectedIdx;
                  return (
                    <button
                      key={r.id}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors text-start ${
                        isSelected ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-accent"
                      }`}
                      onClick={() => go(r.path)}
                      onMouseEnter={() => setSelectedIdx(idx)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{r.label}</span>
                          {r.sublabel && <span className="text-xs text-muted-foreground truncate">{r.sublabel}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge className={`text-[10px] ${categoryColors[category] || "bg-gray-100 text-gray-700"}`}>{category}</Badge>
                        {isSelected && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {query.length > 0 && allResults.length === 0 && !loading && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            אין תוצאות עבור "{query}"
          </div>
        )}

        {loading && allResults.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <div className="inline-block h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin me-2" />
            מחפש...
          </div>
        )}

        {/* Footer hint */}
        <div className="border-t px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>↑↓ ניווט · ↵ בחירה · Esc סגירה</span>
          <span>{allResults.length} תוצאות</span>
        </div>
      </div>
    </div>
  );
}
