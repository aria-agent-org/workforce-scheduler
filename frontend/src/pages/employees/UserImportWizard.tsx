import { useState, useRef } from "react";
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
  Upload, FileSpreadsheet, Users, CheckCircle2, AlertTriangle,
  ArrowLeft, ArrowRight, MapPin, UserPlus,
  Loader2, X, Phone, Mail, Download,
} from "lucide-react";
import api, { tenantApi, getTenantSlug } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";

// Israeli phone number validation
function validateIsraeliPhone(phone: string): "valid" | "non-israeli" | "invalid" {
  if (!phone) return "valid"; // empty is ok, not required
  const cleaned = phone.replace(/[\s\-().]/g, "");
  // Valid Israeli formats: 05X-XXXXXXX or +972-5X-XXXXXXX
  if (/^(05[0-9]{8})$/.test(cleaned)) return "valid";
  if (/^(\+972|00972|972)(5[0-9]{8})$/.test(cleaned)) return "valid";
  // Non-Israeli international
  if (/^\+[1-9][0-9]{6,14}$/.test(cleaned) || /^00[1-9][0-9]{6,14}$/.test(cleaned)) return "non-israeli";
  // Truly invalid (too short, letters, etc.)
  return "invalid";
}

// Note: role splitting (comma-separated) is handled server-side in validate endpoint

