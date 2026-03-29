import * as Tooltip from "@radix-ui/react-tooltip";
import { HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  content: { he: string; en: string } | string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = { sm: "max-w-xs", md: "max-w-sm", lg: "max-w-md" };

export default function HelpTooltip({ content, size = "md" }: Props) {
  const { i18n } = useTranslation();
  const text =
    typeof content === "string"
      ? content
      : content[i18n.language as "he" | "en"] || content.he;

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className={`${sizeMap[size]} rounded-md bg-foreground px-3 py-2 text-sm text-background shadow-lg`}
            sideOffset={5}
          >
            {text}
            <Tooltip.Arrow className="fill-foreground" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
