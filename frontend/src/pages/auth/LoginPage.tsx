import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { setTokens } from "@/lib/auth";

export default function LoginPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [is2FALoading, setIs2FALoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const response = await login(email, password);
      if (response?.requires_2fa) {
        setRequires2FA(true);
        setTempToken(response.temp_token);
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
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleBack = () => {
    setRequires2FA(false);
    setTempToken("");
    setTotpCode("");
    setError("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary-500">שבצק</CardTitle>
          <p className="text-sm text-muted-foreground">
            {requires2FA ? "אימות דו-שלבי" : t("loginTitle")}
          </p>
        </CardHeader>
        <CardContent>
          {!requires2FA ? (
            /* ── Standard Login Form ── */
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
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
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

              <Button variant="outline" type="button" className="w-full" disabled>
                {t("loginWithPasskey")}
              </Button>
              <Button variant="outline" type="button" className="w-full" disabled>
                {t("loginWithMagicLink")}
              </Button>
              <Button variant="outline" type="button" className="w-full" disabled>
                {t("loginWithGoogle")}
              </Button>

              <div className="text-center">
                <button type="button" className="text-sm text-primary-500 hover:underline">
                  {t("forgotPassword")}
                </button>
              </div>
            </form>
          ) : (
            /* ── 2FA Verification Form ── */
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
                  className="text-center text-2xl tracking-widest"
                />
                <p className="text-xs text-muted-foreground">
                  ניתן גם להשתמש בקוד גיבוי
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={is2FALoading}>
                {is2FALoading ? "..." : "אימות"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleBack}
              >
                חזרה להתחברות
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
