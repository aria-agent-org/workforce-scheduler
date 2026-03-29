import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showInstallPrompt, isInstalled } from "@/lib/pwa";

export default function InstallBanner() {
  const { i18n } = useTranslation();
  const lang = i18n.language as "he" | "en";
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isInstalled()) return;
    if (localStorage.getItem("shavtzak-install-dismissed")) return;

    const handler = () => setShow(true);
    document.addEventListener("shavtzak:install-prompt", handler);
    return () => document.removeEventListener("shavtzak:install-prompt", handler);
  }, []);

  const handleInstall = async () => {
    const accepted = await showInstallPrompt();
    if (accepted) {
      setShow(false);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    localStorage.setItem("shavtzak-install-dismissed", "1");
  };

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 inset-x-4 z-50 animate-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 rounded-2xl bg-primary-500 text-white p-4 shadow-2xl">
        <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-xl bg-white/20">
          <Download className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm">
            {lang === "he" ? "התקן את שבצק" : "Install Shavtzak"}
          </h3>
          <p className="text-xs text-white/80 mt-0.5">
            {lang === "he"
              ? "גישה מהירה ישירות ממסך הבית"
              : "Quick access directly from your home screen"}
          </p>
        </div>
        <Button
          onClick={handleInstall}
          className="bg-white text-primary-600 hover:bg-white/90 text-sm font-bold px-4"
          size="sm"
        >
          {lang === "he" ? "התקן" : "Install"}
        </Button>
        <button onClick={handleDismiss} className="text-white/60 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
