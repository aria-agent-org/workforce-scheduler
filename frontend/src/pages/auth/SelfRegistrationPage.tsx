import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { UserPlus, CheckCircle, XCircle, Loader2, Eye, EyeOff, Building2 } from "lucide-react";
import api from "@/lib/api";
import { setTokens } from "@/lib/auth";

type Step = "form" | "checking" | "matched" | "no-match" | "success";

export default function SelfRegistrationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const tenantSlug = searchParams.get("tenant") || "";
  const prefilledCode = searchParams.get("code") || "";

  const [step, setStep] = useState<Step>("form");
  const [matchedEmployee, setMatchedEmployee] = useState<any>(null);

  // Form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState(prefilledCode);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!fullName.trim() || fullName.trim().length < 2) {
      errors.fullName = "שם מלא חייב להכיל לפחות 2 תווים";
    }
    if (!phone.trim() && !email.trim()) {
      errors.phone = "חובה להזין טלפון או אימייל לזיהוי";
    }
    if (!code.trim() || code.trim().length < 4) {
      errors.code = "קוד הרשמה נדרש";
    }
    if (!password || password.length < 6) {
      errors.password = "סיסמה חייבת להכיל לפחות 6 תווים";
    }
    if (password !== passwordConfirm) {
      errors.passwordConfirm = "הסיסמאות לא תואמות";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setStep("checking");
    try {
      const identifier = phone.trim() || email.trim();
      const endpoint = tenantSlug
        ? `/api/v1/${tenantSlug}/registration/register`
        : `/api/v1/registration/register`;

      const res = await api.post(endpoint, {
        identifier,
        code: code.trim(),
        password,
        full_name: fullName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });

      if (res.data.access_token) {
        setTokens(res.data.access_token, res.data.refresh_token);
      }

      setMatchedEmployee({
        name: res.data.employee_name,
        tenant: res.data.tenant_name,
      });
      setStep("success");
      toast("success", "ההרשמה הושלמה בהצלחה!");
      setTimeout(() => navigate("/dashboard"), 2500);
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      if (typeof detail === "string" && (detail.includes("נמצא") || detail.includes("match"))) {
        setStep("no-match");
      } else {
        setStep("form");
        toast("error", typeof detail === "string" ? detail : "שגיאה בהרשמה. בדוק את הפרטים ונסה שוב.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4" dir="rtl">
      <Card className="w-full max-w-md shadow-xl">
        {/* Checking */}
        {step === "checking" && (
          <CardContent className="p-8 text-center">
            <Loader2 className="h-12 w-12 mx-auto text-primary-500 animate-spin mb-4" />
            <p className="text-lg font-medium">מחפש את הפרטים שלך...</p>
            <p className="text-sm text-muted-foreground mt-1">בודק התאמה לעובד</p>
          </CardContent>
        )}

        {/* No match */}
        {step === "no-match" && (
          <CardContent className="p-8 text-center">
            <XCircle className="h-16 w-16 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">לא נמצאה התאמה</h2>
            <p className="text-muted-foreground mb-4">
              לא מצאנו עובד עם הפרטים שהוזנו. בדוק שהטלפון/אימייל והקוד נכונים.
            </p>
            <Button onClick={() => setStep("form")} className="min-h-[44px]">
              נסה שוב
            </Button>
          </CardContent>
        )}

        {/* Success */}
        {step === "success" && (
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">ההרשמה הושלמה!</h2>
            {matchedEmployee?.tenant && (
              <div className="flex items-center justify-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-blue-500" />
                <p className="text-sm font-medium text-blue-600">
                  הצטרפת ל-{matchedEmployee.tenant}
                </p>
              </div>
            )}
            {matchedEmployee?.name && (
              <p className="text-muted-foreground mb-2">
                ברוך הבא, {matchedEmployee.name}!
              </p>
            )}
            <p className="text-sm text-muted-foreground mb-6">מועבר לאפליקציה...</p>
            <Button onClick={() => navigate("/dashboard")} className="min-h-[44px]">
              כניסה למערכת
            </Button>
          </CardContent>
        )}

        {/* Form */}
        {(step === "form") && (
          <>
            <CardHeader className="text-center pb-2">
              <div className="h-16 w-16 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-3">
                <UserPlus className="h-8 w-8 text-primary-600" />
              </div>
              <CardTitle className="text-2xl">הרשמה עצמאית</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                הזן פרטים שתואמים לרשומה שלך במערכת
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>שם מלא <span className="text-red-500">*</span></Label>
                  <Input
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); if (formErrors.fullName) setFormErrors(prev => ({ ...prev, fullName: "" })); }}
                    placeholder="ישראל ישראלי"
                    className={`min-h-[44px] ${formErrors.fullName ? "border-red-500" : ""}`}
                    autoFocus
                  />
                  {formErrors.fullName && <p className="text-sm text-red-600">{formErrors.fullName}</p>}
                </div>

                <div className="space-y-2">
                  <Label>טלפון</Label>
                  <Input
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setFormErrors(prev => ({ ...prev, phone: "" })); }}
                    placeholder="0501234567"
                    dir="ltr"
                    className={`min-h-[44px] ${formErrors.phone ? "border-red-500" : ""}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label>אימייל</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFormErrors(prev => ({ ...prev, phone: "" })); }}
                    placeholder="example@company.com"
                    dir="ltr"
                    className="min-h-[44px]"
                  />
                  {formErrors.phone && <p className="text-sm text-red-600">{formErrors.phone}</p>}
                  <p className="text-xs text-muted-foreground">לפחות אחד מהשניים נדרש לזיהוי</p>
                </div>

                <div className="space-y-2">
                  <Label>קוד הרשמה <span className="text-red-500">*</span></Label>
                  <Input
                    value={code}
                    onChange={(e) => { setCode(e.target.value); setFormErrors(prev => ({ ...prev, code: "" })); }}
                    placeholder="123456"
                    dir="ltr"
                    inputMode="numeric"
                    className={`min-h-[44px] text-center text-xl tracking-widest ${formErrors.code ? "border-red-500" : ""}`}
                  />
                  {formErrors.code && <p className="text-sm text-red-600">{formErrors.code}</p>}
                </div>

                <div className="space-y-2">
                  <Label>סיסמה <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setFormErrors(prev => ({ ...prev, password: "" })); }}
                      placeholder="לפחות 6 תווים"
                      className={`min-h-[44px] pe-10 ${formErrors.password ? "border-red-500" : ""}`}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {formErrors.password && <p className="text-sm text-red-600">{formErrors.password}</p>}
                </div>

                <div className="space-y-2">
                  <Label>אימות סיסמה <span className="text-red-500">*</span></Label>
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={passwordConfirm}
                    onChange={(e) => { setPasswordConfirm(e.target.value); setFormErrors(prev => ({ ...prev, passwordConfirm: "" })); }}
                    placeholder="הזן שוב את הסיסמה"
                    className={`min-h-[44px] ${formErrors.passwordConfirm ? "border-red-500" : ""}`}
                  />
                  {formErrors.passwordConfirm && <p className="text-sm text-red-600">{formErrors.passwordConfirm}</p>}
                </div>

                <Button type="submit" className="w-full min-h-[48px] text-base" disabled={submitting}>
                  {submitting ? (
                    <><Loader2 className="me-2 h-4 w-4 animate-spin" />מבצע הרשמה...</>
                  ) : (
                    <><UserPlus className="me-2 h-4 w-4" />הרשמה</>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  כבר יש לך חשבון?{" "}
                  <button type="button" onClick={() => navigate("/login")} className="text-primary-600 hover:underline font-medium">
                    התחבר
                  </button>
                </p>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
