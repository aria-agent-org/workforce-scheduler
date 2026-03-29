import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  LayoutTemplate, Plus, Save, Eye, Trash2, GripVertical, Pencil,
  ChevronUp, ChevronDown, Palette, Clock, User, FileText, Minus, Copy,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";

// ─── Types ───────────────────────────────────────

type RowType = "mission" | "shift" | "label" | "separator";
type ColType = "time" | "slot" | "notes" | "custom";

interface BoardCell {
  value?: string;        // Display value or label
  colspan?: number;      // Horizontal merge
  slotId?: string;       // If this is a soldier-assignment slot
  color?: string;        // Cell background color
}

interface BoardRow {
  id: string;
  type: RowType;
  label: string;         // Row label (e.g., "07:00-15:00" or "מנהל תורן")
  missionTypeId?: string;
  timeRange?: { start: string; end: string };
  color?: string;        // Row background color
  cells: BoardCell[];
}

interface BoardColumn {
  id: string;
  type: ColType;
  label: string;         // Column header
  width: number;
  slotWorkRoleId?: string;
}

interface BoardTemplate {
  id: string;
  name: string;
  rows: BoardRow[];
  columns: BoardColumn[];
}

// ─── Helpers ─────────────────────────────────────

let _id = Date.now();
const uid = () => `${++_id}_${Math.random().toString(36).slice(2, 6)}`;

const defaultTemplate = (): BoardTemplate => ({
  id: uid(),
  name: "תבנית ברירת מחדל",
  columns: [
    { id: uid(), type: "time", label: "שעה", width: 80 },
    { id: uid(), type: "slot", label: "נהג", width: 120 },
    { id: uid(), type: "slot", label: 'ר"צ', width: 120 },
    { id: uid(), type: "slot", label: "עובד 1", width: 120 },
    { id: uid(), type: "notes", label: "הערות", width: 150 },
  ],
  rows: [
    { id: uid(), type: "shift", label: "בוקר", timeRange: { start: "07:00", end: "15:00" }, cells: [{ value: "07:00-15:00" }, {}, {}, {}, {}] },
    { id: uid(), type: "shift", label: "ערב", timeRange: { start: "15:00", end: "23:00" }, cells: [{ value: "15:00-23:00" }, {}, {}, {}, {}] },
    { id: uid(), type: "shift", label: "לילה", timeRange: { start: "23:00", end: "07:00" }, cells: [{ value: "23:00-07:00" }, {}, {}, {}, {}] },
    { id: uid(), type: "separator", label: "", cells: [{}, {}, {}, {}, {}] },
    { id: uid(), type: "label", label: "מנהל תורן", cells: [{ value: "מנהל תורן" }, { slotId: "duty_mgr" }, {}, {}, {}] },
  ],
});

const ensureCells = (row: BoardRow, colCount: number): BoardCell[] => {
  const cells = [...(row.cells || [])];
  while (cells.length < colCount) cells.push({});
  return cells.slice(0, colCount);
};

// ─── Component ───────────────────────────────────

