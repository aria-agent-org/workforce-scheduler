import { useState, useRef, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { ArrowRight, Mail, CheckCircle } from "lucide-react";

type View = "login" | "2fa" | "forgot-password" | "forgot-success";

export default function LoginPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setUser = useAuthStore((s) => s.setUser);

  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // 2FA state
  const [tempToken, setTempToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [is2FALoading, setIs2FALoading] = useState(false);
  const totpRef = useRef<HTMLInputElement>(null);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const response = await login(email, password);
      if (response?.requires_2fa) {
        setView("2fa");
        setTempToken(response.temp_token);
        setTimeout(() => totpRef.current?.focus(), 100);
      } else {
        navigate("/dashboard");
      }
    } catch {
      setError(t("invalidCredentials"));
    }
  };

  const handle2FASubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIs2FALoading(true);
    try {
      const { data } = await api.post("/auth/2fa/login-verify", {
        temp_token: tempToken,
        code: totpCode,
      });
      setTokens(data.access_token, data.refresh_token);
      if (setUser) setUser(data.user);
      navigate("/dashboard");
    } catch {
      setError("קוד האימות שגוי. נסה שוב.");
      setTotpCode("");
      totpRef.current?.focus();
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setForgotLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: forgotEmail });
      setView("forgot-success");
    } catch {
      // Show success anyway to prevent email enumeration
      setView("forgot-success");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setView("login");
    setTempToken("");
    setTotpCode("");
    setForgotEmail("");
    setError("");
  };

  const viewTitle: Record<View, string> = {
    login: t("loginTitle"),
    "2fa": "אימות דו-שלבי",
    "forgot-password": "שכחתי סיסמה",
    "forgot-success": "נשלח בהצלחה",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary-500">שבצק</CardTitle>
          <p className="text-sm text-muted-foreground">{viewTitle[view]}</p>
        </CardHeader>
        <CardContent>
          {/* ── Standard Login Form ── */}
          {view === "login" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  autoFocus
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="min-h-[44px]"
                />
              </div>
              <Button type="submit" className="w-full min-h-[44px]" disabled={isLoading}>
                {isLoading ? "..." : t("loginButton")}
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{t("or")}</span>
                </div>
              </div>

              <Button variant="outline" type="button" className="w-full min-h-[44px]" disabled>
                {t("loginWithPasskey")}
              </Button>
              <Button variant="outline" type="button" className="w-full min-h-[44px]" disabled>
                {t("loginWithMagicLink")}
              </Button>
              <Button variant="outline" type="button" className="w-full min-h-[44px]" disabled>
                {t("loginWithGoogle")}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-primary-500 hover:underline"
                  onClick={() => {
                    setForgotEmail(email);
                    setError("");
                    setView("forgot-password");
                  }}
                >
                  {t("forgotPassword")}
                </button>
              </div>
            </form>
          )}

          {/* ── 2FA Verification Form ── */}
          {view === "2fa" && (
            <form onSubmit={handle2FASubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                הזן את הקוד מאפליקציית האימות שלך
              </div>
              <div className="space-y-2">
                <Label htmlFor="totp-code">קוד אימות</Label>
                <Input
                  ref={totpRef}
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9a-fA-F]*"
                  maxLength={8}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="000000"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  className="text-center text-2xl tracking-widest min-h-[44px]"
                />
                <p className="text-xs text-muted-foreground">
                  ניתן גם להשתמש בקוד גיבוי
                </p>
              </div>
              <Button type="submit" className="w-full min-h-[44px]" disabled={is2FALoading}>
                {is2FALoading ? "..." : "אימות"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full min-h-[44px]"
                onClick={handleBackToLogin}
              >
                <ArrowRight className="me-1 h-4 w-4" />
                חזרה להתחברות
              </Button>
            </form>
          )}

          {/* ── Forgot Password Form ── */}
          {view === "forgot-password" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                <Mail className="inline-block me-1 h-4 w-4" />
                הזן את כתובת האימייל שלך ונשלח לך קישור לאיפוס סיסמה
              </div>
              <div className="space-y-2">
                <Label htmlFor="forgot-email">אימייל</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  autoFocus
                  className="min-h-[44px]"
                />
              </div>
              <Button type="submit" className="w-full min-h-[44px]" disabled={forgotLoading}>
                {forgotLoading ? "..." : "שלח קישור איפוס"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full min-h-[44px]"
                onClick={handleBackToLogin}
              >
                <ArrowRight className="me-1 h-4 w-4" />
                חזרה להתחברות
              </Button>
            </form>
          )}

          {/* ── Forgot Password Success ── */}
          {view === "forgot-success" && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                אם הכתובת <strong>{forgotEmail}</strong> קיימת במערכת, נשלח אליה קישור לאיפוס סיסמה.
              </p>
              <p className="text-xs text-muted-foreground">
                בדוק גם בתיקיית הספאם. הקישור תקף ל-60 דקות.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[44px]"
                onClick={handleBackToLogin}
              >
                <ArrowRight className="me-1 h-4 w-4" />
                חזרה להתחברות
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
