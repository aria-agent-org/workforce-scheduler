import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Shield, ShieldCheck, ShieldOff, Smartphone, Monitor,
  Copy, RefreshCw, LogOut, CheckCircle, AlertTriangle,
} from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

interface Session {
  id: string;
  device_info: string;
  ip_address: string;
  last_active: string;
  is_current: boolean;
  created_at: string;
}

type TwoFAStep = "idle" | "setup-qr" | "verify-code" | "show-backup" | "disable-confirm" | "regenerate-confirm";

export default function SecuritySettingsPage() {
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);

  // 2FA state
  const [twoFAStep, setTwoFAStep] = useState<TwoFAStep>("idle");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const is2FAEnabled = user?.two_factor_enabled ?? false;

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/sessions");
      setSessions(Array.isArray(data) ? data : data.sessions || []);
    } catch {
      // sessions endpoint might not exist yet
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadSessions().finally(() => setLoading(false));
  }, [loadSessions]);

  // ── 2FA: Enable ──
  const handleEnable2FA = async () => {
    setError("");
    setActionLoading(true);
    try {
      const { data } = await api.post("/auth/2fa/enable");
      setQrCodeUrl(data.qr_code_url || data.qr_code_uri || data.provisioning_uri || "");
      setSecret(data.secret || "");
      setTwoFAStep("setup-qr");
    } catch (err: any) {
      toast("error", err.response?.data?.detail || "שגיאה בהפעלת אימות דו-שלבי");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    setError("");
    if (verifyCode.length < 6) {
      setError("הזן קוד בן 6 ספרות");
      return;
    }
    setActionLoading(true);
    try {
      const { data } = await api.post("/auth/2fa/verify", { code: verifyCode });
      setBackupCodes(data.backup_codes || []);
      setTwoFAStep("show-backup");
      await fetchUser();
      toast("success", "אימות דו-שלבי הופעל בהצלחה");
    } catch (err: any) {
      setError(err.response?.data?.detail || "קוד שגוי. נסה שוב.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── 2FA: Disable ──
  const handleDisable2FA = async () => {
    setError("");
    if (!password) {
      setError("הזן סיסמה לאישור");
      return;
    }
    setActionLoading(true);
    try {
      await api.post("/auth/2fa/disable", { password });
      await fetchUser();
      setTwoFAStep("idle");
      setPassword("");
      toast("success", "אימות דו-שלבי בוטל");
    } catch (err: any) {
      setError(err.response?.data?.detail || "סיסמה שגויה");
    } finally {
      setActionLoading(false);
    }
  };

  // ── 2FA: Regenerate backup codes ──
  const handleRegenerateBackup = async () => {
    setError("");
    if (!password) {
      setError("הזן סיסמה לאישור");
      return;
    }
    setActionLoading(true);
    try {
      const { data } = await api.post("/auth/2fa/backup-codes/regen", { password });
      setBackupCodes(data.backup_codes || []);
      setTwoFAStep("show-backup");
      setPassword("");
      toast("success", "קודי גיבוי חדשים נוצרו");
    } catch (err: any) {
      setError(err.response?.data?.detail || "סיסמה שגויה");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Sessions ──
  const handleRevokeSession = async (sessionId: string) => {
    try {
      await api.delete(`/auth/sessions/${sessionId}`);
      toast("success", "ההתחברות נותקה");
      loadSessions();
    } catch {
      toast("error", "שגיאה בניתוק ההתחברות");
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    toast("success", "קודי הגיבוי הועתקו");
  };

  const closeDialog = () => {
    setTwoFAStep("idle");
    setVerifyCode("");
    setPassword("");
    setError("");
    setQrCodeUrl("");
    setSecret("");
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString("he-IL", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return d; }
  };

  return (
    <div className="space-y-6">
      {/* ── 2FA Management ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            אימות דו-שלבי (2FA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {is2FAEnabled ? (
                <>
                  <ShieldCheck className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-400">אימות דו-שלבי מופעל</p>
                    <p className="text-xs text-muted-foreground">החשבון שלך מוגן עם אימות דו-שלבי</p>
                  </div>
                </>
              ) : (
                <>
                  <ShieldOff className="h-8 w-8 text-amber-500" />
                  <div>
                    <p className="font-medium text-amber-700 dark:text-amber-400">אימות דו-שלבי כבוי</p>
                    <p className="text-xs text-muted-foreground">מומלץ להפעיל אימות דו-שלבי להגנה נוספת</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {is2FAEnabled ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[44px]"
                    onClick={() => { setError(""); setPassword(""); setTwoFAStep("regenerate-confirm"); }}
                  >
                    <RefreshCw className="me-1 h-4 w-4" />
                    קודי גיבוי חדשים
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="min-h-[44px]"
                    onClick={() => { setError(""); setPassword(""); setTwoFAStep("disable-confirm"); }}
                  >
                    <ShieldOff className="me-1 h-4 w-4" />
                    ביטול 2FA
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="min-h-[44px]"
                  onClick={handleEnable2FA}
                  disabled={actionLoading}
                >
                  <ShieldCheck className="me-1 h-4 w-4" />
                  {actionLoading ? "..." : "הפעל אימות דו-שלבי"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Active Sessions ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            התחברויות פעילות
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={3} cols={3} />
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              אין נתוני התחברויות זמינים
            </p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                    session.is_current
                      ? "border-primary-500 bg-primary-500/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {session.device_info?.toLowerCase().includes("mobile") ? (
                      <Smartphone className="h-5 w-5 text-muted-foreground shrink-0" />
                    ) : (
                      <Monitor className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">
                          {session.device_info || "מכשיר לא ידוע"}
                        </p>
                        {session.is_current && (
                          <Badge className="bg-primary-500 text-white text-xs">
                            מכשיר נוכחי
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {session.ip_address} • פעיל לאחרונה: {formatDate(session.last_active)}
                      </p>
                    </div>
                  </div>
                  {!session.is_current && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-[44px] min-w-[44px] text-red-500 hover:text-red-700 shrink-0"
                      onClick={() => handleRevokeSession(session.id)}
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2FA Setup Dialog: QR Code ── */}
      <Dialog open={twoFAStep === "setup-qr"} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הפעלת אימות דו-שלבי</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              סרוק את קוד ה-QR עם אפליקציית האימות שלך (Google Authenticator, Authy וכד')
            </p>
            {qrCodeUrl && (
              <div className="flex justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUrl)}`}
                  alt="QR Code for 2FA"
                  className="w-48 h-48 border rounded-lg"
                />
              </div>
            )}
            {secret && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">או הזן ידנית:</p>
                <code className="block text-center text-sm bg-muted p-2 rounded font-mono select-all break-all">
                  {secret}
                </code>
              </div>
            )}
            <Button
              className="w-full min-h-[44px]"
              onClick={() => setTwoFAStep("verify-code")}
            >
              המשך לאימות
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 2FA Setup Dialog: Verify Code ── */}
      <Dialog open={twoFAStep === "verify-code"} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>אימות קוד</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              הזן את הקוד שמופיע באפליקציית האימות
            </p>
            <div className="space-y-2">
              <Label htmlFor="verify-2fa-code">קוד אימות</Label>
              <Input
                id="verify-2fa-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoFocus
                className="text-center text-2xl tracking-widest min-h-[44px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} className="min-h-[44px]">ביטול</Button>
            <Button onClick={handleVerify2FA} disabled={actionLoading} className="min-h-[44px]">
              {actionLoading ? "..." : "אמת והפעל"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Backup Codes Dialog ── */}
      <Dialog open={twoFAStep === "show-backup"} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              קודי גיבוי
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800">
              <AlertTriangle className="inline-block me-1 h-4 w-4" />
              שמור את הקודים האלו במקום בטוח! הם לא יוצגו שוב.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <code
                  key={i}
                  className="text-center text-sm bg-muted p-2 rounded font-mono select-all"
                >
                  {code}
                </code>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full min-h-[44px]"
              onClick={copyBackupCodes}
            >
              <Copy className="me-1 h-4 w-4" />
              העתק קודי גיבוי
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={closeDialog} className="min-h-[44px]">סיימתי</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Disable 2FA Confirm Dialog ── */}
      <Dialog open={twoFAStep === "disable-confirm"} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ביטול אימות דו-שלבי</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800">
              <AlertTriangle className="inline-block me-1 h-4 w-4" />
              ביטול אימות דו-שלבי יפחית את רמת האבטחה של החשבון
            </div>
            <div className="space-y-2">
              <Label htmlFor="disable-2fa-password">סיסמה לאישור</Label>
              <Input
                id="disable-2fa-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="הזן את הסיסמה שלך"
                autoFocus
                className="min-h-[44px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} className="min-h-[44px]">ביטול</Button>
            <Button
              variant="destructive"
              onClick={handleDisable2FA}
              disabled={actionLoading}
              className="min-h-[44px]"
            >
              {actionLoading ? "..." : "בטל אימות דו-שלבי"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Regenerate Backup Codes Confirm Dialog ── */}
      <Dialog open={twoFAStep === "regenerate-confirm"} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>יצירת קודי גיבוי חדשים</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              פעולה זו תבטל את כל קודי הגיבוי הקודמים ותיצור קודים חדשים.
            </p>
            <div className="space-y-2">
              <Label htmlFor="regen-password">סיסמה לאישור</Label>
              <Input
                id="regen-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="הזן את הסיסמה שלך"
                autoFocus
                className="min-h-[44px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} className="min-h-[44px]">ביטול</Button>
            <Button
              onClick={handleRegenerateBackup}
              disabled={actionLoading}
              className="min-h-[44px]"
            >
              {actionLoading ? "..." : "צור קודים חדשים"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
