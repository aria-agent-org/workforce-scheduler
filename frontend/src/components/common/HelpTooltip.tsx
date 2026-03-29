import { useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { HelpCircle, X, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  topicKey?: string;
  content: { he: string; en: string } | string;
  title?: { he: string; en: string } | string;
  examples?: Array<{ he: string; en: string } | string>;
  videoUrl?: string;
  size?: "sm" | "md" | "lg";
  mode?: "tooltip" | "popover";
}

const sizeMap = { sm: "max-w-xs", md: "max-w-sm", lg: "max-w-lg" };

export default function HelpTooltip({
  content,
  title,
  examples,
  videoUrl,
  size = "md",
  mode = "tooltip",
}: Props) {
  const { i18n } = useTranslation();
  const lang = i18n.language as "he" | "en";
  const [open, setOpen] = useState(false);

  const getText = (v: { he: string; en: string } | string) =>
    typeof v === "string" ? v : v[lang] || v.he;

  const text = getText(content);
  const titleText = title ? getText(title) : undefined;

  if (mode === "popover") {
    return (
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center text-muted-foreground hover:text-primary-500 transition-colors"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className={`absolute z-50 top-full mt-2 start-0 ${sizeMap[size]} rounded-lg border bg-card shadow-xl p-4 animate-in fade-in-0 zoom-in-95`}>
              <div className="flex items-start justify-between mb-2">
                {titleText && <h4 className="font-bold text-sm">{titleText}</h4>}
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="text-sm text-muted-foreground whitespace-pre-line">{text}</div>
              {examples && examples.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{lang === "he" ? "דוגמאות:" : "Examples:"}</p>
                  {examples.map((ex, i) => (
                    <div key={i} className="rounded bg-muted/50 px-2 py-1 text-xs font-mono">{getText(ex)}</div>
                  ))}
                </div>
              )}
              {videoUrl && (
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-primary-500 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> {lang === "he" ? "צפה בסרטון" : "Watch video"}
                </a>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center text-muted-foreground hover:text-primary-500 transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className={`${sizeMap[size]} rounded-lg bg-foreground px-3 py-2 text-sm text-background shadow-lg z-50`}
            sideOffset={5}
          >
            {titleText && <div className="font-bold mb-1">{titleText}</div>}
            <div className="whitespace-pre-line">{text}</div>
            {examples && examples.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {examples.map((ex, i) => (
                  <div key={i} className="text-xs opacity-80">• {getText(ex)}</div>
                ))}
              </div>
            )}
            <Tooltip.Arrow className="fill-foreground" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
