import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Shortcut {
  key: string;
  label_he: string;
  label_en: string;
  action: () => void;
  category: string;
}

interface KBCtx {
  showHelp: boolean;
  setShowHelp: (v: boolean) => void;
  shortcuts: Shortcut[];
}

const KBContext = createContext<KBCtx>({ showHelp: false, setShowHelp: () => {}, shortcuts: [] });

export function useKeyboardShortcuts() {
  return useContext(KBContext);
}

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  const [showHelp, setShowHelp] = useState(false);
  const shortcuts: Shortcut[] = [
    { key: "?", label_he: "הצג קיצורי מקלדת", label_en: "Show shortcuts", action: () => setShowHelp(true), category: "כללי" },
    { key: "Escape", label_he: "סגור פאנל / דיאלוג", label_en: "Close panel/dialog", action: () => setShowHelp(false), category: "כללי" },
    { key: "/", label_he: "חיפוש", label_en: "Search", action: () => {
      const el = document.querySelector<HTMLInputElement>('[data-search-input]');
      if (el) { el.focus(); el.select(); }
    }, category: "כללי" },
    { key: "g d", label_he: "לוח בקרה", label_en: "Go to Dashboard", action: () => navTo("/dashboard"), category: "ניווט" },
    { key: "g s", label_he: "חיילים", label_en: "Go to Soldiers", action: () => navTo("/soldiers"), category: "ניווט" },
    { key: "g c", label_he: "שיבוצים", label_en: "Go to Scheduling", action: () => navTo("/scheduling"), category: "ניווט" },
    { key: "g a", label_he: "נוכחות", label_en: "Go to Attendance", action: () => navTo("/attendance"), category: "ניווט" },
    { key: "g r", label_he: "דוחות", label_en: "Go to Reports", action: () => navTo("/reports"), category: "ניווט" },
    { key: "g t", label_he: "הגדרות", label_en: "Go to Settings", action: () => navTo("/settings"), category: "ניווט" },
    { key: "n", label_he: "משימה חדשה", label_en: "New mission", action: () => {
      document.dispatchEvent(new CustomEvent("shavtzak:new-mission"));
    }, category: "פעולות" },
    { key: "a", label_he: "שיבוץ אוטומטי", label_en: "Auto-assign", action: () => {
      document.dispatchEvent(new CustomEvent("shavtzak:auto-assign"));
    }, category: "פעולות" },
  ];

  function navTo(path: string) {
    // Use pushState as a fallback since we're outside Router
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  useEffect(() => {
    let pendingPrefix = "";
    let prefixTimeout: any;

    const handler = (e: KeyboardEvent) => {
      // Don't trigger on form inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if ((e.target as HTMLElement)?.contentEditable === "true") return;

      // Handle prefix sequences (g + key)
      if (pendingPrefix === "g") {
        clearTimeout(prefixTimeout);
        pendingPrefix = "";
        const combo = `g ${e.key}`;
        const shortcut = shortcuts.find(s => s.key === combo);
        if (shortcut) {
          e.preventDefault();
          shortcut.action();
        }
        return;
      }

      if (e.key === "g" && !e.ctrlKey && !e.metaKey) {
        pendingPrefix = "g";
        prefixTimeout = setTimeout(() => { pendingPrefix = ""; }, 1000);
        return;
      }

      // Single key shortcuts
      const shortcut = shortcuts.find(s => s.key === e.key && !s.key.includes(" "));
      if (shortcut) {
        if (e.key === "/" || e.key === "?") e.preventDefault();
        shortcut.action();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showHelp]);

  return (
    <KBContext.Provider value={{ showHelp, setShowHelp, shortcuts }}>
      {children}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">⌨️ קיצורי מקלדת</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {["כללי", "ניווט", "פעולות"].map(category => (
              <div key={category}>
                <h3 className="text-sm font-bold text-muted-foreground mb-2">{category}</h3>
                <div className="space-y-1">
                  {shortcuts.filter(s => s.category === category).map(s => (
                    <div key={s.key} className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-muted/50">
                      <span className="text-sm">{s.label_he}</span>
                      <kbd className="rounded border bg-muted px-2 py-0.5 text-xs font-mono">{s.key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </KBContext.Provider>
  );
}
