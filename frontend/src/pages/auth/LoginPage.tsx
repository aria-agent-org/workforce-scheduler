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
import { ArrowRight, Mail, CheckCircle, Key, Fingerprint } from "lucide-react";

type View = "login" | "2fa" | "forgot-password" | "forgot-success" | "magic-link-sent";

const supportsWebAuthn = typeof window !== "undefined" && !!window.PublicKeyCredential;

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

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

  // Passkey / Magic link loading
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");

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
      setError(t("twoFactor.invalidCode", "קוד האימות שגוי. נסה שוב."));
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
      setView("forgot-success");
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Passkey Login ──
  const handlePasskeyLogin = async () => {
    setError("");
    setPasskeyLoading(true);
    try {
      // Step 1: Get authentication options
      const { data: options } = await api.post("/auth/webauthn/login/begin", {
        email: email || undefined,
      });
      const sessionKey = options.session_key;

      // Step 2: Convert options for browser API
      const publicKeyOptions: PublicKeyCredentialRequestOptions = {
        challenge: base64urlToBuffer(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: options.userVerification || "preferred",
        allowCredentials: (options.allowCredentials || []).map((c: any) => ({
          id: base64urlToBuffer(c.id),
          type: c.type,
          transports: c.transports,
        })),
      };

      // Step 3: Call browser WebAuthn API
      const assertion = (await navigator.credentials.get({
        publicKey: publicKeyOptions,
      })) as PublicKeyCredential;

      if (!assertion) {
        setError(t("passkeyError", "הפעולה בוטלה"));
        return;
      }

      const response = assertion.response as AuthenticatorAssertionResponse;

      // Step 4: Send to server for verification
      const { data: loginResult } = await api.post(
        `/auth/webauthn/login/finish?session_key=${encodeURIComponent(sessionKey)}`,
        {
          id: assertion.id,
          rawId: bufferToBase64url(assertion.rawId),
          type: assertion.type,
          response: {
            authenticatorData: bufferToBase64url(response.authenticatorData),
            clientDataJSON: bufferToBase64url(response.clientDataJSON),
            signature: bufferToBase64url(response.signature),
            userHandle: response.userHandle
              ? bufferToBase64url(response.userHandle)
              : undefined,
          },
        }
      );

      setTokens(loginResult.access_token, loginResult.refresh_token);
      navigate("/dashboard");
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        setError(t("passkeyError", "הפעולה בוטלה או שלא נמצא מפתח אבטחה"));
      } else {
        setError(
          err?.response?.data?.detail ||
            t("passkeyError", "שגיאה בכניסה עם Passkey")
        );
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  // ── Magic Link Login ──
  const handleMagicLinkRequest = async () => {
    const targetEmail = email || magicLinkEmail;
    if (!targetEmail) {
      setError(t("magicLinkEmailRequired", "הזן כתובת אימייל קודם"));
      return;
    }
    setError("");
    setMagicLinkLoading(true);
    try {
      await api.post("/auth/magic-link/request", { email: targetEmail });
      setMagicLinkEmail(targetEmail);
      setView("magic-link-sent");
    } catch {
      setMagicLinkEmail(targetEmail);
      setView("magic-link-sent");
    } finally {
      setMagicLinkLoading(false);
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
    "2fa": t("twoFactor.title", "אימות דו-שלבי"),
    "forgot-password": t("forgotPassword", "שכחתי סיסמה"),
    "forgot-success": t("forgotPasswordSent", "נשלח בהצלחה"),
    "magic-link-sent": t("magicLinkSent", "קישור נשלח"),
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden" dir="rtl" style={{ background: "linear-gradient(135deg, hsl(221 83% 96%), hsl(250 60% 95%), hsl(210 40% 96%))" }}>
      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -end-40 h-80 w-80 rounded-full bg-primary-200/30 dark:bg-primary-800/10 blur-3xl animate-float" />
        <div className="absolute -bottom-40 -start-40 h-96 w-96 rounded-full bg-purple-200/20 dark:bg-purple-800/10 blur-3xl animate-float" style={{ animationDelay: "1.5s" }} />
      </div>
      <Card className="w-full max-w-md shadow-elevation-4 relative animate-scale-in border-0 bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center shadow-elevation-2">
            <span className="text-3xl">🎯</span>
          </div>
          <CardTitle className="text-2xl font-bold gradient-text">שבצק</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{viewTitle[view]}</p>
        </CardHeader>
        <CardContent>
          {/* ── Standard Login Form ── */}
          {view === "login" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
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

              {supportsWebAuthn && (
                <Button
                  variant="outline"
                  type="button"
                  className="w-full min-h-[44px]"
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  aria-label={t("loginWithPasskey")}
                >
                  <Fingerprint className="me-2 h-4 w-4" />
                  {passkeyLoading ? "..." : t("loginWithPasskey")}
                </Button>
              )}
              <Button
                variant="outline"
                type="button"
                className="w-full min-h-[44px]"
                onClick={handleMagicLinkRequest}
                disabled={magicLinkLoading}
                aria-label={t("loginWithMagicLink")}
              >
                <Mail className="me-2 h-4 w-4" />
                {magicLinkLoading ? "..." : t("loginWithMagicLink")}
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
                <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                {t("twoFactor.enterCode", "הזן את הקוד מאפליקציית האימות שלך")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="totp-code">{t("twoFactor.codeLabel", "קוד אימות")}</Label>
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
                  {t("twoFactor.useBackupCode", "ניתן גם להשתמש בקוד גיבוי")}
                </p>
              </div>
              <Button type="submit" className="w-full min-h-[44px]" disabled={is2FALoading}>
                {is2FALoading ? "..." : t("twoFactor.verify", "אימות")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full min-h-[44px]"
                onClick={handleBackToLogin}
              >
                <ArrowRight className="me-1 h-4 w-4" />
                {t("backToLogin", "חזרה להתחברות")}
              </Button>
            </form>
          )}

          {/* ── Forgot Password Form ── */}
          {view === "forgot-password" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              {error && (
                <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                <Mail className="inline-block me-1 h-4 w-4" />
                {t("forgotPasswordInstruction", "הזן את כתובת האימייל שלך ונשלח לך קישור לאיפוס סיסמה")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="forgot-email">{t("email")}</Label>
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
                {forgotLoading ? "..." : t("sendResetLink", "שלח קישור איפוס")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full min-h-[44px]"
                onClick={handleBackToLogin}
              >
                <ArrowRight className="me-1 h-4 w-4" />
                {t("backToLogin", "חזרה להתחברות")}
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
                {t("forgotPasswordSuccessMsg", {
                  defaultValue: `אם הכתובת ${forgotEmail} קיימת במערכת, נשלח אליה קישור לאיפוס סיסמה.`,
                  email: forgotEmail,
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("checkSpam", "בדוק גם בתיקיית הספאם. הקישור תקף ל-60 דקות.")}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[44px]"
                onClick={handleBackToLogin}
              >
                <ArrowRight className="me-1 h-4 w-4" />
                {t("backToLogin", "חזרה להתחברות")}
              </Button>
            </div>
          )}

          {/* ── Magic Link Sent ── */}
          {view === "magic-link-sent" && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <Mail className="h-16 w-16 text-blue-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("magicLinkSentMsg", {
                  defaultValue: `אם הכתובת ${magicLinkEmail} קיימת במערכת, נשלח אליה קישור כניסה.`,
                  email: magicLinkEmail,
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("magicLinkExpiry", "הקישור תקף ל-15 דקות. בדוק גם בתיקיית הספאם.")}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[44px]"
                onClick={handleBackToLogin}
              >
                <ArrowRight className="me-1 h-4 w-4" />
                {t("backToLogin", "חזרה להתחברות")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
