import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, GripVertical, Clock, CheckCircle2, XCircle } from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface StatusDef {
  id: string;
  code: string;
  name: Record<string, string>;
  color: string | null;
  icon: string | null;
  is_schedulable: boolean;
  schedulable_from_time: string | null;
  counts_as_present: boolean;
  sort_order: number;
  is_system: boolean;
}

const EMOJI_OPTIONS = ["✅", "🏠", "🤒", "🏖️", "🎖️", "📚", "🚗", "💻", "🔧", "⚡", "🎯", "🛡️", "📋", "🔒", "⏰", "🌙", "☀️", "🏃", "💪", "🎓"];

function SortableStatusItem({
  status, lang, onEdit, onDelete,
}: {
  status: StatusDef;
  lang: "he" | "en";
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: status.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
        <GripVertical className="h-5 w-5" />
      </button>

      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg text-lg"
        style={{ backgroundColor: (status.color || "#6b7280") + "20", color: status.color || "#6b7280" }}
      >
        {status.icon || "📋"}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{status.name[lang] || status.name.he || status.code}</h3>
          <Badge className="text-xs font-mono" style={{ backgroundColor: (status.color || "#6b7280") + "20", color: status.color || "#6b7280" }}>
            {status.code}
          </Badge>
          {status.is_system && <Badge>מערכת</Badge>}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {status.counts_as_present ? (
              <><CheckCircle2 className="h-3 w-3 text-green-500" /> נחשב נוכח</>
            ) : (
              <><XCircle className="h-3 w-3 text-red-500" /> לא נחשב נוכח</>
            )}
          </span>
          <span className="flex items-center gap-1">
            {status.is_schedulable ? "✓ ניתן לשיבוץ" : "✗ לא ניתן לשיבוץ"}
          </span>
          {status.schedulable_from_time && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> מ-{status.schedulable_from_time}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        {!status.is_system && (
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AttendanceStatusesPage() {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language as "he" | "en";

  const [statuses, setStatuses] = useState<StatusDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StatusDef | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StatusDef | null>(null);

  const [form, setForm] = useState({
    code: "",
    name_he: "",
    name_en: "",
    color: "#3b82f6",
    icon: "📋",
    is_schedulable: true,
    schedulable_from_time: "",
    counts_as_present: true,
    sort_order: 0,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(tenantApi("/attendance/statuses"));
      setStatuses(res.data);
    } catch (e) {
      toast("error", "שגיאה בטעינת סטטוסים");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      code: "",
      name_he: "",
      name_en: "",
      color: "#3b82f6",
      icon: "📋",
      is_schedulable: true,
      schedulable_from_time: "",
      counts_as_present: true,
      sort_order: statuses.length,
    });
    setShowModal(true);
  };

  const openEdit = (s: StatusDef) => {
    setEditing(s);
    setForm({
      code: s.code,
      name_he: s.name.he || "",
      name_en: s.name.en || "",
      color: s.color || "#3b82f6",
      icon: s.icon || "📋",
      is_schedulable: s.is_schedulable,
      schedulable_from_time: s.schedulable_from_time || "",
      counts_as_present: s.counts_as_present,
      sort_order: s.sort_order,
    });
    setShowModal(true);
  };

  const saveStatus = async () => {
    try {
      const body = {
        code: form.code,
        name: { he: form.name_he, en: form.name_en },
        color: form.color,
        icon: form.icon,
        is_schedulable: form.is_schedulable,
        schedulable_from_time: form.schedulable_from_time || null,
        counts_as_present: form.counts_as_present,
        sort_order: form.sort_order,
      };
      if (editing) {
        await api.patch(tenantApi(`/attendance/statuses/${editing.id}`), body);
        toast("success", "סטטוס עודכן");
      } else {
        await api.post(tenantApi("/attendance/statuses"), body);
        toast("success", "סטטוס נוצר");
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "שגיאה");
    }
  };

  const deleteStatus = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(tenantApi(`/attendance/statuses/${deleteTarget.id}`));
      toast("success", "סטטוס נמחק");
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast("error", e.response?.data?.detail || "לא ניתן למחוק סטטוס בשימוש");
      setDeleteTarget(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = statuses.findIndex(s => s.id === active.id);
    const newIndex = statuses.findIndex(s => s.id === over.id);
    const reordered = arrayMove(statuses, oldIndex, newIndex);
    setStatuses(reordered);

    // Save new order
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].sort_order !== i) {
        await api.patch(tenantApi(`/attendance/statuses/${reordered[i].id}`), { sort_order: i }).catch(() => {});
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{lang === "he" ? "סטטוסי נוכחות" : "Attendance Statuses"}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "he" ? "הגדר סטטוסי נוכחות — גרור לסידור מחדש" : "Define attendance statuses — drag to reorder"}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="me-1 h-4 w-4" />{lang === "he" ? "סטטוס חדש" : "New Status"}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={statuses.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {statuses.map(s => (
                <SortableStatusItem
                  key={s.id}
                  status={s}
                  lang={lang}
                  onEdit={() => openEdit(s)}
                  onDelete={() => setDeleteTarget(s)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת סטטוס" : "סטטוס חדש"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>קוד</Label>
                <Input
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })}
                  placeholder="present"
                  disabled={!!editing}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>צבע</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={e => setForm({ ...form, color: e.target.value })}
                    className="h-10 w-14 cursor-pointer rounded"
                  />
                  <span className="text-sm font-mono">{form.color}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שם (עברית)</Label>
                <Input
                  value={form.name_he}
                  onChange={e => setForm({ ...form, name_he: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>שם (אנגלית)</Label>
                <Input
                  value={form.name_en}
                  onChange={e => setForm({ ...form, name_en: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>אימוג׳י</Label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => setForm({ ...form, icon: emoji })}
                    className={`h-10 w-10 rounded-lg text-lg flex items-center justify-center border-2 transition-colors ${
                      form.icon === emoji ? "border-primary-500 bg-primary-50" : "border-transparent hover:border-muted"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_schedulable}
                  onChange={e => setForm({ ...form, is_schedulable: e.target.checked })}
                />
                <span className="text-sm">ניתן לשיבוץ</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.counts_as_present}
                  onChange={e => setForm({ ...form, counts_as_present: e.target.checked })}
                />
                <span className="text-sm">נחשב נוכח</span>
              </label>
            </div>
            {form.is_schedulable && (
              <div className="space-y-2">
                <Label>ניתן לשיבוץ מ-שעה (אופציונלי)</Label>
                <Input
                  type="time"
                  value={form.schedulable_from_time}
                  onChange={e => setForm({ ...form, schedulable_from_time: e.target.value })}
                  className="w-40"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>ביטול</Button>
            <Button onClick={saveStatus}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={deleteStatus}
        onCancel={() => setDeleteTarget(null)}
        title="מחיקת סטטוס"
        message={`האם למחוק את הסטטוס "${deleteTarget?.name[lang] || deleteTarget?.code}"?`}
        confirmLabel="מחק"
        cancelLabel="ביטול"
        variant="destructive"
      />
    </div>
  );
}
