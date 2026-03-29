import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  LayoutTemplate, Plus, Save, Eye, EyeOff, Download, Star, Trash2,
  GripVertical, Columns, Pencil, FileSpreadsheet,
} from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as XLSX from "xlsx";

interface BoardColumn {
  id: string;
  key: string;
  label_he: string;
  label_en: string;
  width: number;
  visible: boolean;
  hidden_from_soldier: boolean;
}

interface BoardTemplate {
  id: string;
  name: string;
  is_default: boolean;
  columns: BoardColumn[];
}

const AVAILABLE_COLUMNS: BoardColumn[] = [
  { id: "col_name", key: "full_name", label_he: "שם", label_en: "Name", width: 150, visible: true, hidden_from_soldier: false },
  { id: "col_number", key: "employee_number", label_he: "מספר אישי", label_en: "Number", width: 100, visible: true, hidden_from_soldier: false },
  { id: "col_role", key: "work_role", label_he: "תפקיד", label_en: "Role", width: 120, visible: true, hidden_from_soldier: false },
  { id: "col_mission", key: "mission_name", label_he: "משימה", label_en: "Mission", width: 150, visible: true, hidden_from_soldier: false },
  { id: "col_start", key: "start_time", label_he: "שעת התחלה", label_en: "Start Time", width: 100, visible: true, hidden_from_soldier: false },
  { id: "col_end", key: "end_time", label_he: "שעת סיום", label_en: "End Time", width: 100, visible: true, hidden_from_soldier: false },
  { id: "col_location", key: "location", label_he: "מיקום", label_en: "Location", width: 120, visible: true, hidden_from_soldier: false },
  { id: "col_status", key: "attendance_status", label_he: "סטטוס נוכחות", label_en: "Attendance", width: 120, visible: true, hidden_from_soldier: false },
  { id: "col_phone", key: "phone", label_he: "טלפון", label_en: "Phone", width: 120, visible: false, hidden_from_soldier: true },
  { id: "col_notes", key: "notes", label_he: "הערות", label_en: "Notes", width: 200, visible: true, hidden_from_soldier: false },
  { id: "col_equipment", key: "equipment", label_he: "ציוד", label_en: "Equipment", width: 150, visible: false, hidden_from_soldier: false },
  { id: "col_shift", key: "shift_type", label_he: "סוג משמרת", label_en: "Shift Type", width: 100, visible: false, hidden_from_soldier: false },
];

const SAMPLE_DATA = [
  { full_name: "ישראל ישראלי", employee_number: "1234567", work_role: "לוחם", mission_name: "שמירה - שער ראשי", start_time: "08:00", end_time: "16:00", location: "שער ראשי", attendance_status: "נוכח", phone: "050-1234567", notes: "", equipment: "נשק + אפוד", shift_type: "בוקר" },
  { full_name: "דוד כהן", employee_number: "2345678", work_role: "מפקד", mission_name: "פיקוח כללי", start_time: "08:00", end_time: "20:00", location: "מפקדה", attendance_status: "נוכח", phone: "050-2345678", notes: "אחראי משמרת", equipment: "נשק", shift_type: "בוקר" },
  { full_name: "שרה לוי", employee_number: "3456789", work_role: "לוחם", mission_name: "סיור", start_time: "16:00", end_time: "00:00", location: "גזרה צפון", attendance_status: "נוכח", phone: "050-3456789", notes: "", equipment: "נשק + משקפי לילה", shift_type: "ערב" },
];