interface ImportRow {
  id: string;
  row_number: number;
  full_name: string;
  phone: string;
  email: string;
  roles: string[];
  employee_number: string;
  status: string;
  errors: Array<{ field: string; message: string; severity?: string }>;
  conflict_type: string | null;
  conflict_employee_id: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function UserImportWizard({ open, onClose, onComplete }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Upload
  const [batchId, setBatchId] = useState<string>("");
  const [columns, setColumns] = useState<string[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  // Step 2: Column mapping
  const [mapping, setMapping] = useState({
    full_name: "",
    phone: "",
    email: "",
    roles: "",
    employee_number: "",
  });

  // Step 3: Validation results
  const [, setValidRows] = useState<ImportRow[]>([]);
  const [invalidRows, setInvalidRows] = useState<ImportRow[]>([]);
  const [warningRows, setWarningRows] = useState<ImportRow[]>([]);
  const [duplicateRows, setDuplicateRows] = useState<ImportRow[]>([]);
  const [newRoles, setNewRoles] = useState<string[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [skippedRowIds, setSkippedRowIds] = useState<Set<string>>(new Set());

  // Step 4: Role resolution
  const [roleResolutions, setRoleResolutions] = useState<Array<{
    role_name: string;
    action: string;
    color: string;
  }>>([]);

  // Step 5: Conflict resolution
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, string>>({});

  // Step 6: Invitation
  const [invitationMethod, setInvitationMethod] = useState("none");

  // Results
  const [importResults, setImportResults] = useState<any>(null);
  const [registrationLinks, setRegistrationLinks] = useState<any[]>([]);

  const reset = () => {
    setStep(1);
    setBatchId("");
    setColumns([]);
    setPreview([]);
    setTotalRows(0);
    setMapping({ full_name: "", phone: "", email: "", roles: "", employee_number: "" });
    setValidRows([]);
    setInvalidRows([]);
    setWarningRows([]);
    setDuplicateRows([]);
    setNewRoles([]);
    setRoleResolutions([]);
    setConflictResolutions({});
    setSkippedRowIds(new Set());
    setInvitationMethod("none");
    setImportResults(null);
    setRegistrationLinks([]);
  };

  // ─── Download Registration Links ──────────────

  const downloadRegistrationLinks = async () => {
    try {
      // Fetch bulk registration codes
      const res = await api.post(tenantApi("/registration/generate-bulk-codes"), {});
      const codes = res.data as Array<{
        employee_id: string;
        employee_name: string;
        code: string;
        status: string;
      }>;
      setRegistrationLinks(codes);

      // Build CSV content
      const tenantSlug = getTenantSlug();
      const header = "שם מלא,קוד הרשמה,קישור הרשמה,סטטוס\n";
      const rows = codes.map(c => {
        const link = c.code ? `${window.location.origin}/join-tenant?tenant=${tenantSlug}&code=${c.code}` : "";
        return `"${c.employee_name}","${c.code || ""}","${link}","${c.status}"`;
      }).join("\n");

      const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "registration-links.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast("success", `קובץ לינקים הורד — ${codes.length} עובדים`);
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה בהורדת הקובץ"));
    }
  };

  // ─── Step 1: Upload File ───────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post(tenantApi("/import/upload"), formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBatchId(res.data.batch_id);
      setColumns(res.data.columns_detected);
      setPreview(res.data.preview);
      setTotalRows(res.data.total_rows);

      // Apply auto-mapping
      if (res.data.auto_mapping) {
        setMapping(prev => ({ ...prev, ...res.data.auto_mapping }));
      }

      setStep(2);
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה בהעלאת הקובץ"));
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Step 2: Validate ─────────────────────

  const handleValidate = async () => {
    setLoading(true);
    try {
      const res = await api.post(tenantApi("/import/validate"), {
        batch_id: batchId,
        column_mapping: mapping,
      });

      const allRows = res.data.rows as ImportRow[];
      const valid = allRows.filter(r => r.status === "valid");
      const invalid = allRows.filter(r => r.status === "invalid");
      const dupes = allRows.filter(r => r.status === "duplicate");
      // Rows with only warnings (severity=warning) but status=valid
      const withWarnings = valid.filter(r => r.errors && r.errors.length > 0);
      setValidRows(valid);
      setInvalidRows(invalid);
      setWarningRows(withWarnings);
      setDuplicateRows(dupes);
      setNewRoles(res.data.new_roles);
      setValidCount(res.data.valid_count);
      setInvalidCount(res.data.invalid_count);
      setWarningCount(withWarnings.length);
      setDuplicateCount(res.data.duplicate_count);

      // Prepare role resolutions
      setRoleResolutions(res.data.new_roles.map((r: string) => ({
        role_name: r,
        action: "create",
        color: "#3b82f6",
      })));

      // Determine next step
      if (invalid.length > 0 || withWarnings.length > 0) {
        setStep(3); // Review errors/warnings first
      } else if (res.data.new_roles.length > 0) {
        setStep(3); // Role resolution (will show if no errors)
      } else if (res.data.duplicate_count > 0) {
        setStep(4); // Conflict resolution
      } else {
        setStep(5); // Invitation method
      }
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה באימות נתונים"));
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 3: Resolve Roles ─────────────────

  const handleResolveRoles = async () => {
    setLoading(true);
    try {
      // Only call resolve-roles if there are new roles to create
      if (newRoles.length > 0) {
        await api.post(tenantApi("/import/resolve-roles"), {
          batch_id: batchId,
          role_resolutions: roleResolutions,
        });
      }

      if (duplicateCount > 0) {
        setStep(4);
      } else {
        setStep(5);
      }
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה ביצירת תפקידים"));
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 4: Resolve Conflicts ─────────────

  const handleResolveConflicts = async () => {
    setLoading(true);
    try {
      const resolutions = duplicateRows.map(r => ({
        row_id: r.id,
        action: conflictResolutions[r.id] || "skip",
      }));
      await api.post(tenantApi("/import/resolve-conflicts"), {
        batch_id: batchId,
        resolutions,
      });
      setStep(5);
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה בפתרון כפילויות"));
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 5: Execute ───────────────────────

  const handleExecute = async () => {
    setLoading(true);
    try {
      const res = await api.post(tenantApi("/import/execute"), {
        batch_id: batchId,
        invitation_method: invitationMethod,
      });
      setImportResults(res.data);
      setStep(6);
    } catch (err: any) {
      toast("error", getErrorMessage(err, "שגיאה בייבוא"));
    } finally {
      setLoading(false);
    }
  };

  const stepLabels = ["העלאה", "מיפוי עמודות", "בדיקה ותפקידים", "כפילויות", "הזמנות", "סיכום"];
  const currentStepLabel = stepLabels[step - 1] || "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-[750px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            אשף ייבוא משתמשים — {currentStepLabel}
          </DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-1 pt-3">
            {[1, 2, 3, 4, 5, 6].map(s => (
              <div key={s} className="flex items-center gap-1">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === s ? "bg-primary-500 text-white" :
                  step > s ? "bg-green-500 text-white" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {step > s ? "✓" : s}
                </div>
                {s < 6 && <div className={`w-4 h-0.5 ${step > s ? "bg-green-500" : "bg-muted"}`} />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* ─── Step 1: Upload ─── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-xl border-2 border-dashed p-8 text-center">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                <p className="text-lg font-medium mb-1">העלה קובץ CSV או Excel</p>
                <p className="text-sm text-muted-foreground mb-4">
                  הקובץ צריך לכלול: שם מלא + (טלפון או אימייל)<br />
                  אופציונלי: תפקידים, מספר עובד
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleUpload}
                />
                <Button onClick={() => fileInputRef.current?.click()} disabled={loading}>
                  {loading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Upload className="me-1 h-4 w-4" />}
                  {loading ? "מעלה..." : "בחר קובץ"}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>📋 <strong>פורמט CSV:</strong> שם_מלא, טלפון, אימייל, תפקידים</p>
                <p>📊 <strong>פורמט Excel:</strong> עמודות עם כותרות ברורות</p>
                <p>🇮🇱 <strong>טלפון:</strong> פורמט ישראלי (050-1234567 או +972501234567)</p>
                <p>👥 <strong>תפקידים:</strong> מופרדים בפסיק (נהג, לוחם, מפקד)</p>
              </div>
            </div>
          )}

          {/* ─── Step 2: Column Mapping ─── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
                <p className="font-medium text-blue-800 dark:text-blue-200">
                  📝 נמצאו {totalRows} שורות ו-{columns.length} עמודות
                </p>
                <p className="text-blue-600 dark:text-blue-300 mt-1">
                  מפה כל עמודה לשדה המתאים. שדות עם * הם חובה.
                </p>
              </div>

              <div className="grid gap-3">
                {[
                  { key: "full_name" as const, label: "שם מלא *", icon: Users, required: true },
                  { key: "phone" as const, label: "טלפון", icon: Phone, required: false },
                  { key: "email" as const, label: "אימייל", icon: Mail, required: false },
                  { key: "roles" as const, label: "תפקידים", icon: UserPlus, required: false },
                  { key: "employee_number" as const, label: "מספר עובד", icon: MapPin, required: false },
                ].map(({ key, label, icon: Icon, required }) => (
                  <div key={key} className="flex items-center gap-3">
                    <div className="flex items-center gap-2 w-36 shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm">{label}</Label>
                    </div>
                    <Select
                      value={mapping[key]}
                      onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                      className={`flex-1 ${required && !mapping[key] ? "border-red-300" : ""}`}
                    >
                      <option value="">— לא ממופה —</option>
                      {columns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>

              {/* Preview */}
              {preview.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">תצוגה מקדימה (5 שורות ראשונות):</Label>
                  <div className="overflow-x-auto max-h-[200px] border rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {columns.map(col => (
                            <th key={col} className="px-2 py-1.5 text-start font-medium">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b">
                            {columns.map(col => (
                              <td key={col} className="px-2 py-1.5">{row[col] || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Step 3: Validation Review + Role Resolution ─── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Summary counts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Card><CardContent className="p-3 text-center">
                  <p className="text-xl font-bold text-green-600">{validCount}</p>
                  <p className="text-xs text-muted-foreground">תקינים</p>
                </CardContent></Card>
                {warningCount > 0 && (
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xl font-bold text-orange-500">{warningCount}</p>
                    <p className="text-xs text-muted-foreground">אזהרות</p>
                  </CardContent></Card>
                )}
                {invalidCount > 0 && (
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xl font-bold text-red-600">{invalidCount}</p>
                    <p className="text-xs text-muted-foreground">שגויים</p>
                  </CardContent></Card>
                )}
                {duplicateCount > 0 && (
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xl font-bold text-yellow-600">{duplicateCount}</p>
                    <p className="text-xs text-muted-foreground">כפולים</p>
                  </CardContent></Card>
                )}
              </div>

              {/* Invalid rows — option to fix or skip */}
              {invalidRows.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-red-600 flex items-center gap-1">
                    <X className="h-4 w-4" /> שורות עם שגיאות ({invalidRows.length})
                  </h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {invalidRows.map(row => (
                      <Card key={row.id} className="border-red-200">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">#{row.row_number} {row.full_name || "ללא שם"}</p>
                              {row.errors.map((err, i) => (
                                <p key={i} className="text-xs text-red-600">❌ {err.message}</p>
                              ))}
                            </div>
                            <button
                              onClick={() => {
                                const next = new Set(skippedRowIds);
                                if (next.has(row.id)) next.delete(row.id);
                                else next.add(row.id);
                                setSkippedRowIds(next);
                              }}
                              className={`text-xs px-2 py-1 rounded flex-shrink-0 min-h-[32px] ${
                                skippedRowIds.has(row.id) ? "bg-gray-200 text-gray-600" : "bg-red-100 text-red-700"
                              }`}
                            >
                              {skippedRowIds.has(row.id) ? "✓ ידלג" : "דלג"}
                            </button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Phone validation warnings */}
              {(invalidRows.concat(warningRows)).some(r => r.phone && validateIsraeliPhone(r.phone) !== "valid") && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-yellow-600 flex items-center gap-1">
                    <Phone className="h-4 w-4" /> בדיקת טלפונים ישראלים
                  </h3>
                  <div className="space-y-1 max-h-[120px] overflow-y-auto text-xs">
                    {[...invalidRows, ...warningRows].filter(r => r.phone && validateIsraeliPhone(r.phone) !== "valid").map(row => {
                      const validity = validateIsraeliPhone(row.phone);
                      return (
                        <div key={row.id} className="flex items-center justify-between p-2 rounded bg-yellow-50 dark:bg-yellow-900/20">
                          <span>#{row.row_number} {row.full_name}: {row.phone}</span>
                          <Badge className={validity === "non-israeli" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}>
                            {validity === "non-israeli" ? "⚠️ לא ישראלי" : "❌ לא תקין"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">שורות עם טלפון לא ישראלי יעברו ייבוא — ניתן לדלג עליהן בעמודה</p>
                </div>
              )}

              {/* Warning rows (valid but with warnings) */}
              {warningRows.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-orange-600 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> אזהרות ({warningRows.length})
                  </h3>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {warningRows.map(row => (
                      <div key={row.id} className="flex items-center gap-2 text-xs p-2 bg-orange-50 dark:bg-orange-900/20 rounded">
                        <span className="font-medium">#{row.row_number} {row.full_name}</span>
                        {row.errors.filter(e => e.severity === "warning").map((err, i) => (
                          <span key={i} className="text-orange-600">⚠️ {err.message}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">שורות עם אזהרות ייובאו בכל מקרה</p>
                </div>
              )}

              {/* New roles resolution */}
              {newRoles.length > 0 && (
                <>
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 text-sm">
                    <p className="font-medium text-purple-800 dark:text-purple-200">
                      🏷️ נמצאו {newRoles.length} תפקידים שלא קיימים במערכת
                    </p>
                    <p className="text-purple-600 dark:text-purple-300">
                      בחר האם ליצור אותם או לדלג
                    </p>
                  </div>

                  {roleResolutions.map((res, i) => (
                    <Card key={res.role_name}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-purple-100 text-purple-700">{res.role_name}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={res.action}
                              onChange={(e) => {
                                const updated = [...roleResolutions];
                                updated[i].action = e.target.value;
                                setRoleResolutions(updated);
                              }}
                              className="w-36"
                            >
                              <option value="create">✅ צור תפקיד</option>
                              <option value="skip">❌ דלג</option>
                            </Select>
                            {res.action === "create" && (
                              <Input
                                type="color"
                                value={res.color}
                                onChange={(e) => {
                                  const updated = [...roleResolutions];
                                  updated[i].color = e.target.value;
                                  setRoleResolutions(updated);
                                }}
                                className="w-10 h-8 p-0.5"
                              />
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ─── Step 4: Conflict Resolution ─── */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{validCount}</p>
                    <p className="text-xs text-muted-foreground">תקינים</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-600">{duplicateCount}</p>
                    <p className="text-xs text-muted-foreground">כפולים</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{invalidCount}</p>
                    <p className="text-xs text-muted-foreground">שגויים</p>
                  </CardContent>
                </Card>
              </div>

              {duplicateRows.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">כפילויות — בחר פעולה לכל שורה:</Label>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {duplicateRows.map(row => (
                      <Card key={row.id} className="border-yellow-200">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-sm">{row.full_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {row.phone && <span>📱 {row.phone} </span>}
                                {row.email && <span>✉️ {row.email}</span>}
                              </p>
                              <Badge className="bg-yellow-100 text-yellow-700 text-[10px] mt-1">
                                {row.conflict_type === "phone_exists" ? "טלפון כבר קיים" :
                                 row.conflict_type === "email_exists" ? "אימייל כבר קיים" :
                                 "מספר עובד כבר קיים"}
                              </Badge>
                            </div>
                            <Select
                              value={conflictResolutions[row.id] || "skip"}
                              onChange={(e) => setConflictResolutions({
                                ...conflictResolutions,
                                [row.id]: e.target.value,
                              })}
                              className="w-36"
                            >
                              <option value="skip">⏭ דלג</option>
                              <option value="update">🔄 עדכן קיים</option>
                              <option value="create">➕ צור בכל זאת</option>
                            </Select>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Step 5: Invitation Method ─── */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                  {validCount + Object.values(conflictResolutions).filter(v => v !== "skip").length}
                </p>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  משתמשים מוכנים לייבוא
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">שיטת הזמנה לאחר הייבוא:</Label>
                <div className="grid gap-2">
                  {[
                    { key: "none", icon: "⏩", title: "ללא הזמנה", desc: "ייבא בלבד, ללא שליחת הזמנות" },
                    { key: "email", icon: "✉️", title: "אימייל", desc: "שלח הזמנה לאימייל לכל משתמש" },
                    { key: "sms", icon: "📱", title: "SMS", desc: "שלח הזמנה ב-SMS" },
                    { key: "whatsapp", icon: "💬", title: "WhatsApp", desc: "שלח הזמנה ב-WhatsApp" },
                    { key: "telegram", icon: "📨", title: "Telegram", desc: "שלח הזמנה דרך Telegram" },
                    { key: "download", icon: "📥", title: "הורד קובץ", desc: "הורד קובץ עם קישורי הרשמה לכל המשתמשים" },
                    { key: "self_registration", icon: "🔗", title: "הרשמה עצמאית", desc: "המערכת תתאים אוטומטית לפי טלפון/אימייל בהרשמה" },
                  ].map(m => (
                    <button
                      key={m.key}
                      onClick={() => setInvitationMethod(m.key)}
                      className={`flex items-center gap-3 rounded-lg border-2 p-3 text-start transition-all ${
                        invitationMethod === m.key
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/10"
                          : "border-muted hover:border-primary-200"
                      }`}
                    >
                      <span className="text-2xl">{m.icon}</span>
                      <div>
                        <p className="font-medium text-sm">{m.title}</p>
                        <p className="text-xs text-muted-foreground">{m.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 6: Results ─── */}
          {step === 6 && importResults && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-600 mb-3" />
                <p className="text-xl font-bold text-green-700 dark:text-green-300">ייבוא הושלם בהצלחה!</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{importResults.imported}</p>
                    <p className="text-xs text-muted-foreground">נוצרו חדשים</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{importResults.updated}</p>
                    <p className="text-xs text-muted-foreground">עודכנו</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-gray-500">{importResults.skipped}</p>
                    <p className="text-xs text-muted-foreground">דולגו</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-purple-600">{importResults.invitations_sent}</p>
                    <p className="text-xs text-muted-foreground">הזמנות נשלחו</p>
                  </CardContent>
                </Card>
              </div>

              {/* Download Registration Links */}
              <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20 space-y-3">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">📥 הורדת קובץ לינקים</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  הורד קובץ CSV עם קישורי הרשמה ייחודיים לכל עובד — שתף עם העובדים להרשמה עצמאית
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={downloadRegistrationLinks}
                  className="min-h-[44px] border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  <Download className="me-1 h-4 w-4" />
                  הורדת קובץ לינקים
                </Button>
                {registrationLinks.length > 0 && (
                  <p className="text-xs text-green-600">✅ הקובץ הורד — {registrationLinks.length} עובדים</p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step > 1 && step < 6 && (
            <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={loading}>
              <ArrowRight className="me-1 h-4 w-4" />
              חזרה
            </Button>
          )}
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>
            {step === 6 ? "סגור" : "ביטול"}
          </Button>
          {step === 2 && (
            <Button onClick={handleValidate} disabled={loading || !mapping.full_name}>
              {loading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <ArrowLeft className="me-1 h-4 w-4" />}
              {loading ? "מאמת..." : "אמת נתונים"}
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleResolveRoles} disabled={loading}>
              {loading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <ArrowLeft className="me-1 h-4 w-4" />}
              המשך
            </Button>
          )}
          {step === 4 && (
            <Button onClick={handleResolveConflicts} disabled={loading}>
              {loading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <ArrowLeft className="me-1 h-4 w-4" />}
              המשך
            </Button>
          )}
          {step === 5 && (
            <Button onClick={handleExecute} disabled={loading}>
              {loading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="me-1 h-4 w-4" />}
              {loading ? "מייבא..." : "בצע ייבוא"}
            </Button>
          )}
          {step === 6 && (
            <Button onClick={() => { reset(); onComplete(); onClose(); }}>
              <CheckCircle2 className="me-1 h-4 w-4" />
              סיום
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
