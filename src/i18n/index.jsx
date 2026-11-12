import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { en } from "./en.js";
import { useOptionalPreferences } from "../context/preferences";
import { SUPPORTED_LANGUAGE_CODES } from "../constants/settings";
import { logError } from "../utils/debugLogger";

/* ── Streamly i18n ────────────────────────────────────────────────────────
   Lightweight, dependency-free translation layer. The catalogs in
   src/i18n/{en,latin,script}.js are deep-merged over English so any missing key
   falls back to `en` instead of blanking the UI. `defaultLanguage` (Settings →
   Subtitles) is the single source of truth; the provider mirrors it into
   <html lang> + dir (rtl for Arabic). Outside a provider useI18n() resolves to
   English, which is what keeps isolated tests/stories stable.

   Only English ships in the entry chunk. The other nine catalogs are one
   dynamic import away per script family (latin / script) and load the first
   time that language is selected — until they arrive `t()` serves English
   instead of blanks, so a slow chunk can never break the UI. */

const SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGE_CODES;

const LATIN_CODES = new Set(["es", "fr", "de", "it", "pt"]);
const SCRIPT_CODES = new Set(["ja", "ko", "hi", "ar"]);

const DICTIONARIES = { en };

const CATALOG_LOADERS = {
  latin: () => import("./latin.js"),
  script: () => import("./script.js"),
};

/* Merge the additive accountExtra leaf (cloud-data deletion strings) into
   settings.account for every catalog; other languages fall back to English for
   these new keys via the deep-merge, so only `en` defines them. */
if (en?.accountExtra && en?.settings) {
  en.settings.account = { ...en.settings.account, ...en.accountExtra };
  delete en.accountExtra;
}

const LANG_DIR = Object.freeze({ ar: "rtl" });

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
function makeT(lang = "en") {
  const dict = DICTIONARIES[lang] || en;
  return (key, vars) => {
    let value = getPath(dict, key);
    if (value === undefined) value = getPath(en, key);
    if (typeof value === "object" || value === undefined) return key;
    return interpolate(String(value), vars);
  };
}

function catalogBucketFor(lang) {
  if (LATIN_CODES.has(lang)) return "latin";
  if (SCRIPT_CODES.has(lang)) return "script";
  return null;
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
  // Bumps when a lazily imported catalog lands, so `t()` is rebuilt against it.
  const [catalogVersion, setCatalogVersion] = useState(0);

  useEffect(() => {
    if (DICTIONARIES[lang]) return undefined;
    const bucket = catalogBucketFor(lang);
    const load = bucket ? CATALOG_LOADERS[bucket] : null;
    if (!load) return undefined;

    let cancelled = false;
    load()
      .then((mod) => {
        for (const [code, catalog] of Object.entries(mod)) {
          if (SUPPORTED_LANGUAGES.includes(code)) DICTIONARIES[code] = catalog;
        }
        if (!cancelled) setCatalogVersion((version) => version + 1);
      })
      .catch((error) => {
        logError("i18n", `Could not load the "${bucket}" language catalog.`, error);
      });

    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => {
    // Ownership of <html lang> stays with PreferencesContext; we only manage dir.
    document.documentElement.dir = dir;
  }, [dir]);

  const value = useMemo(
    () => ({ lang, dir, t: makeT(lang) }),
    // catalogVersion is a dependency so a freshly imported catalog is picked up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, dir, catalogVersion],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
