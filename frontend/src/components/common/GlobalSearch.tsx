import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  label: string;
  path: string;
  category: string;
}

const searchablePages: SearchResult[] = [
  { label: "לוח בקרה", path: "/dashboard", category: "ניווט" },
  { label: "חיילים", path: "/soldiers", category: "ניווט" },
  { label: "שיבוצים", path: "/scheduling", category: "ניווט" },
  { label: "נוכחות", path: "/attendance", category: "ניווט" },
  { label: "חוקים", path: "/rules", category: "ניווט" },
  { label: "התראות", path: "/notifications", category: "ניווט" },
  { label: "דוחות", path: "/reports", category: "ניווט" },
  { label: "הגדרות", path: "/settings", category: "ניווט" },
  { label: "ניהול מערכת", path: "/admin", category: "ניווט" },
  { label: "יומן פעולות", path: "/audit-log", category: "ניווט" },
  { label: "החלפות", path: "/swaps", category: "ניווט" },
  { label: "מרכז עזרה", path: "/help", category: "ניווט" },
  { label: "הפורטל שלי", path: "/my/schedule", category: "חיילים" },
  { label: "תפקידי עבודה", path: "/settings", category: "הגדרות" },
  { label: "סטטוסי נוכחות", path: "/settings", category: "הגדרות" },
  { label: "קודי הרשמה", path: "/settings", category: "הגדרות" },
  { label: "משתמשים", path: "/settings", category: "הגדרות" },
  { label: "Google Sheets", path: "/settings", category: "אינטגרציות" },
];

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  const results = query.length > 0
    ? searchablePages.filter(p => p.label.includes(query) || p.category.includes(query))
    : [];

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
    setQuery("");
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg rounded-xl bg-card shadow-2xl border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center border-b px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="חיפוש עמודים, הגדרות..."
            className="flex-1 bg-transparent py-3 px-3 text-sm outline-none"
          />
          <button onClick={() => setOpen(false)} className="p-1">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        {results.length > 0 && (
          <ul className="max-h-[300px] overflow-y-auto py-2">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-accent transition-colors text-start"
                  onClick={() => go(r.path)}
                >
                  <span>{r.label}</span>
                  <span className="text-xs text-muted-foreground">{r.category}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.length > 0 && results.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            אין תוצאות עבור "{query}"
          </div>
        )}
      </div>
    </div>
  );
}
