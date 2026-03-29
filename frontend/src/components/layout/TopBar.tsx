import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "../ui/button";
import { LogOut, Globe } from "lucide-react";

export default function TopBar() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();

  const toggleLanguage = () => {
    const newLang = i18n.language === "he" ? "en" : "he";
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === "he" ? "rtl" : "ltr";
    document.documentElement.lang = newLang;
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="text-sm text-muted-foreground">
        {user?.email && <span>{user.email}</span>}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={toggleLanguage}>
          <Globe className="me-1 h-4 w-4" />
          {i18n.language === "he" ? "EN" : "עב"}
        </Button>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="me-1 h-4 w-4" />
          {t("logout")}
        </Button>
      </div>
    </header>
  );
}
