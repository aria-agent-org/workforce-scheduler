import { useTranslation } from "react-i18next";

interface Props {
  name: Record<string, string> | null | undefined;
  className?: string;
  showBoth?: boolean;
}

/**
 * Shows role name in both Hebrew and English: "נהג (Driver)"
 * If showBoth is false, shows only current language.
 */
export default function BilingualRoleName({ name, className = "", showBoth = true }: Props) {
  const { i18n } = useTranslation();
  const lang = i18n.language as "he" | "en";

  if (!name) return <span className={className}>—</span>;

  const he = name.he || "";
  const en = name.en || "";

  if (!showBoth || !he || !en) {
    return <span className={className}>{name[lang] || he || en || "—"}</span>;
  }

  if (lang === "he") {
    return <span className={className}>{he} <span className="text-muted-foreground text-xs">({en})</span></span>;
  }
  return <span className={className}>{en} <span className="text-muted-foreground text-xs">({he})</span></span>;
}
