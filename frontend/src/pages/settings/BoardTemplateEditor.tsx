import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  LayoutTemplate, Plus, Save, Eye, Trash2,
  Clock, User, Minus, SplitSquareHorizontal,
  AlignRight, AlignCenter, AlignLeft, Bold, Square, ChevronDown,
  ChevronUp, Grid3X3, PanelRightOpen, PanelRightClose,
  RotateCcw, Download, Upload, Table2,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────

type CellType = "header" | "subheader" | "role_label" | "soldier_slot" | "time" | "empty" | "separator";

interface GridCell {
  id: string;
  value: string;
  type: CellType;
  colspan: number;
  rowspan: number;
  merged: boolean;
  mergedBy?: string;
  backgroundColor: string;
  textColor: string;
  fontWeight: "normal" | "bold";
  textAlign: "center" | "right" | "left";
  borderTop: boolean;
  borderBottom: boolean;
  borderLeft: boolean;
  borderRight: boolean;
  missionTypeId?: string;
  workRoleId?: string;
  timeRange?: { start: string; end: string };
}

interface BoardSection {
  id: string;
  name: string;
  grid: GridCell[][];
  rows: number;
  cols: number;
  colWidths: number[];
}

interface AdvancedBoardTemplate {
  id: string;
  _dbId?: string;
  name: string;
  scheduleWindowId?: string;
  sections: BoardSection[];
  globalStyles: {
    headerColor: string;
    subheaderColor: string;
    borderColor: string;
    fontFamily: string;
  };
}

interface MissionType {
  id: string;
  name: string;
  color?: string;
}

interface WorkRole {
  id: string;
  name: string;
}

// ─── Helpers ─────────────────────────────────────

let _id = Date.now();
const uid = () => `c${++_id}_${Math.random().toString(36).slice(2, 8)}`;

function createCell(overrides: Partial<GridCell> = {}): GridCell {
  return {
    id: uid(),
    value: "",
    type: "empty",
    colspan: 1,
    rowspan: 1,
    merged: false,
    backgroundColor: "#ffffff",
    textColor: "#1a1a1a",
    fontWeight: "normal",
    textAlign: "center",
    borderTop: true,
    borderBottom: true,
    borderLeft: true,
    borderRight: true,
    ...overrides,
  };
}

function createSection(name: string, rows = 6, cols = 5): BoardSection {
  const grid: GridCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: GridCell[] = [];
    for (let c = 0; c < cols; c++) {
      if (r === 0) {
        row.push(createCell({ type: "header", fontWeight: "bold", backgroundColor: "#166534", textColor: "#ffffff", value: c === 0 ? "שעה" : `עמודה ${c}` }));
      } else {
        row.push(createCell());
      }
    }
    grid.push(row);
  }
  return {
    id: uid(),
    name,
    grid,
    rows,
    cols,
    colWidths: Array(cols).fill(120),
  };
}

function createDefaultTemplate(): AdvancedBoardTemplate {
  const section1 = createSection("סיור", 8, 6);
  // Set up a sample header row
  section1.grid[0][0] = createCell({ type: "header", value: "שעה", fontWeight: "bold", backgroundColor: "#166534", textColor: "#fff" });
  section1.grid[0][1] = createCell({ type: "header", value: "מפקד", fontWeight: "bold", backgroundColor: "#166534", textColor: "#fff" });
  section1.grid[0][2] = createCell({ type: "header", value: "נהג", fontWeight: "bold", backgroundColor: "#166534", textColor: "#fff" });
  section1.grid[0][3] = createCell({ type: "header", value: "לוחמ/ת", fontWeight: "bold", backgroundColor: "#166534", textColor: "#fff" });
  section1.grid[0][4] = createCell({ type: "header", value: "לוחמ/ת", fontWeight: "bold", backgroundColor: "#166534", textColor: "#fff" });
  section1.grid[0][5] = createCell({ type: "header", value: "הערות", fontWeight: "bold", backgroundColor: "#166534", textColor: "#fff" });
  // Time slots
  const times = ["07:00-11:00", "11:00-15:00", "15:00-19:00", "19:00-23:00", "23:00-03:00", "03:00-07:00"];
  for (let i = 0; i < times.length && i + 1 < section1.rows; i++) {
    section1.grid[i + 1][0] = createCell({ type: "time", value: times[i], fontWeight: "bold", backgroundColor: "#f0fdf4" });
    for (let c = 1; c < 5; c++) {
      section1.grid[i + 1][c] = createCell({ type: "soldier_slot" });
    }
    section1.grid[i + 1][5] = createCell({ type: "empty" });
  }
  // Set first row time range
  section1.grid[1][0].timeRange = { start: "07:00", end: "11:00" };
  section1.colWidths = [100, 120, 120, 120, 120, 150];

  return {
    id: uid(),
    name: "תבנית ברירת מחדל",
    sections: [section1],
    globalStyles: {
      headerColor: "#166534",
      subheaderColor: "#15803d",
      borderColor: "#d1d5db",
      fontFamily: "inherit",
    },
  };
}

function cloneTemplate(t: AdvancedBoardTemplate): AdvancedBoardTemplate {
  return JSON.parse(JSON.stringify(t));
}

// Get cells in a rectangular selection
function getSelectionBounds(cells: GridCell[][], selectedIds: Set<string>): { minR: number; maxR: number; minC: number; maxC: number } | null {
  let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (selectedIds.has(cells[r][c].id)) {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }
  if (maxR === -1) return null;
  return { minR, maxR, minC, maxC };
}

// ─── Context Menu Component ───────────────────────

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: { label: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean; separator?: boolean }[];
}

function ContextMenu({ x, y, onClose, items }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[200px]"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="border-t border-border my-1" />
        ) : (
          <button
            key={i}
            className={cn(
              "w-full px-3 py-2 text-right text-sm flex items-center gap-2 hover:bg-muted transition-colors",
              item.disabled && "opacity-40 cursor-not-allowed"
            )}
            onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
            disabled={item.disabled}
          >
            {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  );
}

// ─── Color Picker Popover ─────────────────────────

const PRESET_COLORS = [
  "#ffffff", "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#6b7280", "#374151", "#1f2937", "#111827", "#000000",
  "#fef2f2", "#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d",
  "#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12",
  "#fefce8", "#fef9c3", "#fef08a", "#fde047", "#facc15", "#eab308", "#ca8a04", "#a16207", "#854d0e", "#713f12",
  "#f0fdf4", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d", "#166534", "#14532d",
  "#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a",
  "#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95",
  "#fdf2f8", "#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777", "#be185d", "#9d174d", "#831843",
];

