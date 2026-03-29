import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
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
  LayoutTemplate, Plus, Save, Eye, EyeOff, Download, Star, Trash2,
  GripVertical, Columns, Pencil, FileSpreadsheet, Layers, ChevronDown,
  ChevronUp, Filter, Copy,
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

// --- Types ---

interface BoardColumn {
  id: string;
  key: string;
  label_he: string;
  label_en: string;
  width: number;
  visible: boolean;
  hidden_from_soldier: boolean;
}

interface BoardSection {
  id: string;
  name: string;
  mission_types: string[]; // filter: which mission types go into this section
  columns: BoardColumn[];
  collapsed: boolean;
}

interface BoardTemplate {
  id: string;
  name: string;
  is_default: boolean;
  schedule_window_id: string | null; // null = global default, or specific window id
  sections: BoardSection[];
  // Legacy: flat columns (migrated to sections on load)
  columns?: BoardColumn[];
}

interface ScheduleWindow {
  id: string;
  name: string;
}

// --- Available columns ---

const AVAILABLE_COLUMNS: BoardColumn[] = [
  { id: "col_name", key: "full_name", label_he: "שם", label_en: "Name", width: 150, visible: true, hidden_from_soldier: false },
  { id: "col_number", key: "employee_number", label_he: "מספר אישי", label_en: "Number", width: 100, visible: true, hidden_from_soldier: false },
  { id: "col_role", key: "work_role", label_he: "תפקיד", label_en: "Role", width: 120, visible: true, hidden_from_soldier: false },
  { id: "col_mission", key: "mission_name", label_he: "משימה", label_en: "Mission", width: 150, visible: true, hidden_from_soldier: false },
  { id: "col_mission_type", key: "mission_type", label_he: "סוג משימה", label_en: "Mission Type", width: 120, visible: true, hidden_from_soldier: false },
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
  { full_name: "ישראל ישראלי", employee_number: "1234567", work_role: "לוחם", mission_name: "שמירה - שער ראשי", mission_type: "שמירה", start_time: "08:00", end_time: "16:00", location: "שער ראשי", attendance_status: "נוכח", phone: "050-1234567", notes: "", equipment: "נשק + אפוד", shift_type: "בוקר" },
  { full_name: "דוד כהן", employee_number: "2345678", work_role: "מפקד", mission_name: "פיקוח כללי", mission_type: "פיקוד", start_time: "08:00", end_time: "20:00", location: "מפקדה", attendance_status: "נוכח", phone: "050-2345678", notes: "אחראי משמרת", equipment: "נשק", shift_type: "בוקר" },
  { full_name: "שרה לוי", employee_number: "3456789", work_role: "לוחם", mission_name: "סיור", mission_type: "סיור", start_time: "16:00", end_time: "00:00", location: "גזרה צפון", attendance_status: "נוכח", phone: "050-3456789", notes: "", equipment: "נשק + משקפי לילה", shift_type: "ערב" },
];

const MISSION_TYPES = ["שמירה", "סיור", "פיקוד", "תורנות", "הכשרה", "מנוחה", "אחר"];

