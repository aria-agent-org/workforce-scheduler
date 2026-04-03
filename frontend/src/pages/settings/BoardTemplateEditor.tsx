import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  LayoutTemplate, Plus, Save, Eye, Trash2,
  Clock, User, Minus, SplitSquareHorizontal,
  AlignRight, AlignCenter, AlignLeft, Bold, Square,
  Grid3X3, PanelRightOpen, PanelRightClose,
  RotateCcw, Download, Upload, Table2,
  Wand2, Variable, Calendar, GripVertical,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────

type CellType = "header" | "subheader" | "role_label" | "soldier_slot" | "time" | "empty" | "separator" | "mission_reference";

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

interface BoardTemplate {
  id: string;
  _dbId?: string;
  name: string;
  scheduleWindowId?: string;
  grid: GridCell[][];
  rows: number;
  cols: number;
  colWidths: number[];
  rowHeights: number[];
  globalStyles: {
    headerColor: string;
    subheaderColor: string;
    borderColor: string;
    fontFamily: string;
  };
}

// ─── Template Variables ──────────────────────────

interface TemplateVariable {
  key: string;
  label: string;
  example: string;
  color: string;
}

const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: "{{mission_name}}", label: "שם משימה", example: "סיור", color: "#6B7F3B" },
  { key: "{{soldier_name}}", label: "שם חייל", example: "ישראל ישראלי", color: "#22c55e" },
  { key: "{{time_start}}", label: "שעת התחלה", example: "07:00", color: "#f97316" },
  { key: "{{time_end}}", label: "שעת סיום", example: "15:00", color: "#f97316" },
  { key: "{{role}}", label: "תפקיד", example: "מפקד", color: "#8b5cf6" },
  { key: "{{slot_label}}", label: "תווית משבצת", example: "לוחם 1", color: "#ec4899" },
];

const SAMPLE_SOLDIERS = ["ישראל ישראלי", "דוד כהן", "שרה לוי", "יוסף אברהם", "מיכל דוידוב", "אבי ברק", "נעמי גולן", "רון שמש"];
const SAMPLE_MISSIONS = ["סיור", "שמירה", "אבטחה", "תצפית", "כוננות"];
const SAMPLE_ROLES = ["מפקד", "נהג", "לוחם", "קשר"];

function isVariable(value: string): boolean {
  return /\{\{[a-z_]+\}\}/.test(value);
}

function resolveVariables(value: string, rowIdx: number, colIdx: number, timeRange?: { start: string; end: string }): string {
  let result = value;
  const soldierIdx = (rowIdx * 4 + colIdx) % SAMPLE_SOLDIERS.length;
  const missionIdx = rowIdx % SAMPLE_MISSIONS.length;
  const roleIdx = colIdx % SAMPLE_ROLES.length;
  result = result.replace(/\{\{soldier_name\}\}/g, SAMPLE_SOLDIERS[soldierIdx]);
  result = result.replace(/\{\{mission_name\}\}/g, SAMPLE_MISSIONS[missionIdx]);
  result = result.replace(/\{\{time_start\}\}/g, timeRange?.start || "07:00");
  result = result.replace(/\{\{time_end\}\}/g, timeRange?.end || "15:00");
  result = result.replace(/\{\{role\}\}/g, SAMPLE_ROLES[roleIdx]);
  result = result.replace(/\{\{slot_label\}\}/g, `${SAMPLE_ROLES[roleIdx]} ${(colIdx % 3) + 1}`);
  return result;
}

function renderVariableChips(value: string) {
  const parts = value.split(/(\{\{[a-z_]+\}\})/g);
  return parts.map((part, i) => {
    const variable = TEMPLATE_VARIABLES.find(v => v.key === part);
    if (variable) {
      return (
        <span
          key={i}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-white mx-0.5"
          style={{ backgroundColor: variable.color }}
          title={variable.label}
        >
          {variable.label}
        </span>
      );
    }
    return part ? <span key={i}>{part}</span> : null;
  });
}

interface MissionType {
  id: string;
  name: string | { he?: string; en?: string };
  color?: string;
}

interface WorkRole {
  id: string;
  name: string | { he?: string; en?: string };
}

// ─── Helpers ─────────────────────────────────────

let _id = Date.now();
const uid = () => `c${++_id}_${Math.random().toString(36).slice(2, 8)}`;

function getName(n: string | { he?: string; en?: string } | any): string {
  if (!n) return "";
  if (typeof n === "string") return n;
  return n.he || n.en || String(n);
}

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

function createEmptyGrid(rows: number, cols: number): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: GridCell[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(createCell());
    }
    grid.push(row);
  }
  return grid;
}