function ColorPickerPopover({ color, onChange, label }: { color: string; onChange: (c: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(color);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-1.5 px-2 py-1 rounded border border-border hover:bg-muted text-xs"
        onClick={() => setOpen(!open)}
        title={label}
      >
        <div className="w-4 h-4 rounded border border-border" style={{ backgroundColor: color }} />
        <span className="hidden sm:inline">{label}</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-xl p-3 w-[260px]">
          <div className="grid grid-cols-10 gap-1 mb-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                className={cn(
                  "w-5 h-5 rounded border transition-transform hover:scale-125",
                  c === color ? "ring-2 ring-blue-500 ring-offset-1" : "border-border"
                )}
                style={{ backgroundColor: c }}
                onClick={() => { onChange(c); setOpen(false); }}
              />
            ))}
          </div>
          <div className="flex gap-1 mt-2">
            <Input
              type="color"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="w-8 h-8 p-0 border-0 cursor-pointer"
            />
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="flex-1 h-8 text-xs"
              placeholder="#hex"
            />
            <Button size="sm" className="h-8 text-xs" onClick={() => { onChange(custom); setOpen(false); }}>
              בחר
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────

export default function BoardTemplateEditor() {
  const { toast } = useToast();

  // Data
  const [templates, setTemplates] = useState<AdvancedBoardTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<AdvancedBoardTemplate | null>(null);
  const [missionTypes, setMissionTypes] = useState<MissionType[]>([]);
  const [workRoles, setWorkRoles] = useState<WorkRole[]>([]);
  const [scheduleWindows, setScheduleWindows] = useState<any[]>([]);

  // UI state
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [activeSectionId, setActiveSectionId] = useState<string>("");
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sectionId: string; row: number; col: number } | null>(null);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplateList, setShowTemplateList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragItem, setDragItem] = useState<{ type: string; data: any } | null>(null);
  const [editingSectionName, setEditingSectionName] = useState<string | null>(null);
  const [sectionNameInput, setSectionNameInput] = useState("");
  const [undoStack, setUndoStack] = useState<AdvancedBoardTemplate[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  // Column resize
  const [resizingCol, setResizingCol] = useState<{ sectionId: string; colIndex: number; startX: number; startWidth: number } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  // ─── Load Data ─────────────────────────────────

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [mtRes, wrRes, swRes] = await Promise.all([
        api.get(tenantApi("/mission-types")).catch(() => ({ data: [] })),
        api.get(tenantApi("/settings/work-roles")).catch(() => ({ data: [] })),
        api.get(tenantApi("/schedule-windows")).catch(() => ({ data: [] })),
      ]);
      setMissionTypes(Array.isArray(mtRes.data) ? mtRes.data : []);
      setWorkRoles(Array.isArray(wrRes.data) ? wrRes.data : []);
      setScheduleWindows(Array.isArray(swRes.data) ? swRes.data : []);
    } catch { /* silent */ }

    // Load saved templates from DB
    try {
      const res = await api.get(tenantApi("/daily-board-templates"));
      const loaded = Array.isArray(res.data) ? res.data : [];
      if (loaded.length > 0) {
        // Convert DB format to advanced template format
        const converted = loaded.map((t: any) => {
          if (t.layout?.sections) {
            // Already in advanced format — ensure colWidths exist on each section
            const sections = (t.layout.sections || []).map((s: any) => ({
              ...s,
              grid: s.grid || [],
              rows: s.rows || (s.grid?.length || 0),
              cols: s.cols || (s.grid?.[0]?.length || 5),
              colWidths: s.colWidths || Array(s.cols || s.grid?.[0]?.length || 5).fill(120),
            }));
            return {
              id: t.layout.id || t.id,
              _dbId: t.id,
              name: t.name,
              sections,
              globalStyles: t.layout.globalStyles || { headerColor: "#166534", subheaderColor: "#22c55e", borderColor: "#d1d5db", fontFamily: "inherit" },
              scheduleWindowId: t.layout.scheduleWindowId || null,
            };
          }
          // Basic template — create a proper default section with grid
          const defaultGrid: any[][] = [];
          const defaultRows = 6;
          const defaultCols = 6;
          for (let r = 0; r < defaultRows; r++) {
            defaultGrid[r] = [];
            for (let c = 0; c < defaultCols; c++) {
              defaultGrid[r][c] = createCell(r === 0 ? { type: "header", fontWeight: "bold", backgroundColor: "#166534", textColor: "#fff" } : { type: "empty" });
            }
          }
          return {
            id: t.id,
            _dbId: t.id,
            name: t.name,
            sections: [{ id: `sec_${Date.now()}`, name: t.name, grid: defaultGrid, rows: defaultRows, cols: defaultCols, colWidths: Array(defaultCols).fill(120) }],
            globalStyles: { headerColor: "#166534", subheaderColor: "#22c55e", borderColor: "#d1d5db", fontFamily: "inherit" },
            scheduleWindowId: null,
          };
        });
        setTemplates(converted);
        if (converted.length > 0 && !activeTemplate) {
          setActiveTemplate(converted[0]);
        }
      }
    } catch { /* silent */ }
    
    // Also try loading from settings (backup/legacy)
    try {
      const settingsRes = await api.get(tenantApi("/settings"));
      const settings = settingsRes.data || [];
      for (const s of settings) {
        if (s.key?.startsWith("board_grid_template") && s.value) {
          try {
            const raw = typeof s.value === "string" ? JSON.parse(s.value)
              : s.value._v ? (typeof s.value._v === "string" ? JSON.parse(s.value._v) : s.value._v)
              : s.value;
            if (raw.sections && templates.length === 0) {
              setTemplates([raw]);
              if (!activeTemplate) setActiveTemplate(raw);
            }
          } catch { /* parse error */ }
        }
      }
    } catch { /* silent */ }
  };

  // ─── Push Undo ──────────────────────────────────

  const pushUndo = useCallback(() => {
    if (!activeTemplate) return;
    setUndoStack((prev) => [...prev.slice(-19), cloneTemplate(activeTemplate)]);
  }, [activeTemplate]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setActiveTemplate(prev);
  }, [undoStack]);

  // ─── Template Actions ──────────────────────────

  const createNewTemplate = () => {
    const t = createDefaultTemplate();
    setActiveTemplate(t);
    setActiveSectionId(t.sections[0]?.id || "");
    setShowTemplateList(false);
    setSelectedCells(new Set());
  };

  const openTemplate = (t: AdvancedBoardTemplate) => {
    setActiveTemplate(cloneTemplate(t));
    setActiveSectionId(t.sections[0]?.id || "");
    setShowTemplateList(false);
    setSelectedCells(new Set());
  };

  const saveTemplate = async () => {
    if (!activeTemplate) return;
    setSaving(true);
    try {
      const payload = {
        name: activeTemplate.name,
        layout: {
          sections: activeTemplate.sections,
          globalStyles: activeTemplate.globalStyles,
          scheduleWindowId: activeTemplate.scheduleWindowId,
        },
        columns: { version: "advanced_v2" },
      };

      // Check if template already exists in DB (has a UUID id)
      const isExisting = templates.some((t) => t.id === activeTemplate.id && t._dbId);
      
      if (isExisting) {
        // Update existing
        const dbId = templates.find((t) => t.id === activeTemplate.id)?._dbId;
        if (dbId) {
          await api.patch(tenantApi(`/daily-board-templates/${dbId}`), payload);
        } else {
          // Fallback: create new if dbId missing
          const res = await api.post(tenantApi("/daily-board-templates"), payload);
          setTemplates((prev) => prev.map((t) =>
            t.id === activeTemplate.id ? { ...t, _dbId: res.data.id } : t
          ));
        }
      } else {
        // Create new
        const res = await api.post(tenantApi("/daily-board-templates"), payload);
        // Add to templates list with DB id
        const saved = { ...activeTemplate, _dbId: res.data.id };
        setTemplates((prev) => {
          const exists = prev.some((t) => t.id === activeTemplate.id);
          if (exists) {
            return prev.map((t) => t.id === activeTemplate.id ? saved : t);
          }
          return [...prev, saved];
        });
      }

      // Also save to settings as backup
      try {
        const key = activeTemplate.scheduleWindowId
          ? `board_grid_template_${activeTemplate.scheduleWindowId}`
          : `board_grid_template_default`;
        await api.post(tenantApi("/settings"), { key, value: JSON.stringify(activeTemplate) });
      } catch { /* settings backup is optional */ }

      toast("success", "התבנית נשמרה בהצלחה");
    } catch (err: any) {
      console.error("Save template error:", err);
      toast("error", err.response?.data?.detail || "שגיאה בשמירת התבנית");
    } finally {
      setSaving(false);
    }
  };

  const exportTemplate = () => {
    if (!activeTemplate) return;
    const blob = new Blob([JSON.stringify(activeTemplate, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `board-template-${activeTemplate.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.sections && data.globalStyles) {
          setActiveTemplate(data);
          setActiveSectionId(data.sections[0]?.id || "");
          toast("success", "התבנית יובאה בהצלחה");
        } else {
          toast("error", "קובץ לא תקין");
        }
      } catch {
        toast("error", "שגיאה בקריאת הקובץ");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ─── Section Operations ────────────────────────

  const activeSection = useMemo(
    () => activeTemplate?.sections.find((s) => s.id === activeSectionId) || null,
    [activeTemplate, activeSectionId]
  );

  const updateSection = useCallback(
    (sectionId: string, updater: (s: BoardSection) => BoardSection) => {
      if (!activeTemplate) return;
      pushUndo();
      setActiveTemplate((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.map((s) => (s.id === sectionId ? updater({ ...s }) : s)),
        };
      });
    },
    [activeTemplate, pushUndo]
  );

  const addSection = () => {
    if (!activeTemplate) return;
    pushUndo();
    const s = createSection(`קטע ${activeTemplate.sections.length + 1}`);
    setActiveTemplate((prev) => prev ? { ...prev, sections: [...prev.sections, s] } : prev);
    setActiveSectionId(s.id);
  };

  const removeSection = (id: string) => {
    if (!activeTemplate || activeTemplate.sections.length <= 1) return;
    pushUndo();
    setActiveTemplate((prev) => {
      if (!prev) return prev;
      const sections = prev.sections.filter((s) => s.id !== id);
      return { ...prev, sections };
    });
    if (activeSectionId === id) {
      setActiveSectionId(activeTemplate.sections.find((s) => s.id !== id)?.id || "");
    }
  };

  const moveSectionUp = (id: string) => {
    if (!activeTemplate) return;
    const idx = activeTemplate.sections.findIndex((s) => s.id === id);
    if (idx <= 0) return;
    pushUndo();
    setActiveTemplate((prev) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      [sections[idx - 1], sections[idx]] = [sections[idx], sections[idx - 1]];
      return { ...prev, sections };
    });
  };

  const moveSectionDown = (id: string) => {
    if (!activeTemplate) return;
    const idx = activeTemplate.sections.findIndex((s) => s.id === id);
    if (idx < 0 || idx >= activeTemplate.sections.length - 1) return;
    pushUndo();
    setActiveTemplate((prev) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      [sections[idx], sections[idx + 1]] = [sections[idx + 1], sections[idx]];
      return { ...prev, sections };
    });
  };

  // ─── Grid Operations ───────────────────────────

  const addRow = useCallback((sectionId: string, afterRow: number) => {
    updateSection(sectionId, (s) => {
      const newRow = Array.from({ length: s.cols }, () => createCell());
      const grid = [...s.grid];
      grid.splice(afterRow + 1, 0, newRow);
      return { ...s, grid, rows: s.rows + 1 };
    });
  }, [updateSection]);

  const addCol = useCallback((sectionId: string, afterCol: number) => {
    updateSection(sectionId, (s) => {
      const grid = s.grid.map((row) => {
        const newRow = [...row];
        newRow.splice(afterCol + 1, 0, createCell());
        return newRow;
      });
      const colWidths = [...(s.colWidths || [])];
      colWidths.splice(afterCol + 1, 0, 120);
      return { ...s, grid, cols: s.cols + 1, colWidths };
    });
  }, [updateSection]);

  const deleteRow = useCallback((sectionId: string, rowIdx: number) => {
    updateSection(sectionId, (s) => {
      if (s.rows <= 1) return s;
      const grid = s.grid.filter((_, i) => i !== rowIdx);
      return { ...s, grid, rows: s.rows - 1 };
    });
  }, [updateSection]);

  const deleteCol = useCallback((sectionId: string, colIdx: number) => {
    updateSection(sectionId, (s) => {
      if (s.cols <= 1) return s;
      const grid = s.grid.map((row) => row.filter((_, i) => i !== colIdx));
      const colWidths = (s.colWidths || []).filter((_, i) => i !== colIdx);
      return { ...s, grid, cols: s.cols - 1, colWidths };
    });
  }, [updateSection]);

  // ─── Merge / Split ─────────────────────────────

  const mergeCells = useCallback(() => {
    if (!activeSection || selectedCells.size < 2) return;
    const bounds = getSelectionBounds(activeSection.grid, selectedCells);
    if (!bounds) return;

    const { minR, maxR, minC, maxC } = bounds;
    // Verify all cells in rectangle are selected (must be a perfect rectangle)
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (activeSection.grid[r][c].merged) {
          toast("error", "לא ניתן למזג תאים שכבר ממוזגים. פצל אותם קודם.");
          return;
        }
      }
    }

    updateSection(activeSectionId, (s) => {
      const grid = s.grid.map((row) => row.map((cell) => ({ ...cell })));
      const topLeft = grid[minR][minC];
      topLeft.colspan = maxC - minC + 1;
      topLeft.rowspan = maxR - minR + 1;

      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (r === minR && c === minC) continue;
          grid[r][c] = { ...grid[r][c], merged: true, mergedBy: topLeft.id };
        }
      }
      return { ...s, grid };
    });
    setSelectedCells(new Set());
  }, [activeSection, selectedCells, activeSectionId, updateSection, toast]);

  const splitCell = useCallback((sectionId: string, cellId: string) => {
    updateSection(sectionId, (s) => {
      const grid = s.grid.map((row) => row.map((cell) => ({ ...cell })));
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const cell = grid[r][c];
          if (cell.id === cellId && (cell.colspan > 1 || cell.rowspan > 1)) {
            const endR = r + cell.rowspan;
            const endC = c + cell.colspan;
            for (let rr = r; rr < endR && rr < grid.length; rr++) {
              for (let cc = c; cc < endC && cc < grid[rr].length; cc++) {
                grid[rr][cc] = { ...grid[rr][cc], merged: false, mergedBy: undefined, colspan: 1, rowspan: 1 };
              }
            }
            return { ...s, grid };
          }
        }
      }
      return s;
    });
  }, [updateSection]);

  // ─── Cell Selection ─────────────────────────────

  const handleCellClick = useCallback((cellId: string, sectionId: string, e: React.MouseEvent) => {
    if (sectionId !== activeSectionId) {
      setActiveSectionId(sectionId);
      setSelectedCells(new Set([cellId]));
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelectedCells((prev) => {
        const next = new Set(prev);
        if (next.has(cellId)) next.delete(cellId);
        else next.add(cellId);
        return next;
      });
    } else {
      setSelectedCells(new Set([cellId]));
    }
  }, [activeSectionId]);

  const handleCellDoubleClick = useCallback((cellId: string) => {
    setEditingCellId(cellId);
  }, []);

  const handleCellEdit = useCallback((sectionId: string, cellId: string, value: string) => {
    updateSection(sectionId, (s) => ({
      ...s,
      grid: s.grid.map((row) =>
        row.map((cell) => (cell.id === cellId ? { ...cell, value } : cell))
      ),
    }));
  }, [updateSection]);

  const handleCellContextMenu = useCallback((e: React.MouseEvent, sectionId: string, row: number, col: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, sectionId, row, col });
  }, []);

  // ─── Apply Styles to Selection ──────────────────

  const applyToSelected = useCallback(
    (updater: (cell: GridCell) => GridCell) => {
      if (!activeSectionId || selectedCells.size === 0) return;
      pushUndo();
      setActiveTemplate((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.map((s) =>
            s.id === activeSectionId
              ? {
                  ...s,
                  grid: s.grid.map((row) =>
                    row.map((cell) => (selectedCells.has(cell.id) ? updater({ ...cell }) : cell))
                  ),
                }
              : s
          ),
        };
      });
    },
    [activeSectionId, selectedCells, pushUndo]
  );

  // Get first selected cell for property display
  const selectedCell = useMemo(() => {
    if (!activeSection || selectedCells.size === 0) return null;
    for (const row of activeSection.grid) {
      for (const cell of row) {
        if (selectedCells.has(cell.id)) return cell;
      }
    }
    return null;
  }, [activeSection, selectedCells]);

  // ─── Drag & Drop ────────────────────────────────

  const handleDragStart = (type: string, data: any) => {
    setDragItem({ type, data });
  };

  const handleDrop = useCallback((sectionId: string, row: number, col: number) => {
    if (!dragItem) return;
    pushUndo();
    updateSection(sectionId, (s) => {
      const grid = s.grid.map((r) => r.map((c) => ({ ...c })));
      const cell = grid[row]?.[col];
      if (!cell || cell.merged) return s;

      if (dragItem.type === "missionType") {
        const n = dragItem.data.name;
        const newName = typeof n === 'object' ? (n.he || n.en || '') : String(n);
        // Multi-mission: if cell already has a value, append with pipe separator
        if (cell.value && cell.missionTypeId) {
          cell.value = cell.value + " | " + newName;
          cell.missionTypeId = cell.missionTypeId + "|" + dragItem.data.id;
        } else {
          cell.value = newName;
          cell.missionTypeId = dragItem.data.id;
        }
        cell.type = "header";
        cell.fontWeight = "bold";
        if (dragItem.data.color && !cell.backgroundColor?.includes("#166534")) {
          cell.backgroundColor = dragItem.data.color;
        }
      } else if (dragItem.type === "workRole") {
        const n = dragItem.data.name;
        cell.value = typeof n === 'object' ? (n.he || n.en || '') : String(n);
        cell.workRoleId = dragItem.data.id;
        cell.type = "role_label";
        cell.fontWeight = "bold";
      } else if (dragItem.type === "timeRange") {
        cell.value = `${dragItem.data.start}-${dragItem.data.end}`;
        cell.timeRange = dragItem.data;
        cell.type = "time";
      }

      return { ...s, grid };
    });
    setDragItem(null);
  }, [dragItem, pushUndo, updateSection]);

  // ─── Column Resize ─────────────────────────────

  useEffect(() => {
    if (!resizingCol) return;
    const handleMove = (e: MouseEvent) => {
      const diff = e.clientX - resizingCol.startX;
      const newWidth = Math.max(50, resizingCol.startWidth + diff);
      setActiveTemplate((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.map((s) => {
            if (s.id !== resizingCol.sectionId) return s;
            const colWidths = [...(s.colWidths || [])];
            colWidths[resizingCol.colIndex] = newWidth;
            return { ...s, colWidths };
          }),
        };
      });
    };
    const handleUp = () => setResizingCol(null);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [resizingCol]);

  // ─── Keyboard Shortcuts ─────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedCells(new Set());
        setEditingCellId(null);
        setContextMenu(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
      if (e.key === "Delete" && selectedCells.size > 0 && !editingCellId) {
        applyToSelected((c) => ({ ...c, value: "" }));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undo, selectedCells, editingCellId, applyToSelected]);

  // ─── Template List View ─────────────────────────

  if (showTemplateList && !activeTemplate) {
    return (
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <LayoutTemplate className="w-6 h-6" />
              עורך לוח מתקדם
            </h2>
            <p className="text-muted-foreground text-sm mt-1">עריכת תבניות לוח שיבוצים בסגנון Excel — מיזוג תאים, צבעים, קטעים מרובים</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={createNewTemplate}>
              <Plus className="w-4 h-4 ml-1" />
              תבנית חדשה
            </Button>
            <label className="cursor-pointer">
              <input type="file" accept=".json" className="hidden" onChange={importTemplate} />
              <Button variant="outline" asChild>
                <span><Upload className="w-4 h-4 ml-1" />ייבוא</span>
              </Button>
            </label>
          </div>
        </div>

        {templates.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Table2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-lg mb-2">אין תבניות לוח עדיין</p>
              <p className="text-muted-foreground/70 text-sm mb-6">צור תבנית חדשה כדי להתחיל לעצב את לוח השיבוצים</p>
              <Button onClick={createNewTemplate}>
                <Plus className="w-4 h-4 ml-1" />
                צור תבנית ראשונה
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <Card
                key={t.id}
                className="cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
                onClick={() => openTemplate(t)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{t.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {t.sections.length} קטעים • {t.sections.reduce((a, s) => a + s.rows, 0)} שורות
                      </p>
                    </div>
                    <Badge className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">{t.scheduleWindowId ? "מקושר" : "כללי"}</Badge>
                  </div>
                  {/* Mini preview */}
                  <div className="border rounded p-2 bg-muted/50 space-y-1">
                    {t.sections.slice(0, 2).map((s) => (
                      <div key={s.id} className="text-xs">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground mr-1">({s.rows}×{s.cols})</span>
                      </div>
                    ))}
                    {t.sections.length > 2 && (
                      <span className="text-xs text-muted-foreground">+{t.sections.length - 2} עוד...</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Preview Mode ───────────────────────────────

  if (showPreview && activeTemplate) {
    return (
      <div className="space-y-4" dir="rtl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Eye className="w-5 h-5" />
            תצוגה מקדימה — {activeTemplate.name}
          </h2>
          <Button variant="outline" onClick={() => setShowPreview(false)}>
            חזרה לעריכה
          </Button>
        </div>
        {activeTemplate.sections.map((section) => (
          <div key={section.id} className="border rounded-lg overflow-hidden">
            <div className="bg-gray-800 text-white px-4 py-2 font-bold text-center text-lg">
              {section.name}
            </div>
            <div
              className="overflow-x-auto"
              style={{
                display: "grid",
                gridTemplateColumns: (section.colWidths || Array(section.cols || 5).fill(120)).map((w) => `${w}px`).join(" "),
                direction: "rtl",
              }}
            >
              {(section.grid || []).flatMap((row, rIdx) =>
                row.map((cell, cIdx) => {
                  if (cell.merged) return null;
                  return (
                    <div
                      key={cell.id}
                      style={{
                        gridColumn: `${cIdx + 1} / span ${cell.colspan}`,
                        gridRow: `${rIdx + 1} / span ${cell.rowspan}`,
                        backgroundColor: cell.backgroundColor,
                        color: cell.textColor,
                        fontWeight: cell.fontWeight,
                        textAlign: cell.textAlign,
                        borderTop: cell.borderTop ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                        borderBottom: cell.borderBottom ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                        borderLeft: cell.borderLeft ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                        borderRight: cell.borderRight ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                        padding: "6px 8px",
                        minHeight: "32px",
                        fontSize: "13px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: cell.textAlign === "center" ? "center" : cell.textAlign === "left" ? "flex-start" : "flex-end",
                      }}
                    >
                      {cell.value}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activeTemplate) return null;

  // ─── Mobile Read-Only ───────────────────────────

  if (isMobile) {
    return (
      <div className="space-y-4 p-4" dir="rtl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{activeTemplate.name}</h2>
          <Button variant="outline" size="sm" onClick={() => { setActiveTemplate(null); setShowTemplateList(true); }}>
            חזרה
          </Button>
        </div>
        <p className="text-sm text-muted-foreground bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-2">
          📱 תצוגה בלבד — העריכה זמינה במחשב שולחני
        </p>
        {activeTemplate.sections.map((section) => (
          <div key={section.id} className="border rounded-lg overflow-x-auto">
            <div className="bg-gray-800 text-white px-3 py-1.5 font-bold text-center">
              {section.name}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: (section.colWidths || Array(section.cols || 5).fill(120)).map((w) => `${Math.max(60, w * 0.7)}px`).join(" "),
                direction: "rtl",
                fontSize: "11px",
              }}
            >
              {(section.grid || []).flatMap((row, rIdx) =>
                row.map((cell, cIdx) => {
                  if (cell.merged) return null;
                  return (
                    <div
                      key={cell.id}
                      style={{
                        gridColumn: `${cIdx + 1} / span ${cell.colspan}`,
                        gridRow: `${rIdx + 1} / span ${cell.rowspan}`,
                        backgroundColor: cell.backgroundColor,
                        color: cell.textColor,
                        fontWeight: cell.fontWeight,
                        textAlign: cell.textAlign,
                        border: `1px solid ${activeTemplate.globalStyles.borderColor}`,
                        padding: "3px 4px",
                        minHeight: "24px",
                      }}
                    >
                      {cell.value}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── Editor View ────────────────────────────────

  // Safety: if no active template, show template list
  if (!activeTemplate) {
    return (
      <div className="p-8 text-center text-muted-foreground" dir="rtl">
        <LayoutTemplate className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">לא נבחרה תבנית</p>
        <Button className="mt-4" onClick={() => { setShowTemplateList(true); }}>
          חזור לרשימת התבניות
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[600px]" dir="rtl">
      {/* ─── Top Bar ─────────────────────────────── */}
      <div className="border-b bg-card px-4 py-2 flex items-center gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setActiveTemplate(null); setShowTemplateList(true); }}
        >
          ← חזרה
        </Button>

        <div className="h-6 border-r border-border mx-1" />

        <Input
          value={activeTemplate.name}
          onChange={(e) =>
            setActiveTemplate((prev) => prev ? { ...prev, name: e.target.value } : prev)
          }
          className="w-48 h-8 text-sm font-semibold"
        />

        <Select
          value={activeTemplate.scheduleWindowId || ""}
          onChange={(e) =>
            setActiveTemplate((prev) =>
              prev ? { ...prev, scheduleWindowId: e.target.value || undefined } : prev
            )
          }
          className="w-44 h-8 text-xs"
        >
          <option value="">ללא חלון שיבוץ</option>
          {scheduleWindows.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </Select>

        <div className="h-6 border-r border-border mx-1" />

        <Button variant="outline" size="sm" onClick={addSection} className="text-xs h-7">
          <Plus className="w-3 h-3 ml-1" />
          הוסף קטע
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7"
          disabled={selectedCells.size < 2}
          onClick={mergeCells}
        >
          <Grid3X3 className="w-3 h-3 ml-1" />
          מזג תאים
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7"
          disabled={!selectedCell || (selectedCell.colspan <= 1 && selectedCell.rowspan <= 1)}
          onClick={() => selectedCell && splitCell(activeSectionId, selectedCell.id)}
        >
          <SplitSquareHorizontal className="w-3 h-3 ml-1" />
          פצל
        </Button>

        <div className="h-6 border-r border-border mx-1" />

        <ColorPickerPopover
          color={selectedCell?.backgroundColor || "#ffffff"}
          onChange={(c) => applyToSelected((cell) => ({ ...cell, backgroundColor: c }))}
          label="רקע"
        />
        <ColorPickerPopover
          color={selectedCell?.textColor || "#1a1a1a"}
          onChange={(c) => applyToSelected((cell) => ({ ...cell, textColor: c }))}
          label="טקסט"
        />

        <button
          className={cn(
            "px-2 py-1 rounded border text-xs h-7",
            selectedCell?.fontWeight === "bold" ? "bg-accent border-border" : "border-border hover:bg-muted/50"
          )}
          onClick={() => applyToSelected((c) => ({ ...c, fontWeight: c.fontWeight === "bold" ? "normal" : "bold" }))}
        >
          <Bold className="w-3 h-3" />
        </button>

        <div className="flex border rounded overflow-hidden h-7">
          {(["right", "center", "left"] as const).map((align) => {
            const Icon = align === "right" ? AlignRight : align === "center" ? AlignCenter : AlignLeft;
            return (
              <button
                key={align}
                className={cn(
                  "px-1.5 text-xs border-l first:border-l-0",
                  selectedCell?.textAlign === align ? "bg-accent" : "hover:bg-muted/50"
                )}
                onClick={() => applyToSelected((c) => ({ ...c, textAlign: align }))}
              >
                <Icon className="w-3 h-3" />
              </button>
            );
          })}
        </div>

        <button
          className={cn(
            "px-2 py-1 rounded border text-xs h-7",
            selectedCell?.borderTop ? "bg-accent border-border" : "border-border"
          )}
          onClick={() =>
            applyToSelected((c) => {
              const allOn = c.borderTop && c.borderBottom && c.borderLeft && c.borderRight;
              return { ...c, borderTop: !allOn, borderBottom: !allOn, borderLeft: !allOn, borderRight: !allOn };
            })
          }
          title="גבולות"
        >
          <Square className="w-3 h-3" />
        </button>

        <div className="h-6 border-r border-border mx-1" />

        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7"
          onClick={() => activeSection && addRow(activeSectionId, (activeSection.rows || 1) - 1)}
        >
          <Plus className="w-3 h-3 ml-0.5" />שורה
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7"
          onClick={() => activeSection && addCol(activeSectionId, (activeSection.cols || 1) - 1)}
        >
          <Plus className="w-3 h-3 ml-0.5" />עמודה
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7"
          title="התאמת רוחב עמודות לפי משך זמן"
          onClick={() => {
            if (!activeSection) return;
            pushUndo();
            // Fit column widths based on time ranges in cells
            updateSection(activeSectionId, (s) => {
              const colWidths = [...s.colWidths];
              const BASE_UNIT = 30; // pixels per hour
              // Scan first column for time ranges and adjust row heights proportionally
              // Scan all columns for time ranges
              for (let c = 0; c < s.cols; c++) {
                let totalDuration = 0;
                let timeCount = 0;
                for (let r = 0; r < s.rows; r++) {
                  const cell = s.grid[r]?.[c];
                  if (cell?.timeRange?.start && cell?.timeRange?.end) {
                    const [sh, sm] = cell.timeRange.start.split(":").map(Number);
                    const [eh, em] = cell.timeRange.end.split(":").map(Number);
                    let dur = (eh * 60 + em) - (sh * 60 + sm);
                    if (dur <= 0) dur += 24 * 60; // overnight
                    totalDuration += dur / 60;
                    timeCount++;
                  }
                }
                if (timeCount > 0) {
                  const avgDuration = totalDuration / timeCount;
                  colWidths[c] = Math.max(60, Math.round(avgDuration * BASE_UNIT));
                }
              }
              return { ...s, colWidths };
            });
            toast("success", "רוחב עמודות הותאם לפי משך זמן");
          }}
        >
          <Clock className="w-3 h-3 ml-0.5" />התאם לזמן
        </Button>

        <div className="flex-1" />

        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={undo} disabled={undoStack.length === 0}>
          <RotateCcw className="w-3 h-3 ml-1" />
          ביטול
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={exportTemplate}>
          <Download className="w-3 h-3 ml-1" />
          ייצוא
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setShowPreview(true)}>
          <Eye className="w-3 h-3 ml-1" />
          תצוגה מקדימה
        </Button>
        <button
          className="p-1.5 rounded hover:bg-muted text-muted-foreground"
          onClick={() => setShowSidePanel(!showSidePanel)}
          title={showSidePanel ? "הסתר פאנל" : "הצג פאנל"}
        >
          {showSidePanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
        </button>
        <Button size="sm" className="h-7 text-xs" onClick={saveTemplate} disabled={saving}>
          <Save className="w-3 h-3 ml-1" />
          {saving ? "שומר..." : "שמור"}
        </Button>
      </div>

      {/* ─── Section Tabs ────────────────────────── */}
      <div className="border-b bg-muted/50 px-4 py-1 flex items-center gap-1 overflow-x-auto">
        {activeTemplate.sections.map((s) => (
          <div
            key={s.id}
            className={cn(
              "flex items-center gap-1 px-3 py-1 rounded-t text-sm cursor-pointer border border-b-0 transition-colors",
              s.id === activeSectionId
                ? "bg-card border-border font-semibold"
                : "bg-muted border-transparent hover:bg-accent text-foreground/80"
            )}
            onClick={() => setActiveSectionId(s.id)}
          >
            {editingSectionName === s.id ? (
              <Input
                value={sectionNameInput}
                onChange={(e) => setSectionNameInput(e.target.value)}
                onBlur={() => {
                  updateSection(s.id, (sec) => ({ ...sec, name: sectionNameInput || sec.name }));
                  setEditingSectionName(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateSection(s.id, (sec) => ({ ...sec, name: sectionNameInput || sec.name }));
                    setEditingSectionName(null);
                  }
                }}
                className="w-24 h-5 text-xs px-1"
                autoFocus
              />
            ) : (
              <span
                onDoubleClick={() => {
                  setEditingSectionName(s.id);
                  setSectionNameInput(s.name);
                }}
              >
                {s.name}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">({s.rows}×{s.cols})</span>
            <div className="flex gap-0.5 mr-1">
              <button onClick={(e) => { e.stopPropagation(); moveSectionUp(s.id); }} className="hover:text-blue-600" title="הזז למעלה">
                <ChevronUp className="w-3 h-3" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); moveSectionDown(s.id); }} className="hover:text-blue-600" title="הזז למטה">
                <ChevronDown className="w-3 h-3" />
              </button>
              {activeTemplate.sections.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeSection(s.id); }}
                  className="hover:text-red-600"
                  title="מחק קטע"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          className="px-2 py-1 text-muted-foreground hover:text-foreground/80 text-sm"
          onClick={addSection}
          title="הוסף קטע"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* ─── Main Content ────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Grid Area */}
        <div className="flex-1 overflow-auto p-4 bg-muted" ref={gridRef}>
          {activeTemplate.sections.map((section) => (
            <div
              key={section.id}
              className={cn(
                "mb-6 bg-card rounded-lg shadow-sm border",
                section.id === activeSectionId ? "ring-2 ring-blue-200" : ""
              )}
              onClick={() => setActiveSectionId(section.id)}
            >
              {/* Section Header */}
              <div
                className="px-4 py-2 font-bold text-center text-lg border-b"
                style={{ backgroundColor: activeTemplate.globalStyles.headerColor, color: "#fff" }}
              >
                {section.name}
              </div>

              {/* Grid */}
              <div className="overflow-x-auto p-1">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: (section.colWidths || Array(section.cols || 5).fill(120)).map((w) => `${w}px`).join(" "),
                    direction: "rtl",
                    position: "relative",
                  }}
                >
                  {/* Column resize handles */}
                  {(section.colWidths || Array(section.cols || 5).fill(120)).map((w, cIdx) => {
                    let leftPos = 0;
                    for (let i = section.colWidths.length - 1; i > cIdx; i--) leftPos += section.colWidths[i];
                    return (
                      <div
                        key={`resize-${cIdx}`}
                        className="absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10"
                        style={{ right: leftPos + w - 2 }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setResizingCol({ sectionId: section.id, colIndex: cIdx, startX: e.clientX, startWidth: w });
                        }}
                      />
                    );
                  })}

                  {(section.grid || []).flatMap((row, rIdx) =>
                    row.map((cell, cIdx) => {
                      if (cell.merged) return null;
                      const isSelected = selectedCells.has(cell.id);
                      const isEditing = editingCellId === cell.id;

                      return (
                        <div
                          key={cell.id}
                          className={cn(
                            "relative group transition-shadow",
                            isSelected && "ring-2 ring-blue-500 ring-inset z-10",
                          )}
                          style={{
                            gridColumn: `${cIdx + 1} / span ${cell.colspan}`,
                            gridRow: `${rIdx + 1} / span ${cell.rowspan}`,
                            backgroundColor: cell.backgroundColor,
                            color: cell.textColor,
                            fontWeight: cell.fontWeight,
                            textAlign: cell.textAlign,
                            borderTop: cell.borderTop ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                            borderBottom: cell.borderBottom ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                            borderLeft: cell.borderLeft ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                            borderRight: cell.borderRight ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                            padding: "4px 6px",
                            minHeight: "32px",
                            fontSize: "13px",
                            cursor: "pointer",
                            userSelect: "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: cell.textAlign === "center" ? "center" : cell.textAlign === "left" ? "flex-start" : "flex-end",
                          }}
                          onClick={(e) => handleCellClick(cell.id, section.id, e)}
                          onDoubleClick={() => handleCellDoubleClick(cell.id)}
                          onContextMenu={(e) => handleCellContextMenu(e, section.id, rIdx, cIdx)}
                          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.outline = "2px dashed #3b82f6"; }}
                          onDragLeave={(e) => { e.currentTarget.style.outline = ""; }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.currentTarget.style.outline = "";
                            handleDrop(section.id, rIdx, cIdx);
                          }}
                        >
                          {isEditing ? (
                            <input
                              className="w-full h-full bg-transparent outline-none text-center"
                              style={{ color: cell.textColor, fontWeight: cell.fontWeight, textAlign: cell.textAlign, fontSize: "13px" }}
                              value={cell.value}
                              onChange={(e) => handleCellEdit(section.id, cell.id, e.target.value)}
                              onBlur={() => setEditingCellId(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === "Escape") setEditingCellId(null);
                                if (e.key === "Tab") {
                                  e.preventDefault();
                                  setEditingCellId(null);
                                  // Move to next cell
                                  const nextCell = row[cIdx + 1];
                                  if (nextCell && !nextCell.merged) {
                                    setSelectedCells(new Set([nextCell.id]));
                                    setEditingCellId(nextCell.id);
                                  }
                                }
                              }}
                              autoFocus
                            />
                          ) : cell.value?.includes(" | ") ? (
                            <div className="flex flex-wrap gap-0.5 justify-center">
                              {cell.value.split(" | ").map((v: string, vi: number) => (
                                <span key={vi} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-black/10 dark:bg-white/10 leading-tight">
                                  {v}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="truncate">{cell.value || (isSelected ? "" : "")}</span>
                          )}

                          {/* Merge indicator */}
                          {(cell.colspan > 1 || cell.rowspan > 1) && (
                            <span className="absolute top-0 left-0 text-[8px] text-blue-400 opacity-60 px-0.5">
                              {cell.colspan}×{cell.rowspan}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Side Panel */}
        {showSidePanel && (
          <div className="w-64 border-r bg-card overflow-y-auto flex-shrink-0">
            {/* Mission Types */}
            <div className="border-b p-3">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                <LayoutTemplate className="w-4 h-4" />
                סוגי משימות
              </h3>
              {missionTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground">אין סוגי משימות</p>
              ) : (
                <div className="space-y-1">
                  {missionTypes.map((mt) => (
                    <div
                      key={mt.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded border border-border cursor-grab hover:bg-muted/50 text-xs"
                      draggable
                      onDragStart={() => handleDragStart("missionType", mt)}
                    >
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: mt.color || "#6b7280" }} />
                      <span>{typeof mt.name === 'object' ? (mt.name.he || mt.name.en || '') : mt.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Work Roles */}
            <div className="border-b p-3">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                <User className="w-4 h-4" />
                תפקידי עבודה
              </h3>
              {workRoles.length === 0 ? (
                <p className="text-xs text-muted-foreground">אין תפקידים</p>
              ) : (
                <div className="space-y-1">
                  {workRoles.map((wr) => (
                    <div
                      key={wr.id}
                      className="px-2 py-1.5 rounded border border-border cursor-grab hover:bg-muted/50 text-xs"
                      draggable
                      onDragStart={() => handleDragStart("workRole", wr)}
                    >
                      {typeof wr.name === 'object' ? (wr.name.he || wr.name.en || '') : wr.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Time Ranges */}
            <div className="border-b p-3">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                <Clock className="w-4 h-4" />
                משמרות
              </h3>
              <div className="space-y-1">
                {[
                  { label: "בוקר", start: "07:00", end: "15:00" },
                  { label: "צהריים", start: "15:00", end: "23:00" },
                  { label: "לילה", start: "23:00", end: "07:00" },
                  { label: "4 שעות", start: "07:00", end: "11:00" },
                  { label: "4 שעות", start: "11:00", end: "15:00" },
                  { label: "4 שעות", start: "15:00", end: "19:00" },
                  { label: "4 שעות", start: "19:00", end: "23:00" },
                  { label: "4 שעות", start: "23:00", end: "03:00" },
                  { label: "4 שעות", start: "03:00", end: "07:00" },
                ].map((tr, i) => (
                  <div
                    key={i}
                    className="px-2 py-1.5 rounded border border-border cursor-grab hover:bg-muted/50 text-xs flex justify-between"
                    draggable
                    onDragStart={() => handleDragStart("timeRange", { start: tr.start, end: tr.end })}
                  >
                    <span>{tr.label}</span>
                    <span className="text-muted-foreground">{tr.start}-{tr.end}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cell Properties */}
            {selectedCell && (
              <div className="p-3">
                <h3 className="font-semibold text-sm mb-2">מאפייני תא</h3>
                <div className="space-y-2 text-xs">
                  <div>
                    <Label className="text-xs">סוג</Label>
                    <Select
                      value={selectedCell.type}
                      onChange={(e) => applyToSelected((c) => ({ ...c, type: e.target.value as CellType }))}
                      className="h-7 text-xs"
                    >
                      <option value="empty">ריק</option>
                      <option value="header">כותרת</option>
                      <option value="subheader">כותרת משנה</option>
                      <option value="role_label">תפקיד</option>
                      <option value="soldier_slot">משבצת חייל</option>
                      <option value="time">שעה</option>
                      <option value="separator">מפריד</option>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">ערך</Label>
                    <Input
                      value={selectedCell.value}
                      onChange={(e) => applyToSelected((c) => ({ ...c, value: e.target.value }))}
                      className="h-7 text-xs"
                    />
                  </div>
                  {selectedCell.type === "time" && (
                    <>
                      <div className="flex gap-1">
                        <div className="flex-1">
                          <Label className="text-xs">מ-</Label>
                          <Input
                            type="time"
                            value={selectedCell.timeRange?.start || ""}
                            onChange={(e) =>
                              applyToSelected((c) => ({
                                ...c,
                                timeRange: { start: e.target.value, end: c.timeRange?.end || "" },
                                value: `${e.target.value}-${c.timeRange?.end || ""}`,
                              }))
                            }
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs">עד</Label>
                          <Input
                            type="time"
                            value={selectedCell.timeRange?.end || ""}
                            onChange={(e) =>
                              applyToSelected((c) => ({
                                ...c,
                                timeRange: { start: c.timeRange?.start || "", end: e.target.value },
                                value: `${c.timeRange?.start || ""}-${e.target.value}`,
                              }))
                            }
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                      {selectedCell.timeRange?.start && selectedCell.timeRange?.end && (() => {
                        const [sh, sm] = selectedCell.timeRange.start.split(":").map(Number);
                        const [eh, em] = selectedCell.timeRange.end.split(":").map(Number);
                        let dur = (eh * 60 + em) - (sh * 60 + sm);
                        if (dur <= 0) dur += 24 * 60;
                        const hours = dur / 60;
                        const units = Math.round(hours / 4); // 4h = 1 unit
                        return (
                          <div className="text-[10px] text-muted-foreground pt-1">
                            משך: {hours}h • {units} יחידות (4h=1)
                          </div>
                        );
                      })()}
                    </>
                  )}
                  <div className="pt-1 border-t">
                    <span className="text-muted-foreground">
                      מיזוג: {selectedCell.colspan}×{selectedCell.rowspan}
                      {selectedCell.missionTypeId && " • משימה מקושרת"}
                      {selectedCell.workRoleId && " • תפקיד מקושר"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: "מזג תאים",
              icon: <Grid3X3 className="w-3 h-3" />,
              onClick: mergeCells,
              disabled: selectedCells.size < 2,
            },
            {
              label: "פצל תא",
              icon: <SplitSquareHorizontal className="w-3 h-3" />,
              onClick: () => {
                const cell = activeSection?.grid[contextMenu.row]?.[contextMenu.col];
                if (cell) splitCell(contextMenu.sectionId, cell.id);
              },
              disabled: (() => {
                const cell = activeSection?.grid[contextMenu.row]?.[contextMenu.col];
                return !cell || (cell.colspan <= 1 && cell.rowspan <= 1);
              })(),
            },
            { label: "", separator: true, onClick: () => {} },
            {
              label: "הוסף שורה למעלה",
              icon: <Plus className="w-3 h-3" />,
              onClick: () => addRow(contextMenu.sectionId, contextMenu.row - 1),
            },
            {
              label: "הוסף שורה למטה",
              icon: <Plus className="w-3 h-3" />,
              onClick: () => addRow(contextMenu.sectionId, contextMenu.row),
            },
            {
              label: "הוסף עמודה מימין",
              icon: <Plus className="w-3 h-3" />,
              onClick: () => addCol(contextMenu.sectionId, contextMenu.col - 1),
            },
            {
              label: "הוסף עמודה משמאל",
              icon: <Plus className="w-3 h-3" />,
              onClick: () => addCol(contextMenu.sectionId, contextMenu.col),
            },
            { label: "", separator: true, onClick: () => {} },
            {
              label: "מחק שורה",
              icon: <Trash2 className="w-3 h-3" />,
              onClick: () => deleteRow(contextMenu.sectionId, contextMenu.row),
            },
            {
              label: "מחק עמודה",
              icon: <Trash2 className="w-3 h-3" />,
              onClick: () => deleteCol(contextMenu.sectionId, contextMenu.col),
            },
            { label: "", separator: true, onClick: () => {} },
            {
              label: "נקה תוכן",
              icon: <Minus className="w-3 h-3" />,
              onClick: () => applyToSelected((c) => ({ ...c, value: "" })),
            },
          ]}
        />
      )}
    </div>
  );
}