const defaultColumns = () => AVAILABLE_COLUMNS.filter(c => c.visible).map(c => ({ ...c, id: `${c.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }));

const createDefaultSection = (): BoardSection => ({
  id: `sec_${Date.now()}`,
  name: "כללי",
  mission_types: [],
  columns: defaultColumns(),
  collapsed: false,
});

// Migrate legacy template (flat columns) to sections
function migrateTemplate(tpl: any): BoardTemplate {
  if (tpl.sections && tpl.sections.length > 0) return tpl as BoardTemplate;
  return {
    ...tpl,
    schedule_window_id: tpl.schedule_window_id || null,
    sections: [{
      id: "sec_default",
      name: "כללי",
      mission_types: [],
      columns: tpl.columns || defaultColumns(),
      collapsed: false,
    }],
  };
}

// --- Sortable Column Component ---

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
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-lg border bg-card p-2">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-medium truncate">{lang === "he" ? column.label_he : column.label_en}</span>
      <Input
        type="number"
        min={50}
        max={400}
        value={column.width}
        onChange={e => onWidthChange(parseInt(e.target.value) || 100)}
        className="w-16 text-center text-xs h-8"
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

// --- Sortable Section Component ---

function SortableSection({ section, children }: { section: BoardSection; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 mb-2">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground">
          <GripVertical className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

// --- Main Component ---

export default function BoardTemplateEditor() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [templates, setTemplates] = useState<BoardTemplate[]>([
    migrateTemplate({
      id: "default",
      name: "תבנית ברירת מחדל",
      is_default: true,
      schedule_window_id: null,
      sections: [createDefaultSection()],
    }),
  ]);
  const [activeTemplate, setActiveTemplate] = useState("default");
  const [showPreview, setShowPreview] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState<string | null>(null); // section id
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionTypes, setNewSectionTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [scheduleWindows, setScheduleWindows] = useState<ScheduleWindow[]>([]);
  const [filterMissionType, setFilterMissionType] = useState<string>("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const [editingSectionTypes, setEditingSectionTypes] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const current = templates.find(t => t.id === activeTemplate) || templates[0];

  // Load templates and schedule windows
  useEffect(() => {
    api.get(tenantApi("/settings")).then(res => {
      const settings = res.data || [];
      const boardSettings = settings.find((s: any) => s.key === "board_templates");
      if (boardSettings?.value && Array.isArray(boardSettings.value)) {
        setTemplates(boardSettings.value.map(migrateTemplate));
      }
    }).catch(() => {});

    // Try to load schedule windows
    api.get(tenantApi("/schedule-windows")).then(res => {
      if (Array.isArray(res.data)) setScheduleWindows(res.data);
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
    } catch {
      toast("error", "שגיאה");
    } finally {
      setSaving(false);
    }
  };

  // --- Template operations ---

  const addTemplate = () => {
    const id = `tpl_${Date.now()}`;
    setTemplates(prev => [...prev, {
      id,
      name: "תבנית חדשה",
      is_default: false,
      schedule_window_id: null,
      sections: [createDefaultSection()],
    }]);
    setActiveTemplate(id);
  };

  const duplicateTemplate = () => {
    const id = `tpl_${Date.now()}`;
    const clone: BoardTemplate = JSON.parse(JSON.stringify(current));
    clone.id = id;
    clone.name = `${clone.name} (עותק)`;
    clone.is_default = false;
    // Re-generate IDs for sections and columns
    clone.sections = clone.sections.map(sec => ({
      ...sec,
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      columns: sec.columns.map(col => ({
        ...col,
        id: `${col.key}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      })),
    }));
    setTemplates(prev => [...prev, clone]);
    setActiveTemplate(id);
  };

  const setDefault = (id: string) => {
    setTemplates(prev => prev.map(t => ({ ...t, is_default: t.id === id })));
  };

  const deleteTemplate = (id: string) => {
    if (templates.length <= 1) return;
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (activeTemplate === id) setActiveTemplate(templates.find(t => t.id !== id)?.id || templates[0].id);
  };

  const setScheduleWindow = (windowId: string) => {
    setTemplates(prev => prev.map(t =>
      t.id === activeTemplate ? { ...t, schedule_window_id: windowId || null } : t
    ));
  };

  // --- Section operations ---

  const addSection = () => {
    if (!newSectionName.trim()) return;
    const sec: BoardSection = {
      id: `sec_${Date.now()}`,
      name: newSectionName.trim(),
      mission_types: newSectionTypes,
      columns: defaultColumns(),
      collapsed: false,
    };
    setTemplates(prev => prev.map(t =>
      t.id === activeTemplate ? { ...t, sections: [...t.sections, sec] } : t
    ));
    setNewSectionName("");
    setNewSectionTypes([]);
    setShowAddSection(false);
  };

  const removeSection = (secId: string) => {
    setTemplates(prev => prev.map(t => {
      if (t.id !== activeTemplate) return t;
      if (t.sections.length <= 1) return t; // keep at least 1
      return { ...t, sections: t.sections.filter(s => s.id !== secId) };
    }));
  };

  const toggleSectionCollapse = (secId: string) => {
    setTemplates(prev => prev.map(t => {
      if (t.id !== activeTemplate) return t;
      return {
        ...t,
        sections: t.sections.map(s =>
          s.id === secId ? { ...s, collapsed: !s.collapsed } : s
        ),
      };
    }));
  };

  const updateSectionDetails = () => {
    if (!editingSectionId) return;
    setTemplates(prev => prev.map(t => {
      if (t.id !== activeTemplate) return t;
      return {
        ...t,
        sections: t.sections.map(s =>
          s.id === editingSectionId
            ? { ...s, name: editingSectionName, mission_types: editingSectionTypes }
            : s
        ),
      };
    }));
    setEditingSectionId(null);
  };

  // --- Section drag ---

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTemplates(prev => prev.map(tpl => {
      if (tpl.id !== activeTemplate) return tpl;
      const oldIdx = tpl.sections.findIndex(s => s.id === active.id);
      const newIdx = tpl.sections.findIndex(s => s.id === over.id);
      return { ...tpl, sections: arrayMove(tpl.sections, oldIdx, newIdx) };
    }));
  };

  // --- Column operations within a section ---

  const handleColumnDragEnd = (sectionId: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTemplates(prev => prev.map(tpl => {
      if (tpl.id !== activeTemplate) return tpl;
      return {
        ...tpl,
        sections: tpl.sections.map(sec => {
          if (sec.id !== sectionId) return sec;
          const oldIdx = sec.columns.findIndex(c => c.id === active.id);
          const newIdx = sec.columns.findIndex(c => c.id === over.id);
          return { ...sec, columns: arrayMove(sec.columns, oldIdx, newIdx) };
        }),
      };
    }));
  };

  const updateColumn = (sectionId: string, colId: string, field: string, value: any) => {
    setTemplates(prev => prev.map(tpl => {
      if (tpl.id !== activeTemplate) return tpl;
      return {
        ...tpl,
        sections: tpl.sections.map(sec => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            columns: sec.columns.map(c =>
              c.id === colId ? { ...c, [field]: value } : c
            ),
          };
        }),
      };
    }));
  };

  const removeColumn = (sectionId: string, colId: string) => {
    setTemplates(prev => prev.map(tpl => {
      if (tpl.id !== activeTemplate) return tpl;
      return {
        ...tpl,
        sections: tpl.sections.map(sec => {
          if (sec.id !== sectionId) return sec;
          return { ...sec, columns: sec.columns.filter(c => c.id !== colId) };
        }),
      };
    }));
  };

  const addColumnToSection = (sectionId: string, col: BoardColumn) => {
    const newCol = {
      ...col,
      id: `${col.key}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
    setTemplates(prev => prev.map(tpl => {
      if (tpl.id !== activeTemplate) return tpl;
      return {
        ...tpl,
        sections: tpl.sections.map(sec => {
          if (sec.id !== sectionId) return sec;
          return { ...sec, columns: [...sec.columns, newCol] };
        }),
      };
    }));
    setShowAddColumn(null);
  };

  // --- Export ---

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    for (const sec of current.sections) {
      const visibleCols = sec.columns.filter(c => c.visible);
      const filteredData = filterMissionType
        ? SAMPLE_DATA.filter(r => r.mission_type === filterMissionType)
        : SAMPLE_DATA;
      const rows = filteredData.map(row => {
        const r: Record<string, string> = {};
        for (const col of visibleCols) {
          r[lang === "he" ? col.label_he : col.label_en] = (row as any)[col.key] || "";
        }
        return r;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, sec.name.slice(0, 31));
    }
    XLSX.writeFile(wb, `board-template-${current.name}.xlsx`);
  };

  const exportToPDF = () => {
    toast("info", "ייצוא PDF — יפתח חלון הדפסה");
    window.print();
  };

  const toggleMissionType = (type: string, arr: string[], setArr: (a: string[]) => void) => {
    setArr(arr.includes(type) ? arr.filter(t => t !== type) : [...arr, type]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6 text-indigo-600" />
            {lang === "he" ? "עורך תבנית לוח יומי" : "Daily Board Template Editor"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "he" ? "הגדר מקטעים, גרור עמודות, סנן לפי סוג משימה" : "Define sections, drag columns, filter by mission type"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
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
            {tpl.schedule_window_id && <Badge className="ms-1 text-[9px] px-1">חלון</Badge>}
          </button>
        ))}
        <Button size="sm" variant="outline" onClick={addTemplate}>
          <Plus className="me-1 h-4 w-4" />תבנית חדשה
        </Button>
      </div>

      {/* Template Controls */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4 flex-wrap">
          <div className="space-y-1 flex-1 min-w-[180px]">
            <Label className="text-xs">שם תבנית</Label>
            <Input
              value={current.name}
              onChange={e => setTemplates(prev => prev.map(t => t.id === activeTemplate ? { ...t, name: e.target.value } : t))}
            />
          </div>
          {scheduleWindows.length > 0 && (
            <div className="space-y-1 min-w-[180px]">
              <Label className="text-xs">חלון שיבוץ</Label>
              <Select
                value={current.schedule_window_id || ""}
                onChange={e => setScheduleWindow(e.target.value)}
              >
                <option value="">ברירת מחדל (גלובלי)</option>
                {scheduleWindows.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="space-y-1 min-w-[150px]">
            <Label className="text-xs">סנן לפי סוג משימה</Label>
            <Select value={filterMissionType} onChange={e => setFilterMissionType(e.target.value)}>
              <option value="">הכל</option>
              {MISSION_TYPES.map(mt => (
                <option key={mt} value={mt}>{mt}</option>
              ))}
            </Select>
          </div>
          <div className="flex gap-1 items-end pt-4">
            <Button variant="outline" size="sm" onClick={() => setDefault(activeTemplate)}>
              <Star className="me-1 h-4 w-4" />{current.is_default ? "ברירת מחדל ✓" : "ברירת מחדל"}
            </Button>
            <Button variant="outline" size="sm" onClick={duplicateTemplate}>
              <Copy className="me-1 h-4 w-4" />שכפל
            </Button>
            {templates.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => deleteTemplate(activeTemplate)}>
                <Trash2 className="me-1 h-4 w-4 text-red-500" />מחק
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
              <Eye className="me-1 h-4 w-4" />תצוגה מקדימה
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Layers className="h-5 w-5" />
          מקטעים ({current.sections.length})
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowAddSection(true)}>
          <Plus className="me-1 h-4 w-4" />מקטע חדש
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
        <SortableContext items={current.sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {current.sections.map(section => (
              <SortableSection key={section.id} section={section}>
                <Card className="flex-1">
                  <CardContent className="p-4 space-y-3">
                    {/* Section Header */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleSectionCollapse(section.id)}>
                          {section.collapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                        </button>
                        <h4 className="font-bold text-base">{section.name}</h4>
                        {section.mission_types.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {section.mission_types.map(mt => (
                              <Badge key={mt} variant="default" className="text-[10px]">
                                <Filter className="h-3 w-3 me-0.5" />{mt}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {section.mission_types.length === 0 && (
                          <Badge variant="outline" className="text-[10px]">כל סוגי המשימות</Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditingSectionId(section.id);
                          setEditingSectionName(section.name);
                          setEditingSectionTypes([...section.mission_types]);
                        }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowAddColumn(section.id)}>
                          <Columns className="h-3.5 w-3.5 me-1" />עמודה
                        </Button>
                        {current.sections.length > 1 && (
                          <Button size="sm" variant="ghost" onClick={() => removeSection(section.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Columns (collapsible) */}
                    {!section.collapsed && (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleColumnDragEnd(section.id)}
                      >
                        <SortableContext items={section.columns.map(c => c.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 px-2 text-[11px] text-muted-foreground">
                              <span className="w-6"></span>
                              <span className="flex-1">עמודה</span>
                              <span className="w-16 text-center">רוחב</span>
                              <span className="w-7 text-center">נראה</span>
                              <span className="w-7 text-center" title="חייל">👁</span>
                              <span className="w-7"></span>
                            </div>
                            {section.columns.map(col => (
                              <SortableColumn
                                key={col.id}
                                column={col}
                                lang={lang}
                                onToggleVisible={() => updateColumn(section.id, col.id, "visible", !col.visible)}
                                onToggleHidden={() => updateColumn(section.id, col.id, "hidden_from_soldier", !col.hidden_from_soldier)}
                                onWidthChange={w => updateColumn(section.id, col.id, "width", w)}
                                onRemove={() => removeColumn(section.id, col.id)}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </CardContent>
                </Card>
              </SortableSection>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add Section Dialog */}
      <Dialog open={showAddSection} onOpenChange={setShowAddSection}>
        <DialogContent>
          <DialogHeader><DialogTitle>מקטע חדש</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>שם המקטע</Label>
              <Input
                value={newSectionName}
                onChange={e => setNewSectionName(e.target.value)}
                placeholder="לדוגמה: שמירות, סיורים, פיקוד..."
              />
            </div>
            <div className="space-y-2">
              <Label>סוגי משימות (השאר ריק = הכל)</Label>
              <div className="flex flex-wrap gap-2">
                {MISSION_TYPES.map(mt => (
                  <button
                    key={mt}
                    onClick={() => toggleMissionType(mt, newSectionTypes, setNewSectionTypes)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs border transition-colors",
                      newSectionTypes.includes(mt)
                        ? "bg-primary-500 text-white border-primary-500"
                        : "bg-card hover:bg-accent"
                    )}
                  >
                    {mt}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSection(false)}>ביטול</Button>
            <Button onClick={addSection} disabled={!newSectionName.trim()}>צור מקטע</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Section Dialog */}
      <Dialog open={!!editingSectionId} onOpenChange={open => { if (!open) setEditingSectionId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>עריכת מקטע</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>שם המקטע</Label>
              <Input
                value={editingSectionName}
                onChange={e => setEditingSectionName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>סוגי משימות</Label>
              <div className="flex flex-wrap gap-2">
                {MISSION_TYPES.map(mt => (
                  <button
                    key={mt}
                    onClick={() => toggleMissionType(mt, editingSectionTypes, setEditingSectionTypes)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs border transition-colors",
                      editingSectionTypes.includes(mt)
                        ? "bg-primary-500 text-white border-primary-500"
                        : "bg-card hover:bg-accent"
                    )}
                  >
                    {mt}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSectionId(null)}>ביטול</Button>
            <Button onClick={updateSectionDetails}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Column Dialog */}
      <Dialog open={!!showAddColumn} onOpenChange={open => { if (!open) setShowAddColumn(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>הוסף עמודה</DialogTitle></DialogHeader>
          <div className="space-y-2 py-4 max-h-[400px] overflow-y-auto">
            {AVAILABLE_COLUMNS.map(col => (
              <button
                key={col.id}
                onClick={() => showAddColumn && addColumnToSection(showAddColumn, col)}
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
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>תצוגה מקדימה — {current.name}</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            {current.sections.map(section => {
              const visibleCols = section.columns.filter(c => c.visible);
              let data = SAMPLE_DATA;
              if (section.mission_types.length > 0) {
                data = data.filter(d => section.mission_types.includes(d.mission_type));
              }
              if (filterMissionType) {
                data = data.filter(d => d.mission_type === filterMissionType);
              }

              return (
                <div key={section.id}>
                  <h3 className="text-base font-bold mb-2 flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    {section.name}
                    {section.mission_types.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({section.mission_types.join(", ")})
                      </span>
                    )}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-muted/50">
                          {visibleCols.map(col => (
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
                        {data.length === 0 ? (
                          <tr><td colSpan={visibleCols.length} className="border px-3 py-4 text-center text-muted-foreground">אין נתונים למקטע זה</td></tr>
                        ) : data.map((row, i) => (
                          <tr key={i} className="border-b hover:bg-muted/20">
                            {visibleCols.map(col => (
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
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


