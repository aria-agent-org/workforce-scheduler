import { useTranslation } from "react-i18next";
import type { LocalizedText as LT } from "@/types";

interface Props {
  text: LT | string | null | undefined;
  className?: string;
}

export default function LocalizedText({ text, className }: Props) {
  const { i18n } = useTranslation();

  if (!text) return null;
  if (typeof text === "string") return <span className={className}>{text}</span>;

  const lang = i18n.language as keyof LT;
  const display = text[lang] || text.he || text.en || "";

  return <span className={className}>{display}</span>;
}