function createDefaultTemplate(): BoardTemplate {
  const rows = 14;
  const cols = 15;
  const grid = createEmptyGrid(rows, cols);

  // Row 0: Title spanning all cols
  grid[0][0] = createCell({ type: "header", value: "שבצ\"ק יום ___", fontWeight: "bold", backgroundColor: "#166534", textColor: "#fff", colspan: cols, textAlign: "center" });
  for (let c = 1; c < cols; c++) grid[0][c] = createCell({ merged: true, mergedBy: grid[0][0].id });

  // Row 1: Mission type headers
  // Right side: time header
  grid[1][0] = createCell({ type: "header", value: "", fontWeight: "bold", backgroundColor: "#15803d", textColor: "#fff" });
  // Mission groups from right to left: ש.ג (1 col), סיור (4 cols), כרמל א (4 cols), חמ"ל (1 col), then more...
  grid[1][1] = createCell({ type: "header", value: "חמ\"ל", fontWeight: "bold", backgroundColor: "#15803d", textColor: "#fff" });
  grid[1][2] = createCell({ type: "header", value: "כרמל א'", fontWeight: "bold", backgroundColor: "#15803d", textColor: "#fff", colspan: 4 });
  for (let c = 3; c <= 5; c++) grid[1][c] = createCell({ merged: true, mergedBy: grid[1][2].id });
  grid[1][6] = createCell({ type: "header", value: "סיור", fontWeight: "bold", backgroundColor: "#15803d", textColor: "#fff", colspan: 4 });
  for (let c = 7; c <= 9; c++) grid[1][c] = createCell({ merged: true, mergedBy: grid[1][6].id });
  grid[1][10] = createCell({ type: "header", value: "ש.ג", fontWeight: "bold", backgroundColor: "#15803d", textColor: "#fff", colspan: 2 });
  grid[1][11] = createCell({ merged: true, mergedBy: grid[1][10].id });
  for (let c = 12; c < cols; c++) grid[1][c] = createCell({ type: "empty", backgroundColor: "#15803d" });

  // Row 2: Numbers (personnel count)
  grid[2][0] = createCell({ type: "subheader", value: "", backgroundColor: "#dcfce7" });
  grid[2][1] = createCell({ type: "subheader", value: "3", fontWeight: "bold", backgroundColor: "#dcfce7" });
  grid[2][2] = createCell({ type: "subheader", value: "12", fontWeight: "bold", backgroundColor: "#dcfce7", colspan: 4 });
  for (let c = 3; c <= 5; c++) grid[2][c] = createCell({ merged: true, mergedBy: grid[2][2].id });
  grid[2][6] = createCell({ type: "subheader", value: "12", fontWeight: "bold", backgroundColor: "#dcfce7", colspan: 4 });
  for (let c = 7; c <= 9; c++) grid[2][c] = createCell({ merged: true, mergedBy: grid[2][6].id });
  grid[2][10] = createCell({ type: "subheader", value: "9", fontWeight: "bold", backgroundColor: "#dcfce7", colspan: 2 });
  grid[2][11] = createCell({ merged: true, mergedBy: grid[2][10].id });
  for (let c = 12; c < cols; c++) grid[2][c] = createCell({ backgroundColor: "#dcfce7" });

  // Row 3: Role sub-headers
  grid[3][0] = createCell({ type: "subheader", value: "", backgroundColor: "#f0fdf4" });
  grid[3][1] = createCell({ type: "subheader", value: "", backgroundColor: "#f0fdf4" });
  grid[3][2] = createCell({ type: "role_label", value: "לוחמ/ת", fontWeight: "bold", backgroundColor: "#f0fdf4" });
  grid[3][3] = createCell({ type: "role_label", value: "לוחמ/ת", fontWeight: "bold", backgroundColor: "#f0fdf4" });
  grid[3][4] = createCell({ type: "role_label", value: "נהג", fontWeight: "bold", backgroundColor: "#f0fdf4" });
  grid[3][5] = createCell({ type: "role_label", value: "מפקד", fontWeight: "bold", backgroundColor: "#f0fdf4" });
  grid[3][6] = createCell({ type: "role_label", value: "לוחמ/ת", fontWeight: "bold", backgroundColor: "#f0fdf4" });
  grid[3][7] = createCell({ type: "role_label", value: "לוחמ/ת", fontWeight: "bold", backgroundColor: "#f0fdf4" });
  grid[3][8] = createCell({ type: "role_label", value: "נהג", fontWeight: "bold", backgroundColor: "#f0fdf4" });
  grid[3][9] = createCell({ type: "role_label", value: "מפקד", fontWeight: "bold", backgroundColor: "#f0fdf4" });
  grid[3][10] = createCell({ type: "role_label", value: "מפקד", fontWeight: "bold", backgroundColor: "#f0fdf4" });
  grid[3][11] = createCell({ type: "role_label", value: "", fontWeight: "bold", backgroundColor: "#f0fdf4" });
  for (let c = 12; c < cols; c++) grid[3][c] = createCell({ backgroundColor: "#f0fdf4" });

  // Rows 4-9: Time slots + empty soldier cells
  const times = ["7:00-11:00", "11:00-15:00", "15:00-19:00", "19:00-23:00", "23:00-3:00", "3:00-7:00"];
  for (let t = 0; t < times.length; t++) {
    const r = 4 + t;
    grid[r][0] = createCell({ type: "time", value: times[t], fontWeight: "bold", backgroundColor: "#f9fafb" });
    for (let c = 1; c < cols; c++) {
      grid[r][c] = createCell({ type: "soldier_slot" });
    }
  }

  // Rows 10-13: Second section (empty, user fills in)
  grid[10][0] = createCell({ type: "separator", backgroundColor: "#e5e7eb", colspan: cols });
  for (let c = 1; c < cols; c++) grid[10][c] = createCell({ merged: true, mergedBy: grid[10][0].id });

  grid[11][0] = createCell({ type: "header", value: "כרמל ב' - הגנת מחנה", fontWeight: "bold", backgroundColor: "#166534", textColor: "#fff", colspan: cols, textAlign: "center" });
  for (let c = 1; c < cols; c++) grid[11][c] = createCell({ merged: true, mergedBy: grid[11][0].id });

  for (let r = 12; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid[r][c] = createCell({ type: "empty" });
    }
  }

  return {
    id: uid(),
    name: "תבנית חדשה",
    grid,
    rows,
    cols,
    colWidths: Array(cols).fill(90),
    rowHeights: Array(rows).fill(36),
    globalStyles: {
      headerColor: "#166534",
      subheaderColor: "#15803d",
      borderColor: "#d1d5db",
      fontFamily: "inherit",
    },
  };
}

function cloneTemplate(t: BoardTemplate): BoardTemplate {
  return JSON.parse(JSON.stringify(t));
}

/** Flatten old multi-section template into single grid */
function flattenSections(oldData: any): BoardTemplate {
  const sections = oldData.sections || oldData.layout?.sections || [];
  if (sections.length === 0) {
    return createDefaultTemplate();
  }

  // Find max cols across all sections
  let maxCols = 0;
  for (const s of sections) {
    const sCols = s.cols || (s.grid?.[0]?.length || 0);
    if (sCols > maxCols) maxCols = sCols;
  }
  if (maxCols === 0) maxCols = 10;

  // Flatten: stack sections vertically with separator rows
  const allRows: GridCell[][] = [];
  const allRowHeights: number[] = [];

  for (let si = 0; si < sections.length; si++) {
    const s = sections[si];
    const sGrid = s.grid || [];
    const sCols = s.cols || (sGrid[0]?.length || maxCols);

    // Add section title row
    if (si > 0) {
      // Separator
      const sepRow: GridCell[] = [];
      sepRow.push(createCell({ type: "separator", backgroundColor: "#e5e7eb", colspan: maxCols }));
      for (let c = 1; c < maxCols; c++) sepRow.push(createCell({ merged: true, mergedBy: sepRow[0].id }));
      allRows.push(sepRow);
      allRowHeights.push(8);
    }

    // Section name as header row
    const headerRow: GridCell[] = [];
    headerRow.push(createCell({
      type: "header", value: s.name || `קטע ${si + 1}`, fontWeight: "bold",
      backgroundColor: "#166534", textColor: "#fff", colspan: maxCols, textAlign: "center",
    }));
    for (let c = 1; c < maxCols; c++) headerRow.push(createCell({ merged: true, mergedBy: headerRow[0].id }));
    allRows.push(headerRow);
    allRowHeights.push(36);

    // Grid rows
    for (const row of sGrid) {
      const newRow: GridCell[] = [];
      for (let c = 0; c < maxCols; c++) {
        if (c < row.length) {
          newRow.push({ ...row[c], id: uid() });
        } else {
          newRow.push(createCell());
        }
      }
      allRows.push(newRow);
      allRowHeights.push(36);
    }
  }

  // Collect colWidths from first section
  const firstWidths = sections[0]?.colWidths || [];
  const colWidths: number[] = [];
  for (let c = 0; c < maxCols; c++) {
    colWidths.push(firstWidths[c] || 90);
  }

  return {
    id: oldData.id || uid(),
    _dbId: oldData._dbId || oldData.id,
    name: oldData.name || "תבנית מיובאת",
    scheduleWindowId: oldData.scheduleWindowId || oldData.layout?.scheduleWindowId,
    grid: allRows,
    rows: allRows.length,
    cols: maxCols,
    colWidths,
    rowHeights: allRowHeights,
    globalStyles: oldData.globalStyles || oldData.layout?.globalStyles || {
      headerColor: "#166534", subheaderColor: "#15803d", borderColor: "#d1d5db", fontFamily: "inherit",
    },
  };
}

