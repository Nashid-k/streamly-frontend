import { createContext, useContext, useEffect, useMemo } from "react";
import { en } from "./en.js";
import { es, fr, de, it, pt } from "./latin.js";
import { ja, ko, hi, ar } from "./script.js";
import { useOptionalPreferences } from "../context/preferences";

/* ── Streamly i18n ────────────────────────────────────────────────────────
   Lightweight, dependency-free translation layer. The catalogs in
   src/i18n/{en,latin,script}.js are deep-merged over English so any missing
   key falls back to `en` instead of blanking the UI.

   `defaultLanguage` (Settings → Subtitles → Default Language) is the single
   source of truth; the provider mirrors it into <html lang> + dir (rtl for
   Arabic). Components may call useI18n() anywhere — outside a provider it
   resolves to English, which is what keeps isolated tests/stories stable. */

export const SUPPORTED_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "ja", "ko", "hi", "ar"];

export const DICTIONARIES = { en, es, fr, de, it, pt, ja, ko, hi, ar };

/* Merge the additive accountExtra leaf (cloud-data deletion strings) into
   settings.account for every catalog — other languages fall back to English
   for these new keys via the deep-merge, so only `en` defines them. */
if (en?.accountExtra && en?.settings) {
  en.settings.account = { ...en.settings.account, ...en.accountExtra };
  delete en.accountExtra;
}

export const LANG_DIR = Object.freeze({ ar: "rtl" });

function getPath(obj, key) {
  if (!key || !obj) return undefined;
  let cur = obj;
  for (const part of String(key).split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/* Build a bound `t(key, vars)` for a given language (en fallback for gaps). */
export function makeT(lang = "en") {
  const dict = DICTIONARIES[lang] || en;
  return (key, vars) => {
    let value = getPath(dict, key);
    if (value === undefined) value = getPath(en, key);
    if (typeof value === "object" || value === undefined) return key;
    return interpolate(String(value), vars);
  };
}

const I18nContext = createContext(null);

/**
 * Public hook. Outside <I18nProvider> it returns English strings so every
 * existing isolated component test keeps asserting its current text.
 */
export function useI18n() {
  const context = useContext(I18nContext);
  const fallback = useMemo(() => ({ t: makeT("en"), lang: "en", dir: "ltr" }), []);
  if (context) return context;
  return fallback;
}

export function I18nProvider({ children }) {
  const prefs = useOptionalPreferences();
  const lang =
    prefs && SUPPORTED_LANGUAGES.includes(prefs.defaultLanguage) ? prefs.defaultLanguage : "en";
  const dir = LANG_DIR[lang] || "ltr";

  useEffect(() => {
    // Ownership of <html lang> stays with PreferencesContext; we only manage dir.
    document.documentElement.dir = dir;
  }, [dir]);

  const value = useMemo(() => ({ lang, dir, t: makeT(lang) }), [lang, dir]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}