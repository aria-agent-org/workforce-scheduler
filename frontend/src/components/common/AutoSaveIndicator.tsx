import { Loader2, Check, AlertCircle } from "lucide-react";

interface AutoSaveIndicatorProps {
  saving: boolean;
  saved: boolean;
  error?: boolean;
}

export default function AutoSaveIndicator({ saving, saved, error }: AutoSaveIndicatorProps) {
  if (!saving && !saved && !error) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs animate-in fade-in duration-300">
      {saving && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">שומר...</span>
        </>
      )}
      {saved && !saving && (
        <>
          <Check className="h-3 w-3 text-green-500" />
          <span className="text-green-600 dark:text-green-400">נשמר ✓</span>
        </>
      )}
      {error && !saving && (
        <>
          <AlertCircle className="h-3 w-3 text-red-500" />
          <span className="text-red-500">שגיאה בשמירה</span>
        </>
      )}
    </div>
  );
}
