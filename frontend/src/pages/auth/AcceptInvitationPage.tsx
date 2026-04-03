import { useState, useEffect, type FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { UserPlus, CheckCircle, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import api from "@/lib/api";

type Step = "loading" | "invalid" | "form" | "success";

export default function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("loading");
  const [invitationData, setInvitationData] = useState<any>(null);
  const [error, setError] = useState("");

  // Form
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) {
      setStep("invalid");
      setError("קישור הזמנה לא תקין");
      return;
    }

    (async () => {
      try {
        const res = await api.get(`/api/v1/invitations/validate/${token}`);
        setInvitationData(res.data);
        setFullName(res.data.employee_name || res.data.full_name || "");
        setPhone(res.data.phone || "");
        setStep("form");
      } catch (e: any) {
        const status = e.response?.status;
        if (status === 404 || status === 410) {
          setError("קישור ההזמנה לא נמצא או שפג תוקפו");
        } else if (status === 409) {
          setError("ההזמנה כבר אושרה. ניתן להתחבר למערכת.");
        } else {
          setError("שגיאה בבדיקת ההזמנה. נסה שוב מאוחר יותר.");
        }
        setStep("invalid");
      }
    })();
  }, [token]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!fullName.trim() || fullName.trim().length < 2) {
      errors.fullName = "שם מלא חייב להכיל לפחות 2 תווים";
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
    try {
      await api.post(`/api/v1/invitations/accept/${token}`, {
        full_name: fullName.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      setStep("success");
      toast("success", "ההרשמה הושלמה בהצלחה!");
      setTimeout(() => navigate("/login"), 3000);
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      toast("error", typeof detail === "string" ? detail : "שגיאה בהרשמה. נסה שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-50 dark:from-gray-900 dark:to-gray-800 p-4" dir="rtl">
      <Card className="w-full max-w-md shadow-xl">
        {/* Loading */}
        {step === "loading" && (
          <CardContent className="p-8 text-center">
            <Loader2 className="h-12 w-12 mx-auto text-primary-500 animate-spin mb-4" />
            <p className="text-lg font-medium">בודק הזמנה...</p>
            <p className="text-sm text-muted-foreground mt-1">רגע אחד בבקשה</p>
          </CardContent>
        )}

        {/* Invalid */}
        {step === "invalid" && (
          <CardContent className="p-8 text-center">
            <XCircle className="h-16 w-16 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">הזמנה לא תקינה</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => navigate("/login")} className="min-h-[44px]">
              עבור לדף התחברות
            </Button>
          </CardContent>
        )}

        {/* Form */}
        {step === "form" && (
          <>
            <CardHeader className="text-center pb-2">
              <div className="h-16 w-16 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-3">
                <UserPlus className="h-8 w-8 text-primary-600" />
              </div>
              <CardTitle className="text-2xl">הצטרפות למערכת</CardTitle>
              {invitationData?.tenant_name && (
                <p className="text-sm text-muted-foreground mt-1">
                  הוזמנת להצטרף ל-<span className="font-semibold">{invitationData.tenant_name}</span>
                </p>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>שם מלא <span className="text-red-500">*</span></Label>
                  <Input
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); if (formErrors.fullName) setFormErrors(prev => ({ ...prev, fullName: "" })); }}
                    placeholder="ישראל ישראלי"
                    className={`min-h-[44px] ${formErrors.fullName ? "border-red-500 ring-1 ring-red-500" : ""}`}
                    autoFocus
                  />
                  {formErrors.fullName && <p className="text-sm text-red-600">{formErrors.fullName}</p>}
                </div>

                <div className="space-y-2">
                  <Label>סיסמה <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (formErrors.password) setFormErrors(prev => ({ ...prev, password: "" })); }}
                      placeholder="לפחות 6 תווים"
                      className={`min-h-[44px] pe-10 ${formErrors.password ? "border-red-500 ring-1 ring-red-500" : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
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
                    onChange={(e) => { setPasswordConfirm(e.target.value); if (formErrors.passwordConfirm) setFormErrors(prev => ({ ...prev, passwordConfirm: "" })); }}
                    placeholder="הזן שוב את הסיסמה"
                    className={`min-h-[44px] ${formErrors.passwordConfirm ? "border-red-500 ring-1 ring-red-500" : ""}`}
                  />
                  {formErrors.passwordConfirm && <p className="text-sm text-red-600">{formErrors.passwordConfirm}</p>}
                </div>

                <div className="space-y-2">
                  <Label>טלפון <span className="text-muted-foreground text-xs">(אופציונלי)</span></Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0501234567"
                    dir="ltr"
                    className="min-h-[44px]"
                  />
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

        {/* Success */}
        {step === "success" && (
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">ההרשמה הושלמה!</h2>
            <p className="text-muted-foreground mb-2">ברוכים הבאים למערכת.</p>
            <p className="text-sm text-muted-foreground mb-6">מועבר לדף ההתחברות...</p>
            <Button onClick={() => navigate("/login")} className="min-h-[44px]">
              עבור להתחברות
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
