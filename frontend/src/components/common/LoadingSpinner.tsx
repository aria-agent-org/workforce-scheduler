import { useTranslation } from "react-i18next";

export default function LoadingSpinner() {
  const { t } = useTranslation();

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="relative">
          <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-primary-100 dark:border-primary-900/30 border-t-primary-500" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg">🎯</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground font-medium animate-pulse-subtle">{t("loading")}</p>
      </div>
    </div>
  );
}
