import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import heCommon from "./locales/he/common.json";
import heAuth from "./locales/he/auth.json";
import heDashboard from "./locales/he/dashboard.json";
import heEmployees from "./locales/he/employees.json";
import heScheduling from "./locales/he/scheduling.json";

import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enDashboard from "./locales/en/dashboard.json";
import enEmployees from "./locales/en/employees.json";
import enScheduling from "./locales/en/scheduling.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      he: {
        common: heCommon,
        auth: heAuth,
        dashboard: heDashboard,
        employees: heEmployees,
        scheduling: heScheduling,
      },
      en: {
        common: enCommon,
        auth: enAuth,
        dashboard: enDashboard,
        employees: enEmployees,
        scheduling: enScheduling,
      },
    },
    defaultNS: "common",
    fallbackLng: "he",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