function getSelectionBounds(grid: GridCell[][], selectedIds: Set<string>): { minR: number; maxR: number; minC: number; maxC: number } | null {
  let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (selectedIds.has(grid[r][c].id)) {
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

// ─── Context Menu ─────────────────────────────────

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
    <div ref={ref} className="fixed z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[200px]" style={{ left: x, top: y }}>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="border-t border-border my-1" />
        ) : (
          <button
            key={i}
            className={cn("w-full px-3 py-2 text-right text-sm flex items-center gap-2 hover:bg-muted transition-colors", item.disabled && "opacity-40 cursor-not-allowed")}
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

// ─── Color Picker ─────────────────────────────────

const PRESET_COLORS = [
  "#ffffff", "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#6b7280", "#374151", "#1f2937", "#111827", "#000000",
  "#fef2f2", "#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d",
  "#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12",
  "#fefce8", "#fef9c3", "#fef08a", "#fde047", "#facc15", "#eab308", "#ca8a04", "#a16207", "#854d0e", "#713f12",
  "#f0fdf4", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d", "#166534", "#14532d",
  "#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#6B7F3B", "#5A6B32", "#1d4ed8", "#1e40af", "#1e3a8a",
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
                className={cn("w-5 h-5 rounded border transition-transform hover:scale-125", c === color ? "ring-2 ring-primary-500 ring-offset-1" : "border-border")}
                style={{ backgroundColor: c }}
                onClick={() => { onChange(c); setOpen(false); }}
              />
            ))}
          </div>
          <div className="flex gap-1 mt-2">
            <Input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} className="w-8 h-8 p-0 border-0 cursor-pointer" />
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} className="flex-1 h-8 text-xs" placeholder="#hex" />
            <Button size="sm" className="h-8 text-xs" onClick={() => { onChange(custom); setOpen(false); }}>בחר</Button>
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
  const [templates, setTemplates] = useState<BoardTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<BoardTemplate | null>(null);
  const [missionTypes, setMissionTypes] = useState<MissionType[]>([]);
  const [workRoles, setWorkRoles] = useState<WorkRole[]>([]);
  const [scheduleWindows, setScheduleWindows] = useState<any[]>([]);

  // UI state
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col: number } | null>(null);
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplateList, setShowTemplateList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragItem, setDragItem] = useState<{ type: string; data: any } | null>(null);
  const [undoStack, setUndoStack] = useState<BoardTemplate[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generateDateFrom, setGenerateDateFrom] = useState("");
  const [generateDateTo, setGenerateDateTo] = useState("");
  const [generating, setGenerating] = useState(false);

  // Selection drag
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ row: number; col: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Column resize
  const [resizingCol, setResizingCol] = useState<{ colIndex: number; startX: number; startWidth: number } | null>(null);
  // Row resize
  const [resizingRow, setResizingRow] = useState<{ rowIndex: number; startY: number; startHeight: number } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  // ─── Load Data ─────────────────────────────────

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => { loadData(); }, []);

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
        const converted: BoardTemplate[] = loaded.map((t: any) => {
          // New format: layout has flat grid
          if (t.layout?.grid && !t.layout?.sections) {
            return {
              id: t.layout.id || t.id,
              _dbId: t.id,
              name: t.name,
              grid: t.layout.grid,
              rows: t.layout.rows || t.layout.grid.length,
              cols: t.layout.cols || (t.layout.grid[0]?.length || 10),
              colWidths: t.layout.colWidths || Array(t.layout.cols || 10).fill(90),
              rowHeights: t.layout.rowHeights || Array(t.layout.rows || 10).fill(36),
              globalStyles: t.layout.globalStyles || { headerColor: "#166534", subheaderColor: "#15803d", borderColor: "#d1d5db", fontFamily: "inherit" },
              scheduleWindowId: t.layout.scheduleWindowId,
            } as BoardTemplate;
          }
          // Old format: has sections → flatten
          if (t.layout?.sections) {
            const flat = flattenSections({ ...t.layout, name: t.name, _dbId: t.id, id: t.id });
            return flat;
          }
          // Fallback: create default
          const def = createDefaultTemplate();
          def._dbId = t.id;
          def.name = t.name;
          return def;
        });
        setTemplates(converted);
      }
    } catch { /* silent */ }
  };

  // ─── Undo ───────────────────────────────────────

  const pushUndo = useCallback(() => {
    if (!activeTemplate) return;
    setUndoStack((prev) => [...prev.slice(-29), cloneTemplate(activeTemplate)]);
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
    setShowTemplateList(false);
    setSelectedCells(new Set());
  };

  const openTemplate = (t: BoardTemplate) => {
    setActiveTemplate(cloneTemplate(t));
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
          id: activeTemplate.id,
          grid: activeTemplate.grid,
          rows: activeTemplate.rows,
          cols: activeTemplate.cols,
          colWidths: activeTemplate.colWidths,
          rowHeights: activeTemplate.rowHeights,
          globalStyles: activeTemplate.globalStyles,
          scheduleWindowId: activeTemplate.scheduleWindowId,
        },
        columns: { version: "flat_v1" },
      };

      const existingDbId = activeTemplate._dbId || templates.find((t) => t.id === activeTemplate.id)?._dbId;

      if (existingDbId) {
        await api.patch(tenantApi(`/daily-board-templates/${existingDbId}`), payload);
      } else {
        const res = await api.post(tenantApi("/daily-board-templates"), payload);
        const saved = { ...activeTemplate, _dbId: res.data.id };
        setActiveTemplate(saved);
        setTemplates((prev) => {
          const exists = prev.some((t) => t.id === activeTemplate.id);
          if (exists) return prev.map((t) => t.id === activeTemplate.id ? saved : t);
          return [...prev, saved];
        });
      }

      // Backup to settings
      try {
        const key = activeTemplate.scheduleWindowId
          ? `board_grid_template_${activeTemplate.scheduleWindowId}`
          : `board_grid_template_default`;
        await api.post(tenantApi("/settings"), { key, value: JSON.stringify(activeTemplate) });
      } catch { /* optional */ }

      toast("success", "התבנית נשמרה בהצלחה");
    } catch (err: any) {
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
        if (data.grid && data.globalStyles) {
          setActiveTemplate(data);
          toast("success", "התבנית יובאה בהצלחה");
        } else if (data.sections) {
          // Old format
          setActiveTemplate(flattenSections(data));
          toast("success", "התבנית יובאה והומרה לפורמט חדש");
        } else {
          toast("error", "קובץ לא תקין");
        }
      } catch { toast("error", "שגיאה בקריאת הקובץ"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const deleteTemplate = async (t: BoardTemplate) => {
    if (!t._dbId) {
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      return;
    }
    try {
      await api.delete(tenantApi(`/daily-board-templates/${t._dbId}`));
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      if (activeTemplate?.id === t.id) {
        setActiveTemplate(null);
        setShowTemplateList(true);
      }
      toast("success", "התבנית נמחקה");
    } catch {
      toast("error", "שגיאה במחיקת התבנית");
    }
  };

  // ─── Generate Board ─────────────────────────────

  const generateBoard = async () => {
    if (!activeTemplate || !generateDateFrom || !generateDateTo) {
      toast("error", "יש לבחור טווח תאריכים");
      return;
    }
    setGenerating(true);
    try {
      const dbId = activeTemplate._dbId || templates.find(t => t.id === activeTemplate.id)?._dbId;
      if (!dbId) {
        await saveTemplate();
        toast("error", "התבנית נשמרה. לחץ שוב על יצירת לוח.");
        setGenerating(false);
        return;
      }
      await api.post(tenantApi(`/daily-board-templates/${dbId}/generate`), {
        date_from: generateDateFrom,
        date_to: generateDateTo,
      });
      toast("success", `לוחות יומיים נוצרו בהצלחה`);
      setShowGenerateDialog(false);
    } catch (err: any) {
      toast("error", err.response?.data?.detail || "שגיאה ביצירת לוחות");
    } finally {
      setGenerating(false);
    }
  };

  // ─── Grid Operations ───────────────────────────

  const updateGrid = useCallback((updater: (g: GridCell[][]) => GridCell[][]) => {
    if (!activeTemplate) return;
    pushUndo();
    setActiveTemplate((prev) => {
      if (!prev) return prev;
      const newGrid = updater(prev.grid.map(row => row.map(cell => ({ ...cell }))));
      return { ...prev, grid: newGrid, rows: newGrid.length, cols: newGrid[0]?.length || prev.cols };
    });
  }, [activeTemplate, pushUndo]);

  const addRow = useCallback((afterRow: number) => {
    if (!activeTemplate) return;
    pushUndo();
    setActiveTemplate((prev) => {
      if (!prev) return prev;
      const newRow = Array.from({ length: prev.cols }, () => createCell());
      const grid = [...prev.grid];
      grid.splice(afterRow + 1, 0, newRow);
      const rowHeights = [...prev.rowHeights];
      rowHeights.splice(afterRow + 1, 0, 36);
      return { ...prev, grid, rows: prev.rows + 1, rowHeights };
    });
  }, [activeTemplate, pushUndo]);

  const addCol = useCallback((afterCol: number) => {
    if (!activeTemplate) return;
    pushUndo();
    setActiveTemplate((prev) => {
      if (!prev) return prev;
      const grid = prev.grid.map((row) => {
        const newRow = [...row];
        newRow.splice(afterCol + 1, 0, createCell());
        return newRow;
      });
      const colWidths = [...prev.colWidths];
      colWidths.splice(afterCol + 1, 0, 90);
      return { ...prev, grid, cols: prev.cols + 1, colWidths };
    });
  }, [activeTemplate, pushUndo]);

  const deleteRow = useCallback((rowIdx: number) => {
    if (!activeTemplate || activeTemplate.rows <= 1) return;
    pushUndo();
    setActiveTemplate((prev) => {
      if (!prev) return prev;
      const grid = prev.grid.filter((_, i) => i !== rowIdx);
      const rowHeights = prev.rowHeights.filter((_, i) => i !== rowIdx);
      return { ...prev, grid, rows: prev.rows - 1, rowHeights };
    });
  }, [activeTemplate, pushUndo]);

  const deleteCol = useCallback((colIdx: number) => {
    if (!activeTemplate || activeTemplate.cols <= 1) return;
    pushUndo();
    setActiveTemplate((prev) => {
      if (!prev) return prev;
      const grid = prev.grid.map((row) => row.filter((_, i) => i !== colIdx));
      const colWidths = prev.colWidths.filter((_, i) => i !== colIdx);
      return { ...prev, grid, cols: prev.cols - 1, colWidths };
    });
  }, [activeTemplate, pushUndo]);

  // ─── Merge / Split ─────────────────────────────

  const mergeCells = useCallback(() => {
    if (!activeTemplate || selectedCells.size < 2) return;
    const bounds = getSelectionBounds(activeTemplate.grid, selectedCells);
    if (!bounds) return;

    const { minR, maxR, minC, maxC } = bounds;
    // Verify rectangle is clean
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (activeTemplate.grid[r][c].merged) {
          toast("error", "לא ניתן למזג תאים שכבר ממוזגים");
          return;
        }
      }
    }

    updateGrid((grid) => {
      const topLeft = grid[minR][minC];
      topLeft.colspan = maxC - minC + 1;
      topLeft.rowspan = maxR - minR + 1;
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (r === minR && c === minC) continue;
          grid[r][c] = { ...grid[r][c], merged: true, mergedBy: topLeft.id };
        }
      }
      return grid;
    });
    setSelectedCells(new Set());
  }, [activeTemplate, selectedCells, updateGrid, toast]);

  const splitCell = useCallback((cellId: string) => {
    updateGrid((grid) => {
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
            return grid;
          }
        }
      }
      return grid;
    });
  }, [updateGrid]);

  // ─── Cell Selection (click + drag) ─────────────

  const handleCellMouseDown = useCallback((cellId: string, row: number, col: number, e: React.MouseEvent) => {
    if (e.button === 2) return; // right-click handled by context menu
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelectedCells((prev) => {
        const next = new Set(prev);
        if (next.has(cellId)) next.delete(cellId);
        else next.add(cellId);
        return next;
      });
    } else {
      setSelectedCells(new Set([cellId]));
      setSelectionStart({ row, col });
      setSelectionEnd({ row, col });
      setIsSelecting(true);
    }
  }, []);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    if (isSelecting && activeTemplate) {
      setSelectionEnd({ row, col });
      // Build selection from start to current
      if (selectionStart) {
        const minR = Math.min(selectionStart.row, row);
        const maxR = Math.max(selectionStart.row, row);
        const minC = Math.min(selectionStart.col, col);
        const maxC = Math.max(selectionStart.col, col);
        const ids = new Set<string>();
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            if (activeTemplate.grid[r]?.[c]) {
              ids.add(activeTemplate.grid[r][c].id);
            }
          }
        }
        setSelectedCells(ids);
      }
    }
  }, [isSelecting, selectionStart, activeTemplate]);

  useEffect(() => {
    const handleMouseUp = () => {
      setIsSelecting(false);
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const handleCellDoubleClick = useCallback((cellId: string) => {
    setEditingCellId(cellId);
  }, []);

  const handleCellEdit = useCallback((cellId: string, value: string) => {
    if (!activeTemplate) return;
    setActiveTemplate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        grid: prev.grid.map((row) =>
          row.map((cell) => (cell.id === cellId ? { ...cell, value } : cell))
        ),
      };
    });
  }, [activeTemplate]);

  const handleCellContextMenu = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, row, col });
  }, []);

  // ─── Apply to Selection ─────────────────────────

  const applyToSelected = useCallback(
    (updater: (cell: GridCell) => GridCell) => {
      if (!activeTemplate || selectedCells.size === 0) return;
      pushUndo();
      setActiveTemplate((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          grid: prev.grid.map((row) =>
            row.map((cell) => (selectedCells.has(cell.id) ? updater({ ...cell }) : cell))
          ),
        };
      });
    },
    [activeTemplate, selectedCells, pushUndo]
  );

  const selectedCell = useMemo(() => {
    if (!activeTemplate || selectedCells.size === 0) return null;
    for (const row of activeTemplate.grid) {
      for (const cell of row) {
        if (selectedCells.has(cell.id)) return cell;
      }
    }
    return null;
  }, [activeTemplate, selectedCells]);

  // ─── Drag & Drop ────────────────────────────────

  const handleDrop = useCallback((row: number, col: number) => {
    if (!dragItem || !activeTemplate) return;
    pushUndo();
    setActiveTemplate((prev) => {
      if (!prev) return prev;
      const grid = prev.grid.map((r) => r.map((c) => ({ ...c })));
      const cell = grid[row]?.[col];
      if (!cell || cell.merged) return prev;

      if (dragItem.type === "variable") {
        cell.value = cell.value ? cell.value + " " + dragItem.data.key : dragItem.data.key;
        if (cell.type === "empty") cell.type = "soldier_slot";
      } else if (dragItem.type === "missionType") {
        const n = getName(dragItem.data.name);
        cell.value = n;
        cell.missionTypeId = dragItem.data.id;
        cell.type = "header";
        cell.fontWeight = "bold";
        if (dragItem.data.color) cell.backgroundColor = dragItem.data.color;
      } else if (dragItem.type === "workRole") {
        cell.value = getName(dragItem.data.name);
        cell.workRoleId = dragItem.data.id;
        cell.type = "role_label";
        cell.fontWeight = "bold";
      } else if (dragItem.type === "timeRange") {
        cell.value = `${dragItem.data.start}-${dragItem.data.end}`;
        cell.timeRange = dragItem.data;
        cell.type = "time";
      }
      return { ...prev, grid };
    });
    setDragItem(null);
  }, [dragItem, activeTemplate, pushUndo]);

  // ─── Resize Handlers ───────────────────────────

  useEffect(() => {
    if (!resizingCol) return;
    const handleMove = (e: MouseEvent) => {
      const diff = e.clientX - resizingCol.startX;
      const newWidth = Math.max(40, resizingCol.startWidth + diff);
      setActiveTemplate((prev) => {
        if (!prev) return prev;
        const colWidths = [...prev.colWidths];
        colWidths[resizingCol.colIndex] = newWidth;
        return { ...prev, colWidths };
      });
    };
    const handleUp = () => setResizingCol(null);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => { document.removeEventListener("mousemove", handleMove); document.removeEventListener("mouseup", handleUp); };
  }, [resizingCol]);

  useEffect(() => {
    if (!resizingRow) return;
    const handleMove = (e: MouseEvent) => {
      const diff = e.clientY - resizingRow.startY;
      const newHeight = Math.max(20, resizingRow.startHeight + diff);
      setActiveTemplate((prev) => {
        if (!prev) return prev;
        const rowHeights = [...prev.rowHeights];
        rowHeights[resizingRow.rowIndex] = newHeight;
        return { ...prev, rowHeights };
      });
    };
    const handleUp = () => setResizingRow(null);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => { document.removeEventListener("mousemove", handleMove); document.removeEventListener("mouseup", handleUp); };
  }, [resizingRow]);

  // ─── Keyboard ───────────────────────────────────

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
      if ((e.ctrlKey || e.metaKey) && e.key === "b" && selectedCells.size > 0) {
        e.preventDefault();
        applyToSelected((c) => ({ ...c, fontWeight: c.fontWeight === "bold" ? "normal" : "bold" }));
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
              עורך לוח שיבוצים
            </h2>
            <p className="text-muted-foreground text-sm mt-1">עריכת תבניות לוח בגמישות מלאה — גריד חופשי כמו Excel</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={createNewTemplate}>
              <Plus className="w-4 h-4 ml-1" />
              תבנית חדשה
            </Button>
            <label className="cursor-pointer">
              <input type="file" accept=".json" className="hidden" onChange={importTemplate} />
              <Button variant="outline" asChild><span><Upload className="w-4 h-4 ml-1" />ייבוא</span></Button>
            </label>
          </div>
        </div>

        {templates.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Table2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-lg mb-2">אין תבניות לוח עדיין</p>
              <p className="text-muted-foreground/70 text-sm mb-6">צור תבנית חדשה — גריד חופשי עם מיזוג תאים, צבעים, וגרירת משימות</p>
              <Button onClick={createNewTemplate}>
                <Plus className="w-4 h-4 ml-1" />
                צור תבנית ראשונה
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <Card key={t.id} className="cursor-pointer hover:border-primary-300 hover:shadow-md transition-all group" onClick={() => openTemplate(t)}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{t.name}</h3>
                      <p className="text-xs text-muted-foreground">{t.rows} שורות × {t.cols} עמודות</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                        {t.scheduleWindowId ? "מקושר" : "כללי"}
                      </Badge>
                      <button
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-600 transition-all"
                        onClick={(e) => { e.stopPropagation(); deleteTemplate(t); }}
                        title="מחק תבנית"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {/* Mini grid preview */}
                  <div className="border rounded p-1 bg-muted/50 overflow-hidden" style={{ maxHeight: 80 }}>
                    <div className="flex flex-col gap-px">
                      {t.grid.slice(0, 4).map((row, ri) => (
                        <div key={ri} className="flex gap-px">
                          {row.slice(0, 8).map((cell, ci) => (
                            <div
                              key={ci}
                              className="h-3 flex-1 rounded-sm text-[5px] overflow-hidden"
                              style={{
                                backgroundColor: cell.merged ? "transparent" : (cell.backgroundColor !== "#ffffff" ? cell.backgroundColor : "#f3f4f6"),
                                minWidth: 8,
                              }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
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
          <Button variant="outline" onClick={() => setShowPreview(false)}>חזרה לעריכה</Button>
        </div>
        <div className="border rounded-lg overflow-auto bg-white p-2">
          <table className="border-collapse" dir="rtl" style={{ fontFamily: activeTemplate.globalStyles.fontFamily }}>
            <tbody>
              {activeTemplate.grid.map((row, rIdx) => (
                <tr key={rIdx} style={{ height: activeTemplate.rowHeights[rIdx] || 36 }}>
                  {row.map((cell, cIdx) => {
                    if (cell.merged) return null;
                    const displayValue = isVariable(cell.value)
                      ? resolveVariables(cell.value, rIdx, cIdx, cell.timeRange)
                      : cell.value;
                    return (
                      <td
                        key={cIdx}
                        colSpan={cell.colspan}
                        rowSpan={cell.rowspan}
                        style={{
                          backgroundColor: cell.backgroundColor,
                          color: cell.textColor,
                          fontWeight: cell.fontWeight,
                          textAlign: cell.textAlign,
                          borderTop: cell.borderTop ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                          borderBottom: cell.borderBottom ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                          borderLeft: cell.borderLeft ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                          borderRight: cell.borderRight ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                          padding: "4px 8px",
                          fontSize: 13,
                          whiteSpace: "nowrap",
                          width: activeTemplate.colWidths[cIdx],
                          minWidth: activeTemplate.colWidths[cIdx],
                        }}
                      >
                        {displayValue}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!activeTemplate) return null;

  // ─── Mobile ─────────────────────────────────────

  if (isMobile) {
    return (
      <div className="space-y-4 p-4" dir="rtl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{activeTemplate.name}</h2>
          <Button variant="outline" size="sm" onClick={() => { setActiveTemplate(null); setShowTemplateList(true); }}>חזרה</Button>
        </div>
        <p className="text-sm text-muted-foreground bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-2">
          📱 תצוגה בלבד — העריכה זמינה במחשב שולחני
        </p>
        <div className="border rounded overflow-x-auto">
          <table className="border-collapse text-[11px]" dir="rtl">
            <tbody>
              {activeTemplate.grid.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => {
                    if (cell.merged) return null;
                    return (
                      <td
                        key={cIdx}
                        colSpan={cell.colspan}
                        rowSpan={cell.rowspan}
                        style={{
                          backgroundColor: cell.backgroundColor,
                          color: cell.textColor,
                          fontWeight: cell.fontWeight,
                          textAlign: cell.textAlign,
                          border: `1px solid ${activeTemplate.globalStyles.borderColor}`,
                          padding: "2px 4px",
                          minWidth: 40,
                        }}
                      >
                        {cell.value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ─── Editor View ────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-[600px]" dir="rtl">
      {/* ─── Top Bar ─────────────────────────────── */}
      <div className="border-b bg-card px-3 py-2 flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => { setActiveTemplate(null); setShowTemplateList(true); }}>
          ← חזרה
        </Button>

        <div className="h-6 border-r border-border mx-1" />

        <Input
          value={activeTemplate.name}
          onChange={(e) => setActiveTemplate((prev) => prev ? { ...prev, name: e.target.value } : prev)}
          className="w-48 h-8 text-sm font-semibold"
        />

        <Select
          value={activeTemplate.scheduleWindowId || ""}
          onChange={(e) => setActiveTemplate((prev) => prev ? { ...prev, scheduleWindowId: e.target.value || undefined } : prev)}
          className="w-44 h-8 text-xs"
        >
          <option value="">ללא חלון שיבוץ</option>
          {scheduleWindows.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </Select>

        <div className="h-6 border-r border-border mx-1" />

        {/* Merge / Split */}
        <Button variant="outline" size="sm" className="text-xs h-7" disabled={selectedCells.size < 2} onClick={mergeCells}>
          <Grid3X3 className="w-3 h-3 ml-1" />מזג
        </Button>
        <Button
          variant="outline" size="sm" className="text-xs h-7"
          disabled={!selectedCell || (selectedCell.colspan <= 1 && selectedCell.rowspan <= 1)}
          onClick={() => selectedCell && splitCell(selectedCell.id)}
        >
          <SplitSquareHorizontal className="w-3 h-3 ml-1" />פצל
        </Button>

        <div className="h-6 border-r border-border mx-1" />

        {/* Colors */}
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

        {/* Bold */}
        <button
          className={cn("px-2 py-1 rounded border text-xs h-7", selectedCell?.fontWeight === "bold" ? "bg-accent border-border" : "border-border hover:bg-muted/50")}
          onClick={() => applyToSelected((c) => ({ ...c, fontWeight: c.fontWeight === "bold" ? "normal" : "bold" }))}
        >
          <Bold className="w-3 h-3" />
        </button>

        {/* Alignment */}
        <div className="flex border rounded overflow-hidden h-7">
          {(["right", "center", "left"] as const).map((align) => {
            const Icon = align === "right" ? AlignRight : align === "center" ? AlignCenter : AlignLeft;
            return (
              <button
                key={align}
                className={cn("px-1.5 text-xs border-l first:border-l-0", selectedCell?.textAlign === align ? "bg-accent" : "hover:bg-muted/50")}
                onClick={() => applyToSelected((c) => ({ ...c, textAlign: align }))}
              >
                <Icon className="w-3 h-3" />
              </button>
            );
          })}
        </div>

        {/* Borders */}
        <button
          className={cn("px-2 py-1 rounded border text-xs h-7", selectedCell?.borderTop ? "bg-accent border-border" : "border-border")}
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

        {/* Add row/col */}
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => addRow(activeTemplate.rows - 1)}>
          <Plus className="w-3 h-3 ml-0.5" />שורה
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => addCol(activeTemplate.cols - 1)}>
          <Plus className="w-3 h-3 ml-0.5" />עמודה
        </Button>

        <div className="flex-1" />

        {/* Right side actions */}
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={undo} disabled={undoStack.length === 0}>
          <RotateCcw className="w-3 h-3 ml-1" />ביטול
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setShowGenerateDialog(true)}>
          <Wand2 className="w-3 h-3 ml-1" />ייצור לוח
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={exportTemplate}>
          <Download className="w-3 h-3 ml-1" />ייצוא
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setShowPreview(true)}>
          <Eye className="w-3 h-3 ml-1" />תצוגה מקדימה
        </Button>
        <button
          className="p-1.5 rounded hover:bg-muted text-muted-foreground"
          onClick={() => setShowSidePanel(!showSidePanel)}
        >
          {showSidePanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
        </button>
        <Button size="sm" className="h-7 text-xs" onClick={saveTemplate} disabled={saving}>
          <Save className="w-3 h-3 ml-1" />{saving ? "שומר..." : "שמור"}
        </Button>
      </div>

      {/* ─── Main Content ────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Grid Area */}
        <div className="flex-1 overflow-auto p-4 bg-muted/50" ref={gridRef}>
          <div className="bg-card rounded-lg shadow-sm border inline-block min-w-full">
            {/* Row number header + column headers for resize */}
            <div className="flex" style={{ direction: "rtl" }}>
              {/* Corner cell */}
              <div className="w-8 h-6 bg-muted border-b border-r border-border flex-shrink-0" />
              {/* Column headers (for resize) */}
              {activeTemplate.colWidths.map((w, cIdx) => (
                <div
                  key={cIdx}
                  className="relative h-6 bg-muted border-b border-r border-border flex items-center justify-center text-[10px] text-muted-foreground select-none"
                  style={{ width: w, minWidth: w, flexShrink: 0 }}
                >
                  {cIdx + 1}
                  {/* Resize handle */}
                  <div
                    className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize hover:bg-primary-400 z-10"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setResizingCol({ colIndex: cIdx, startX: e.clientX, startWidth: w });
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Grid rows */}
            {activeTemplate.grid.map((row, rIdx) => (
              <div key={rIdx} className="flex" style={{ direction: "rtl" }}>
                {/* Row number + resize handle */}
                <div
                  className="relative w-8 bg-muted border-b border-r border-border flex items-center justify-center text-[10px] text-muted-foreground select-none flex-shrink-0"
                  style={{ height: activeTemplate.rowHeights[rIdx] || 36 }}
                >
                  {rIdx + 1}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-primary-400 z-10"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setResizingRow({ rowIndex: rIdx, startY: e.clientY, startHeight: activeTemplate.rowHeights[rIdx] || 36 });
                    }}
                  />
                </div>
                {/* Cells */}
                {row.map((cell, cIdx) => {
                  if (cell.merged) return null;
                  const isSelected = selectedCells.has(cell.id);
                  const isEditing = editingCellId === cell.id;

                  // Calculate width for merged cells
                  let cellWidth = 0;
                  for (let cc = cIdx; cc < cIdx + cell.colspan && cc < activeTemplate.cols; cc++) {
                    cellWidth += activeTemplate.colWidths[cc] || 90;
                  }
                  let cellHeight = 0;
                  for (let rr = rIdx; rr < rIdx + cell.rowspan && rr < activeTemplate.rows; rr++) {
                    cellHeight += activeTemplate.rowHeights[rr] || 36;
                  }

                  return (
                    <div
                      key={cell.id}
                      className={cn(
                        "relative group flex-shrink-0",
                        isSelected && "ring-2 ring-primary-500 ring-inset z-10",
                      )}
                      style={{
                        width: cellWidth,
                        minWidth: cellWidth,
                        height: cellHeight,
                        backgroundColor: cell.backgroundColor,
                        color: cell.textColor,
                        fontWeight: cell.fontWeight,
                        textAlign: cell.textAlign,
                        borderTop: cell.borderTop ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                        borderBottom: cell.borderBottom ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                        borderLeft: cell.borderLeft ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                        borderRight: cell.borderRight ? `1px solid ${activeTemplate.globalStyles.borderColor}` : "none",
                        padding: "2px 4px",
                        fontSize: 13,
                        cursor: "cell",
                        userSelect: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: cell.textAlign === "center" ? "center" : cell.textAlign === "left" ? "flex-start" : "flex-end",
                        overflow: "hidden",
                      }}
                      onMouseDown={(e) => handleCellMouseDown(cell.id, rIdx, cIdx, e)}
                      onMouseEnter={() => handleCellMouseEnter(rIdx, cIdx)}
                      onDoubleClick={() => handleCellDoubleClick(cell.id)}
                      onContextMenu={(e) => handleCellContextMenu(e, rIdx, cIdx)}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.outline = "2px dashed #6B7F3B"; }}
                      onDragLeave={(e) => { e.currentTarget.style.outline = ""; }}
                      onDrop={(e) => { e.preventDefault(); e.currentTarget.style.outline = ""; handleDrop(rIdx, cIdx); }}
                    >
                      {isEditing ? (
                        <input
                          className="w-full h-full bg-transparent outline-none"
                          style={{ color: cell.textColor, fontWeight: cell.fontWeight, textAlign: cell.textAlign, fontSize: 13 }}
                          value={cell.value}
                          onChange={(e) => handleCellEdit(cell.id, e.target.value)}
                          onBlur={() => setEditingCellId(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") setEditingCellId(null);
                            if (e.key === "Tab") {
                              e.preventDefault();
                              setEditingCellId(null);
                              const nextCell = row[cIdx + 1];
                              if (nextCell && !nextCell.merged) {
                                setSelectedCells(new Set([nextCell.id]));
                                setEditingCellId(nextCell.id);
                              }
                            }
                          }}
                          autoFocus
                        />
                      ) : isVariable(cell.value) ? (
                        <div className="flex flex-wrap items-center gap-0.5 justify-center">
                          {renderVariableChips(cell.value)}
                        </div>
                      ) : (
                        <span className="truncate">{cell.value}</span>
                      )}

                      {/* Merge indicator */}
                      {(cell.colspan > 1 || cell.rowspan > 1) && (
                        <span className="absolute top-0 left-0 text-[8px] text-primary-400/60 px-0.5">
                          {cell.colspan}×{cell.rowspan}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Side Panel */}
        {showSidePanel && (
          <div className="w-60 border-r bg-card overflow-y-auto flex-shrink-0">
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
                      onDragStart={() => setDragItem({ type: "missionType", data: mt })}
                    >
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: mt.color || "#6b7280" }} />
                      <span>{getName(mt.name)}</span>
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
                      onDragStart={() => setDragItem({ type: "workRole", data: wr })}
                    >
                      {getName(wr.name)}
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
                  { label: "בוקר 8h", start: "07:00", end: "15:00" },
                  { label: "צהריים 8h", start: "15:00", end: "23:00" },
                  { label: "לילה 8h", start: "23:00", end: "07:00" },
                  { label: "4h", start: "07:00", end: "11:00" },
                  { label: "4h", start: "11:00", end: "15:00" },
                  { label: "4h", start: "15:00", end: "19:00" },
                  { label: "4h", start: "19:00", end: "23:00" },
                  { label: "4h", start: "23:00", end: "03:00" },
                  { label: "4h", start: "03:00", end: "07:00" },
                ].map((tr, i) => (
                  <div
                    key={i}
                    className="px-2 py-1.5 rounded border border-border cursor-grab hover:bg-muted/50 text-xs flex justify-between"
                    draggable
                    onDragStart={() => setDragItem({ type: "timeRange", data: { start: tr.start, end: tr.end } })}
                  >
                    <span>{tr.label}</span>
                    <span className="text-muted-foreground">{tr.start}-{tr.end}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Template Variables */}
            <div className="border-b p-3">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                <Variable className="w-4 h-4" />
                משתני תבנית
              </h3>
              <p className="text-[10px] text-muted-foreground mb-2">
                גרור לתא — יוחלף בנתונים אמיתיים בעת יצירת לוח
              </p>
              <div className="space-y-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <div
                    key={v.key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded border border-border cursor-grab hover:bg-muted/50 text-xs"
                    draggable
                    onDragStart={() => setDragItem({ type: "variable", data: v })}
                  >
                    <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: v.color }} />
                    <span className="font-medium">{v.label}</span>
                    <span className="text-muted-foreground mr-auto text-[10px] font-mono" dir="ltr">{v.key}</span>
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
                      <option value="mission_reference">הפניה למשימה</option>
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
                  )}
                  <div className="pt-1 border-t text-muted-foreground">
                    מיזוג: {selectedCell.colspan}×{selectedCell.rowspan}
                    {selectedCell.missionTypeId && " • משימה מקושרת"}
                    {selectedCell.workRoleId && " • תפקיד מקושר"}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Generate Board Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5" />
              יצירת לוחות יומיים מהתבנית
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              המערכת תיצור לוח יומי לכל יום בטווח, עם החלפת משתנים בנתונים אמיתיים.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>מתאריך</Label>
                <Input type="date" value={generateDateFrom} onChange={(e) => setGenerateDateFrom(e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>עד תאריך</Label>
                <Input type="date" value={generateDateTo} onChange={(e) => setGenerateDateTo(e.target.value)} dir="ltr" />
              </div>
            </div>
            {generateDateFrom && generateDateTo && (
              <div className="text-xs bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded p-2">
                📅 ייווצרו {Math.max(1, Math.ceil((new Date(generateDateTo).getTime() - new Date(generateDateFrom).getTime()) / 86400000) + 1)} לוחות
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>ביטול</Button>
            <Button onClick={generateBoard} disabled={generating || !generateDateFrom || !generateDateTo}>
              <Calendar className="w-4 h-4 ml-1" />{generating ? "מייצר..." : "צור לוחות"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: "מזג תאים", icon: <Grid3X3 className="w-3 h-3" />, onClick: mergeCells, disabled: selectedCells.size < 2 },
            {
              label: "פצל תא", icon: <SplitSquareHorizontal className="w-3 h-3" />,
              onClick: () => {
                const cell = activeTemplate.grid[contextMenu.row]?.[contextMenu.col];
                if (cell) splitCell(cell.id);
              },
              disabled: (() => { const c = activeTemplate.grid[contextMenu.row]?.[contextMenu.col]; return !c || (c.colspan <= 1 && c.rowspan <= 1); })(),
            },
            { label: "", separator: true, onClick: () => {} },
            { label: "הוסף שורה למעלה", icon: <Plus className="w-3 h-3" />, onClick: () => addRow(contextMenu.row - 1) },
            { label: "הוסף שורה למטה", icon: <Plus className="w-3 h-3" />, onClick: () => addRow(contextMenu.row) },
            { label: "הוסף עמודה מימין", icon: <Plus className="w-3 h-3" />, onClick: () => addCol(contextMenu.col - 1) },
            { label: "הוסף עמודה משמאל", icon: <Plus className="w-3 h-3" />, onClick: () => addCol(contextMenu.col) },
            { label: "", separator: true, onClick: () => {} },
            { label: "מחק שורה", icon: <Trash2 className="w-3 h-3" />, onClick: () => deleteRow(contextMenu.row) },
            { label: "מחק עמודה", icon: <Trash2 className="w-3 h-3" />, onClick: () => deleteCol(contextMenu.col) },
            { label: "", separator: true, onClick: () => {} },
            { label: "נקה תוכן", icon: <Minus className="w-3 h-3" />, onClick: () => applyToSelected((c) => ({ ...c, value: "" })) },
            {
              label: "צבע כותרת ירוקה", icon: <Square className="w-3 h-3" />,
              onClick: () => applyToSelected((c) => ({ ...c, backgroundColor: "#166534", textColor: "#ffffff", fontWeight: "bold", type: "header" as CellType })),
            },
          ]}
        />
      )}
    </div>
  );
}
