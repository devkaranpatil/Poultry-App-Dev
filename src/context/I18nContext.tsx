import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Locale, messages } from "@/i18n/messages";

const STORAGE_KEY = "greenhouse.locale";

interface I18nContextType {
  language: Locale;
  setLanguage: (language: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

/** Translates outside React state, e.g. for output that must stay in one locale. */
export function translate(language: Locale, key: string, vars?: Record<string, string | number>): string {
  const dict = messages[language] ?? messages.en;
  const template = dict[key] ?? messages.en[key] ?? key;

  if (!vars) return template;

  return Object.entries(vars).reduce(
    (acc, [varKey, value]) => acc.replace(new RegExp(`\\{${varKey}\\}`, "g"), String(value)),
    template
  );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "en";
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage blocked (private mode, site data off): start in English.
    }
    return stored === "hi" || stored === "mr" || stored === "en" ? stored : "en";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // The choice then lasts for this visit only.
    }
  }, [language]);


  const value = useMemo<I18nContextType>(
    () => ({
      language,
      setLanguage: setLanguageState,
      t: (key, vars) => translate(language, key, vars),
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
