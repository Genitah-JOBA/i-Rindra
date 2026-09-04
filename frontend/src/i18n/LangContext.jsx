// src/i18n/LangContext.jsx — contexte de langue (persistant, sans dépendance externe).
import { createContext, useContext, useState, useCallback } from "react";
import { translations } from "./translations";

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem("lang") || "fr";
    } catch {
      return "fr";
    }
  });

  const setLang = useCallback((l) => {
    setLangState(l);
    try {
      localStorage.setItem("lang", l);
    } catch {
      /* ignore */
    }
  }, []);

  // t("nav.projets") -> texte traduit (retombe sur le FR puis sur la clé)
  const t = useCallback(
    (key) =>
      (translations[lang] && translations[lang][key]) ||
      translations.fr[key] ||
      key,
    [lang],
  );

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang doit être utilisé dans un LangProvider");
  return ctx;
};
