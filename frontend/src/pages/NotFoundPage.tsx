import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center" dir="rtl">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary-500">404</h1>
        <p className="mt-4 text-xl text-muted-foreground">הדף לא נמצא</p>
        <Link
          to="/dashboard"
          className="mt-6 inline-block rounded-md bg-primary-500 px-6 py-2 text-white hover:bg-primary-600"
        >
          {t("nav.dashboard")}
        </Link>
      </div>
    </div>
  );
}