export default function BoardTemplateEditor() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [template, setTemplate] = useState<BoardTemplate>(defaultTemplate());
  const [missionTypes, setMissionTypes] = useState<any[]>([]);
  const [workRoles, setWorkRoles] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Edit modals
  const [editRowIdx, setEditRowIdx] = useState<number | null>(null);
  const [editColIdx, setEditColIdx] = useState<number | null>(null);
  const [editCellPos, setEditCellPos] = useState<{ row: number; col: number } | null>(null);

  // Row add modal
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRowType, setNewRowType] = useState<RowType>("shift");
  const [newRowLabel, setNewRowLabel] = useState("");
  const [newRowStart, setNewRowStart] = useState("08:00");
  const [newRowEnd, setNewRowEnd] = useState("16:00");
  const [newRowMissionTypeId, setNewRowMissionTypeId] = useState("");

  // Col add modal
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColType, setNewColType] = useState<ColType>("slot");
  const [newColLabel, setNewColLabel] = useState("");

  // Load mission types and work roles
  useEffect(() => {
    Promise.all([
      api.get(tenantApi("/mission-types")).catch(() => ({ data: [] })),
      api.get(tenantApi("/settings/work-roles")).catch(() => ({ data: [] })),
    ]).then(([mtRes, wrRes]) => {
      setMissionTypes(mtRes.data || []);
      setWorkRoles(wrRes.data || []);
    });

    // Load saved template
    api.get(tenantApi("/settings")).then(res => {
      const settings = res.data || [];
      const boardSetting = settings.find((s: any) => s.key === "board_grid_template");
      if (boardSetting?.value) {
        try {
          const saved = typeof boardSetting.value === "string"
            ? JSON.parse(boardSetting.value)
            : boardSetting.value._v
              ? (typeof boardSetting.value._v === "string" ? JSON.parse(boardSetting.value._v) : boardSetting.value._v)
              : boardSetting.value;
          if (saved.columns && saved.rows) {
            setTemplate(saved);
          }
        } catch {}
      }
    }).catch(() => {});
  }, []);

  const saveTemplate = async () => {
    setSaving(true);
    try {
      await api.post(tenantApi("/settings"), {
        key: "board_grid_template",
        value: template,
        group: "board",
      });
      toast("success", "תבנית הלוח נשמרה בהצלחה");
    } catch {
      toast("error", "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  // ─── Row Operations ────────────────────────────

  const addRow = () => {
    const cells: BoardCell[] = template.columns.map(() => ({}));
    let row: BoardRow;

    if (newRowType === "shift") {
      cells[0] = { value: `${newRowStart}-${newRowEnd}` };
      row = {
        id: uid(), type: "shift", label: newRowLabel || `${newRowStart}-${newRowEnd}`,
        timeRange: { start: newRowStart, end: newRowEnd }, cells,
      };
    } else if (newRowType === "mission") {
      cells[0] = { value: newRowLabel };
      row = {
        id: uid(), type: "mission", label: newRowLabel,
        missionTypeId: newRowMissionTypeId || undefined, cells,
      };
    } else if (newRowType === "separator") {
      row = { id: uid(), type: "separator", label: "", cells };
    } else {
      cells[0] = { value: newRowLabel };
      row = { id: uid(), type: "label", label: newRowLabel, cells };
    }

    setTemplate(prev => ({
      ...prev,
      rows: [...prev.rows, row],
    }));
    setShowAddRow(false);
    setNewRowLabel("");
  };

  const removeRow = (idx: number) => {
    setTemplate(prev => ({
      ...prev,
      rows: prev.rows.filter((_, i) => i !== idx),
    }));
  };

  const moveRow = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= template.rows.length) return;
    setTemplate(prev => {
      const rows = [...prev.rows];
      [rows[idx], rows[newIdx]] = [rows[newIdx], rows[idx]];
      return { ...prev, rows };
    });
  };

  // ─── Column Operations ─────────────────────────

  const addColumn = () => {
    const col: BoardColumn = {
      id: uid(), type: newColType, label: newColLabel || "חדש", width: 120,
    };
    setTemplate(prev => ({
      ...prev,
      columns: [...prev.columns, col],
      rows: prev.rows.map(row => ({
        ...row,
        cells: [...ensureCells(row, prev.columns.length), {}],
      })),
    }));
    setShowAddCol(false);
    setNewColLabel("");
  };

  const removeColumn = (idx: number) => {
    setTemplate(prev => ({
      ...prev,
      columns: prev.columns.filter((_, i) => i !== idx),
      rows: prev.rows.map(row => ({
        ...row,
        cells: ensureCells(row, prev.columns.length).filter((_, i) => i !== idx),
      })),
    }));
  };

  const moveColumn = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= template.columns.length) return;
    setTemplate(prev => {
      const columns = [...prev.columns];
      [columns[idx], columns[newIdx]] = [columns[newIdx], columns[idx]];
      const rows = prev.rows.map(row => {
        const cells = ensureCells(row, prev.columns.length);
        const newCells = [...cells];
        [newCells[idx], newCells[newIdx]] = [newCells[newIdx], newCells[idx]];
        return { ...row, cells: newCells };
      });
      return { ...prev, columns, rows };
    });
  };

  // ─── Cell Operations ───────────────────────────

  const updateCell = (rowIdx: number, colIdx: number, updates: Partial<BoardCell>) => {
    setTemplate(prev => ({
      ...prev,
      rows: prev.rows.map((row, ri) => {
        if (ri !== rowIdx) return row;
        const cells = ensureCells(row, prev.columns.length);
        cells[colIdx] = { ...cells[colIdx], ...updates };
        return { ...row, cells };
      }),
    }));
  };

  // ─── Row type styling ─────────────────────────

  const rowBg = (row: BoardRow) => {
    if (row.color) return row.color;
    switch (row.type) {
      case "separator": return "#e5e7eb";
      case "label": return "#dbeafe";
      case "mission": return "#fef3c7";
      default: return "transparent";
    }
  };

  const rowTypeIcon = (type: RowType) => {
    switch (type) {
      case "shift": return <Clock className="h-3.5 w-3.5 text-green-600" />;
      case "mission": return <LayoutTemplate className="h-3.5 w-3.5 text-yellow-600" />;
      case "label": return <FileText className="h-3.5 w-3.5 text-blue-600" />;
      case "separator": return <Minus className="h-3.5 w-3.5 text-gray-400" />;
    }
  };

  const colCount = template.columns.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6 text-indigo-600" />
            בנאי לוח יומי — WYSIWYG
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            בנה את הלוח כמו גיליון אקסל: הוסף שורות ועמודות, סדר מחדש, ולחץ על תא כדי לערוך
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="me-1 h-4 w-4" />תצוגה מקדימה
          </Button>
          <Button onClick={saveTemplate} disabled={saving}>
            <Save className="me-1 h-4 w-4" />{saving ? "שומר..." : "שמור תבנית"}
          </Button>
        </div>
      </div>

      {/* Template name */}
      <div className="flex items-center gap-3">
        <Label className="text-sm font-bold">שם התבנית:</Label>
        <Input
          value={template.name}
          onChange={e => setTemplate(prev => ({ ...prev, name: e.target.value }))}
          className="max-w-xs"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => { setNewRowType("shift"); setNewRowLabel(""); setShowAddRow(true); }}>
          <Plus className="me-1 h-4 w-4" />הוסף שורה
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setNewColType("slot"); setNewColLabel(""); setShowAddCol(true); }}>
          <Plus className="me-1 h-4 w-4" />הוסף עמודה
        </Button>
      </div>

      {/* ═══ THE GRID ═══ */}
      <div className="overflow-x-auto rounded-xl border shadow-sm">
        <table className="w-full border-collapse" style={{ minWidth: template.columns.reduce((s, c) => s + c.width, 60) }}>
          {/* Column Headers */}
          <thead>
            <tr className="bg-muted/60">
              {/* Row controls column */}
              <th className="border px-1 py-2 w-[60px] text-center text-[10px] text-muted-foreground">
                ↕
              </th>
              {template.columns.map((col, ci) => (
                <th
                  key={col.id}
                  className="border px-2 py-2 text-sm font-bold cursor-pointer hover:bg-muted/80 transition-colors group relative"
                  style={{ minWidth: col.width, width: col.width }}
                  onClick={() => setEditColIdx(ci)}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>{col.label}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {ci > 0 && (
                        <button onClick={e => { e.stopPropagation(); moveColumn(ci, -1); }} className="text-muted-foreground hover:text-foreground" title="הזז שמאלה">
                          ←
                        </button>
                      )}
                      {ci < colCount - 1 && (
                        <button onClick={e => { e.stopPropagation(); moveColumn(ci, 1); }} className="text-muted-foreground hover:text-foreground" title="הזז ימינה">
                          →
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] font-normal text-muted-foreground">
                    {col.type === "time" ? "⏰" : col.type === "slot" ? "👤" : col.type === "notes" ? "📝" : "✏️"}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {template.rows.map((row, ri) => {
              const cells = ensureCells(row, colCount);
              const bg = rowBg(row);

              if (row.type === "separator") {
                return (
                  <tr key={row.id}>
                    <td className="border px-1 py-0.5 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        {ri > 0 && <button onClick={() => moveRow(ri, -1)} className="text-muted-foreground hover:text-foreground text-xs">▲</button>}
                        {ri < template.rows.length - 1 && <button onClick={() => moveRow(ri, 1)} className="text-muted-foreground hover:text-foreground text-xs">▼</button>}
                        <button onClick={() => removeRow(ri)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </td>
                    <td colSpan={colCount} className="border h-2" style={{ backgroundColor: bg }} />
                  </tr>
                );
              }

              return (
                <tr key={row.id} style={{ backgroundColor: bg }} className="hover:brightness-95 transition-all">
                  {/* Row controls */}
                  <td className="border px-1 py-1 text-center" style={{ backgroundColor: "#f9fafb" }}>
                    <div className="flex flex-col items-center gap-0.5">
                      {rowTypeIcon(row.type)}
                      {ri > 0 && <button onClick={() => moveRow(ri, -1)} className="text-muted-foreground hover:text-foreground text-[10px]">▲</button>}
                      {ri < template.rows.length - 1 && <button onClick={() => moveRow(ri, 1)} className="text-muted-foreground hover:text-foreground text-[10px]">▼</button>}
                      <button onClick={() => setEditRowIdx(ri)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-2.5 w-2.5" /></button>
                      <button onClick={() => removeRow(ri)} className="text-red-400 hover:text-red-600"><Trash2 className="h-2.5 w-2.5" /></button>
                    </div>
                  </td>
                  {/* Data cells */}
                  {cells.map((cell, ci) => {
                    if (cell.colspan && cell.colspan > 1) {
                      // This cell spans multiple columns — handled by the merged cell
                    }
                    // Check if this cell is hidden by a previous cell's colspan
                    const prevMerge = cells.slice(0, ci).find((c, idx) => c.colspan && idx + (c.colspan || 1) > ci);
                    if (prevMerge) return null;

                    const col = template.columns[ci];
                    const isSlotCol = col?.type === "slot";
                    const isTimeCol = col?.type === "time";
                    const hasSlot = cell.slotId || (isSlotCol && row.type === "shift");

                    return (
                      <td
                        key={ci}
                        colSpan={cell.colspan || 1}
                        className={`border px-2 py-2 text-sm cursor-pointer hover:ring-2 hover:ring-primary-300 hover:ring-inset transition-all ${
                          hasSlot ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                        }`}
                        style={{ minWidth: col?.width || 100, backgroundColor: cell.color || undefined }}
                        onClick={() => setEditCellPos({ row: ri, col: ci })}
                      >
                        {cell.value ? (
                          <span className="font-medium">{cell.value}</span>
                        ) : hasSlot ? (
                          <div className="flex items-center justify-center gap-1 text-blue-400 text-xs py-1">
                            <User className="h-3.5 w-3.5" />
                            <span>לחץ לשבץ</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30 text-xs">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-green-600" /> שורת משמרת</span>
        <span className="flex items-center gap-1"><LayoutTemplate className="h-3 w-3 text-yellow-600" /> שורת סוג משימה</span>
        <span className="flex items-center gap-1"><FileText className="h-3 w-3 text-blue-600" /> שורת תווית</span>
        <span className="flex items-center gap-1"><Minus className="h-3 w-3 text-gray-400" /> מפריד</span>
        <span className="flex items-center gap-1"><User className="h-3 w-3 text-blue-400" /> סלוט חייל (לחיץ)</span>
      </div>

      {/* ═══ MODALS ═══ */}

      {/* Add Row */}
      <Dialog open={showAddRow} onOpenChange={setShowAddRow}>
        <DialogContent className="max-w-[450px]">
          <DialogHeader><DialogTitle>הוסף שורה</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>סוג שורה</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { type: "shift" as RowType, label: "⏰ משמרת", desc: "שורה עם טווח שעות" },
                  { type: "mission" as RowType, label: "📋 סוג משימה", desc: "שורה מקושרת לסוג משימה" },
                  { type: "label" as RowType, label: "🏷️ תווית", desc: "שורת טקסט חופשי" },
                  { type: "separator" as RowType, label: "➖ מפריד", desc: "קו הפרדה" },
                ]).map(opt => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => setNewRowType(opt.type)}
                    className={`rounded-xl border p-3 text-start transition-all ${
                      newRowType === opt.type ? "ring-2 ring-primary-500 border-primary-300 bg-primary-50 dark:bg-primary-900/20" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {newRowType !== "separator" && (
              <div className="space-y-2">
                <Label>תווית / שם</Label>
                <Input value={newRowLabel} onChange={e => setNewRowLabel(e.target.value)} placeholder="לדוגמה: בוקר, מנהל תורן..." />
              </div>
            )}

            {newRowType === "shift" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>שעת התחלה</Label>
                  <Input type="time" value={newRowStart} onChange={e => setNewRowStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>שעת סיום</Label>
                  <Input type="time" value={newRowEnd} onChange={e => setNewRowEnd(e.target.value)} />
                </div>
              </div>
            )}

            {newRowType === "mission" && missionTypes.length > 0 && (
              <div className="space-y-2">
                <Label>סוג משימה</Label>
                <Select value={newRowMissionTypeId} onChange={e => setNewRowMissionTypeId(e.target.value)}>
                  <option value="">ללא קישור</option>
                  {missionTypes.map((mt: any) => (
                    <option key={mt.id} value={mt.id}>{mt.name?.[lang] || mt.name?.he || mt.name}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRow(false)}>ביטול</Button>
            <Button onClick={addRow}>הוסף</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Column */}
      <Dialog open={showAddCol} onOpenChange={setShowAddCol}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader><DialogTitle>הוסף עמודה</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>סוג עמודה</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { type: "slot" as ColType, label: "👤 סלוט חייל", desc: "עמודה לשיבוץ חייל" },
                  { type: "time" as ColType, label: "⏰ שעה", desc: "עמודת זמן" },
                  { type: "notes" as ColType, label: "📝 הערות", desc: "עמודת הערות" },
                  { type: "custom" as ColType, label: "✏️ מותאם", desc: "עמודה חופשית" },
                ]).map(opt => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => setNewColType(opt.type)}
                    className={`rounded-xl border p-3 text-start transition-all ${
                      newColType === opt.type ? "ring-2 ring-primary-500 border-primary-300 bg-primary-50 dark:bg-primary-900/20" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>כותרת עמודה</Label>
              <Input value={newColLabel} onChange={e => setNewColLabel(e.target.value)} placeholder="לדוגמה: נהג, שומר, מפקד..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCol(false)}>ביטול</Button>
            <Button onClick={addColumn}>הוסף</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Row */}
      <Dialog open={editRowIdx !== null} onOpenChange={open => { if (!open) setEditRowIdx(null); }}>
        <DialogContent className="max-w-[450px]">
          <DialogHeader><DialogTitle>עריכת שורה</DialogTitle></DialogHeader>
          {editRowIdx !== null && (() => {
            const row = template.rows[editRowIdx];
            if (!row) return null;
            return (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>תווית</Label>
                  <Input
                    value={row.label}
                    onChange={e => setTemplate(prev => ({
                      ...prev,
                      rows: prev.rows.map((r, i) => i === editRowIdx ? { ...r, label: e.target.value } : r),
                    }))}
                  />
                </div>
                {row.type === "shift" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>שעת התחלה</Label>
                      <Input
                        type="time"
                        value={row.timeRange?.start || ""}
                        onChange={e => setTemplate(prev => ({
                          ...prev,
                          rows: prev.rows.map((r, i) => i === editRowIdx
                            ? { ...r, timeRange: { start: e.target.value, end: r.timeRange?.end || "" } }
                            : r
                          ),
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>שעת סיום</Label>
                      <Input
                        type="time"
                        value={row.timeRange?.end || ""}
                        onChange={e => setTemplate(prev => ({
                          ...prev,
                          rows: prev.rows.map((r, i) => i === editRowIdx
                            ? { ...r, timeRange: { ...r.timeRange!, end: e.target.value } }
                            : r
                          ),
                        }))}
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>צבע רקע</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={row.color || "#ffffff"}
                      onChange={e => setTemplate(prev => ({
                        ...prev,
                        rows: prev.rows.map((r, i) => i === editRowIdx ? { ...r, color: e.target.value } : r),
                      }))}
                      className="w-12 h-10"
                    />
                    <Button variant="ghost" size="sm" onClick={() => setTemplate(prev => ({
                      ...prev,
                      rows: prev.rows.map((r, i) => i === editRowIdx ? { ...r, color: undefined } : r),
                    }))}>
                      נקה צבע
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button onClick={() => setEditRowIdx(null)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Column */}
      <Dialog open={editColIdx !== null} onOpenChange={open => { if (!open) setEditColIdx(null); }}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader><DialogTitle>עריכת עמודה</DialogTitle></DialogHeader>
          {editColIdx !== null && (() => {
            const col = template.columns[editColIdx];
            if (!col) return null;
            return (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>כותרת</Label>
                  <Input
                    value={col.label}
                    onChange={e => setTemplate(prev => ({
                      ...prev,
                      columns: prev.columns.map((c, i) => i === editColIdx ? { ...c, label: e.target.value } : c),
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>רוחב (px)</Label>
                  <Input
                    type="number" min={50} max={400}
                    value={col.width}
                    onChange={e => setTemplate(prev => ({
                      ...prev,
                      columns: prev.columns.map((c, i) => i === editColIdx ? { ...c, width: parseInt(e.target.value) || 100 } : c),
                    }))}
                  />
                </div>
                <div className="pt-2 border-t">
                  <Button variant="destructive" size="sm" onClick={() => { removeColumn(editColIdx); setEditColIdx(null); }}>
                    <Trash2 className="me-1 h-4 w-4" />מחק עמודה
                  </Button>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button onClick={() => setEditColIdx(null)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Cell */}
      <Dialog open={editCellPos !== null} onOpenChange={open => { if (!open) setEditCellPos(null); }}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader><DialogTitle>עריכת תא</DialogTitle></DialogHeader>
          {editCellPos && (() => {
            const row = template.rows[editCellPos.row];
            const cells = ensureCells(row, colCount);
            const cell = cells[editCellPos.col] || {};
            const col = template.columns[editCellPos.col];

            return (
              <div className="space-y-4 py-4">
                <div className="text-xs text-muted-foreground">
                  שורה: <strong>{row.label || row.type}</strong> | עמודה: <strong>{col?.label}</strong>
                </div>
                <div className="space-y-2">
                  <Label>ערך / תוכן</Label>
                  <Input
                    value={cell.value || ""}
                    onChange={e => updateCell(editCellPos.row, editCellPos.col, { value: e.target.value })}
                    placeholder="טקסט חופשי, שם חייל..."
                  />
                </div>
                {col?.type === "slot" && (
                  <div className="space-y-2">
                    <Label>מזהה סלוט (slot ID)</Label>
                    <Input
                      value={cell.slotId || ""}
                      onChange={e => updateCell(editCellPos.row, editCellPos.col, { slotId: e.target.value })}
                      placeholder="auto"
                    />
                    <p className="text-[10px] text-muted-foreground">סלוט מאפשר שיבוץ חיילים אוטומטי. השאר ריק אם לא נדרש.</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>מיזוג תאים (colspan)</Label>
                  <Input
                    type="number" min={1} max={colCount}
                    value={cell.colspan || 1}
                    onChange={e => updateCell(editCellPos.row, editCellPos.col, { colspan: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>צבע רקע</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={cell.color || "#ffffff"}
                      onChange={e => updateCell(editCellPos.row, editCellPos.col, { color: e.target.value })}
                      className="w-12 h-10"
                    />
                    <Button variant="ghost" size="sm" onClick={() => updateCell(editCellPos.row, editCellPos.col, { color: undefined })}>
                      נקה
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button onClick={() => setEditCellPos(null)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader><DialogTitle>תצוגה מקדימה — {template.name}</DialogTitle></DialogHeader>
          <div className="py-4">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-700 text-white">
                    {template.columns.map(col => (
                      <th key={col.id} className="border border-slate-600 px-3 py-2 text-sm font-bold" style={{ minWidth: col.width }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {template.rows.map(row => {
                    const cells = ensureCells(row, colCount);
                    const bg = rowBg(row);

                    if (row.type === "separator") {
                      return <tr key={row.id}><td colSpan={colCount} className="border h-1.5" style={{ backgroundColor: "#cbd5e1" }} /></tr>;
                    }

                    return (
                      <tr key={row.id} style={{ backgroundColor: bg }}>
                        {cells.map((cell, ci) => {
                          const prevMerge = cells.slice(0, ci).find((c, idx) => c.colspan && idx + (c.colspan || 1) > ci);
                          if (prevMerge) return null;
                          const col = template.columns[ci];
                          const hasSlot = cell.slotId || (col?.type === "slot" && row.type === "shift");

                          return (
                            <td key={ci} colSpan={cell.colspan || 1}
                              className={`border px-3 py-2 text-sm ${hasSlot ? "text-center" : ""}`}
                              style={{ backgroundColor: cell.color || undefined }}
                            >
                              {cell.value || (hasSlot ? (
                                <span className="inline-block border-2 border-dashed border-blue-300 rounded px-3 py-1 text-blue-400 text-xs">
                                  [חייל]
                                </span>
                              ) : "—")}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
