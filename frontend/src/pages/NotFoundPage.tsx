import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center p-4" dir="rtl">
      <div className="text-center animate-scale-in">
        <div className="mx-auto mb-6 h-24 w-24 rounded-3xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shadow-elevation-2 animate-float">
          <span className="text-5xl">🔍</span>
        </div>
        <h1 className="text-7xl font-bold gradient-text mb-2">404</h1>
        <p className="text-xl text-muted-foreground mb-1">הדף לא נמצא</p>
        <p className="text-sm text-muted-foreground/70 mb-8 max-w-xs mx-auto">
          העמוד שחיפשת לא קיים או שהועבר למקום אחר
        </p>
        <Button asChild size="lg" className="gap-2">
          <Link to="/dashboard">
            <Home className="h-4 w-4" />
            {t("nav.dashboard")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
