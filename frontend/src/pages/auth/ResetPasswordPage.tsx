import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { CheckCircle, ArrowRight, Eye, EyeOff } from "lucide-react";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }

    if (password !== confirmPassword) {
      setError("הסיסמאות אינן תואמות");
      return;
    }

    setLoading(true);
    try {
      await api.post(`/auth/reset-password/${token}`, {
        new_password: password,
      });
      setSuccess(true);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail === "Token expired") {
        setError("הקישור פג תוקף. בקש קישור איפוס חדש.");
      } else if (detail === "Token invalid") {
        setError("קישור לא תקין. בקש קישור איפוס חדש.");
      } else {
        setError(detail || "שגיאה באיפוס הסיסמה. נסה שוב.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary-500">שבצק</CardTitle>
          <p className="text-sm text-muted-foreground">
            {success ? "הסיסמה אופסה בהצלחה" : "איפוס סיסמה"}
          </p>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                הסיסמה שונתה בהצלחה. כעת ניתן להתחבר עם הסיסמה החדשה.
              </p>
              <Button
                className="w-full min-h-[44px]"
                onClick={() => navigate("/login")}
              >
                עבור להתחברות
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="new-password">סיסמה חדשה</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="לפחות 8 תווים"
                    required
                    minLength={8}
                    autoFocus
                    className="min-h-[44px] pe-10"
                  />
                  <button
                    type="button"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">אימות סיסמה</Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="הזן שוב את הסיסמה"
                  required
                  minLength={8}
                  className="min-h-[44px]"
                />
              </div>

              {password && confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-destructive">הסיסמאות אינן תואמות</p>
              )}

              <Button type="submit" className="w-full min-h-[44px]" disabled={loading}>
                {loading ? "..." : "אפס סיסמה"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full min-h-[44px]"
                onClick={() => navigate("/login")}
              >
                <ArrowRight className="me-1 h-4 w-4" />
                חזרה להתחברות
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