function SortableColumn({
  column, lang, onToggleVisible, onToggleHidden, onWidthChange, onRemove,
}: {
  column: BoardColumn;
  lang: "he" | "en";
  onToggleVisible: () => void;
  onToggleHidden: () => void;
  onWidthChange: (w: number) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: column.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-lg border bg-card p-2.5">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-medium">{lang === "he" ? column.label_he : column.label_en}</span>
      <Input
        type="number"
        min={50}
        max={400}
        value={column.width}
        onChange={e => onWidthChange(parseInt(e.target.value) || 100)}
        className="w-20 text-center text-xs"
      />
      <button onClick={onToggleVisible} title={column.visible ? "הסתר" : "הצג"}>
        {column.visible ? <Eye className="h-4 w-4 text-green-500" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
      </button>
      <button
        onClick={onToggleHidden}
        title={column.hidden_from_soldier ? "מוסתר מחייל" : "נראה לחייל"}
        className={column.hidden_from_soldier ? "text-red-500" : "text-muted-foreground"}
      >
        {column.hidden_from_soldier ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
      <button onClick={onRemove}><Trash2 className="h-4 w-4 text-red-400 hover:text-red-600" /></button>
    </div>
  );
}

export default function BoardTemplateEditor() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [templates, setTemplates] = useState<BoardTemplate[]>([
    {
      id: "default",
      name: "תבנית ברירת מחדל",
      is_default: true,
      columns: AVAILABLE_COLUMNS.filter(c => c.visible).map(c => ({ ...c })),
    },
  ]);
  const [activeTemplate, setActiveTemplate] = useState("default");
  const [showPreview, setShowPreview] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const current = templates.find(t => t.id === activeTemplate) || templates[0];

  useEffect(() => {
    // Load templates from settings
    api.get(tenantApi("/settings")).then(res => {
      const settings = res.data || [];
      const boardSettings = settings.find((s: any) => s.key === "board_templates");
      if (boardSettings?.value) {
        setTemplates(boardSettings.value);
      }
    }).catch(() => {});
  }, []);

  const saveTemplates = async () => {
    setSaving(true);
    try {
      await api.post(tenantApi("/settings"), {
        key: "board_templates",
        value: templates,
        group: "board",
      }).catch(() =>
        api.patch(tenantApi("/settings/board_templates"), { value: templates }).catch(() => {})
      );
      toast("success", "תבניות נשמרו");
    } catch (e) {
      toast("error", "שגיאה");
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTemplates(prev => prev.map(tpl => {
      if (tpl.id !== activeTemplate) return tpl;
      const oldIdx = tpl.columns.findIndex(c => c.id === active.id);
      const newIdx = tpl.columns.findIndex(c => c.id === over.id);
      return { ...tpl, columns: arrayMove(tpl.columns, oldIdx, newIdx) };
    }));
  };

  const updateColumn = (colId: string, field: string, value: any) => {
    setTemplates(prev => prev.map(tpl => {
      if (tpl.id !== activeTemplate) return tpl;
      return {
        ...tpl,
        columns: tpl.columns.map(c =>
          c.id === colId ? { ...c, [field]: value } : c
        ),
      };
    }));
  };

  const removeColumn = (colId: string) => {
    setTemplates(prev => prev.map(tpl => {
      if (tpl.id !== activeTemplate) return tpl;
      return { ...tpl, columns: tpl.columns.filter(c => c.id !== colId) };
    }));
  };

  const addColumn = (col: BoardColumn) => {
    setTemplates(prev => prev.map(tpl => {
      if (tpl.id !== activeTemplate) return tpl;
      if (tpl.columns.some(c => c.key === col.key)) return tpl;
      return { ...tpl, columns: [...tpl.columns, { ...col }] };
    }));
    setShowAddColumn(false);
  };

  const addTemplate = () => {
    const id = `tpl_${Date.now()}`;
    setTemplates(prev => [...prev, {
      id,
      name: "תבנית חדשה",
      is_default: false,
      columns: AVAILABLE_COLUMNS.filter(c => c.visible).map(c => ({ ...c })),
    }]);
    setActiveTemplate(id);
  };

  const setDefault = (id: string) => {
    setTemplates(prev => prev.map(t => ({ ...t, is_default: t.id === id })));
  };

  const deleteTemplate = (id: string) => {
    if (templates.length <= 1) return;
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (activeTemplate === id) setActiveTemplate(templates[0].id);
  };

  const exportToPDF = () => {
    toast("info", "ייצוא PDF — יפתח חלון הדפסה");
    window.print();
  };

  const exportToExcel = () => {
    const visibleCols = current.columns.filter(c => c.visible);
    const rows = SAMPLE_DATA.map(row => {
      const r: Record<string, string> = {};
      for (const col of visibleCols) {
        r[lang === "he" ? col.label_he : col.label_en] = (row as any)[col.key] || "";
      }
      return r;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Board");
    XLSX.writeFile(wb, `board-template-${current.name}.xlsx`);
  };

  const availableToAdd = AVAILABLE_COLUMNS.filter(c => !current.columns.some(cc => cc.key === c.key));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6 text-indigo-600" />
            {lang === "he" ? "עורך תבנית לוח יומי" : "Daily Board Template Editor"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "he" ? "גרור עמודות לסידור, שנה רוחב, והגדר נראות" : "Drag columns to reorder, resize, and set visibility"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <FileSpreadsheet className="me-1 h-4 w-4" />Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportToPDF}>
            <Download className="me-1 h-4 w-4" />PDF
          </Button>
          <Button onClick={saveTemplates} disabled={saving}>
            <Save className="me-1 h-4 w-4" />{saving ? "שומר..." : "שמור"}
          </Button>
        </div>
      </div>

      {/* Template Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {templates.map(tpl => (
          <button
            key={tpl.id}
            onClick={() => setActiveTemplate(tpl.id)}
            className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm border transition-colors ${
              activeTemplate === tpl.id ? "bg-primary-500 text-white border-primary-500" : "bg-card hover:bg-accent"
            }`}
          >
            {tpl.is_default && <Star className="h-3 w-3" />}
            {tpl.name}
          </button>
        ))}
        <Button size="sm" variant="outline" onClick={addTemplate}>
          <Plus className="me-1 h-4 w-4" />תבנית חדשה
        </Button>
      </div>

      {/* Template Controls */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4 flex-wrap">
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-xs">שם תבנית</Label>
            <Input
              value={current.name}
              onChange={e => setTemplates(prev => prev.map(t => t.id === activeTemplate ? { ...t, name: e.target.value } : t))}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setDefault(activeTemplate)}>
            <Star className="me-1 h-4 w-4" />{current.is_default ? "ברירת מחדל ✓" : "הגדר כברירת מחדל"}
          </Button>
          {templates.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => deleteTemplate(activeTemplate)}>
              <Trash2 className="me-1 h-4 w-4 text-red-500" />מחק
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="me-1 h-4 w-4" />תצוגה מקדימה
          </Button>
          {availableToAdd.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowAddColumn(true)}>
              <Columns className="me-1 h-4 w-4" />הוסף עמודה
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Column Editor */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={current.columns.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-2.5 text-xs text-muted-foreground">
              <span className="w-6"></span>
              <span className="flex-1">עמודה</span>
              <span className="w-20 text-center">רוחב (px)</span>
              <span className="w-8 text-center">נראה</span>
              <span className="w-8 text-center" title="מוסתר מחייל">👁‍🗨</span>
              <span className="w-8"></span>
            </div>
            {current.columns.map(col => (
              <SortableColumn
                key={col.id}
                column={col}
                lang={lang}
                onToggleVisible={() => updateColumn(col.id, "visible", !col.visible)}
                onToggleHidden={() => updateColumn(col.id, "hidden_from_soldier", !col.hidden_from_soldier)}
                onWidthChange={w => updateColumn(col.id, "width", w)}
                onRemove={() => removeColumn(col.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add Column Dialog */}
      <Dialog open={showAddColumn} onOpenChange={setShowAddColumn}>
        <DialogContent>
          <DialogHeader><DialogTitle>הוסף עמודה</DialogTitle></DialogHeader>
          <div className="space-y-2 py-4">
            {availableToAdd.map(col => (
              <button
                key={col.id}
                onClick={() => addColumn(col)}
                className="w-full flex items-center gap-3 rounded-lg border p-3 hover:bg-accent text-start"
              >
                <Columns className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium text-sm">{lang === "he" ? col.label_he : col.label_en}</div>
                  <div className="text-xs text-muted-foreground">{col.key}</div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>תצוגה מקדימה — {current.name}</DialogTitle></DialogHeader>
          <div className="overflow-x-auto py-4">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  {current.columns.filter(c => c.visible).map(col => (
                    <th
                      key={col.id}
                      className="border px-3 py-2 text-start text-sm font-medium"
                      style={{ minWidth: col.width, width: col.width }}
                    >
                      {lang === "he" ? col.label_he : col.label_en}
                      {col.hidden_from_soldier && <EyeOff className="inline ms-1 h-3 w-3 text-red-400" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SAMPLE_DATA.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-muted/20">
                    {current.columns.filter(c => c.visible).map(col => (
                      <td
                        key={col.id}
                        className="border px-3 py-2 text-sm"
                        style={{ minWidth: col.width, width: col.width }}
                      >
                        {(row as any)[col.key] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
