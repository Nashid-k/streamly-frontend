import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "../i18n/en.js";
import * as latin from "../i18n/latin.js";
import * as script from "../i18n/script.js";

/* Guard rails for the catalogue set. The translated files are merged over
   English at runtime, so a missing key degrades to English (acceptable) while a
   key English does not know about is dead weight — and a key the app spells
   wrong renders its own name. Both classes had slipped through, and so had nine
   stale translations of the language row that still promised subtitles only. */

const DICTIONARIES = {
  es: latin.es,
  fr: latin.fr,
  de: latin.de,
  it: latin.it,
  pt: latin.pt,
  ja: script.ja,
  ko: script.ko,
  hi: script.hi,
  ar: script.ar,
};

// The runtime merge `i18n/index.jsx` performs before `t()` reads the tree.
function englishTree() {
  const tree = { ...en };
  if (tree.accountExtra && tree.settings) {
    tree.settings = { ...tree.settings, account: { ...tree.settings.account, ...tree.accountExtra } };
    delete tree.accountExtra;
  }
  return tree;
}

function flatten(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const EN = flatten(englishTree());

describe("catalogue key parity", () => {
  it("no translated catalogue invents keys English does not define", () => {
    const invented = {};
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      const extra = [...flatten(dict).keys()].filter((key) => !EN.has(key));
      if (extra.length) invented[lang] = extra;
    }
    expect(invented).toEqual({});
  });

  it("every translated leaf is a non-empty string", () => {
    const blank = {};
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      const bad = [...flatten(dict).entries()]
        .filter(([, value]) => typeof value !== "string" || value.trim() === "")
        .map(([key]) => key);
      if (bad.length) blank[lang] = bad;
    }
    expect(blank).toEqual({});
  });

  it("namespaces already translated stay complete", () => {
    // These were fully translated before the newer feature batches landed; a
    // new English key in them must come with nine translations, not a silent
    // English fallback.
    const FULL = new Set(["nav", "footer", "details", "watchlist", "history", "genre", "category", "player"]);
    const gaps = {};
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      const keys = flatten(dict);
      const missing = [...EN.keys()].filter(
        (key) => FULL.has(key.split(".")[0]) && !keys.has(key),
      );
      if (missing.length) gaps[lang] = missing;
    }
    expect(gaps).toEqual({});
  });

  it("every t() key spelled in src exists in the English catalogue", () => {
    // Catches the class of bug where a component renders "settings.foo.bar"
    // because the key it calls does not exist.
    const missing = new Map();
    for (const file of walk(path.join(process.cwd(), "src"))) {
      if (file.includes(`${path.sep}i18n${path.sep}`)) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(/\bt\(\s*(["'])([^"'`$]+)\1/g)) {
        const key = match[2];
        if (!EN.has(key) && !missing.has(key)) {
          missing.set(key, path.relative(process.cwd(), file));
        }
      }
    }
    expect(Object.fromEntries(missing)).toEqual({});
  });
});

describe("language row copy", () => {
  const ROW = [
    "settings.playback.defaultLanguage",
    "settings.playback.defaultLanguageDesc",
    "settings.playback.defaultLangCurrent",
    "settings.playback.defaultLangAria",
    "settings.toasts.defaultLanguage",
    "settings.toasts.defaultLanguageSet",
  ];

  // The shipped "subtitle language only" copy this row used to carry. Reverting
  // any catalogue to these strings should fail, because the row also changes
  // the interface and the language titles are fetched in.
  const LEGACY = {
    es: [
      "Idioma Predeterminado",
      "Elige el idioma de subtítulos a seleccionar.",
      "Los subtítulos se seleccionarán en {lang} si está disponible.",
    ],
    fr: [
      "Langue par Défaut",
      "Choisissez la langue des sous-titres auto-sélectionnés.",
      "Les sous-titres se sélectionneront en {lang} si disponibles.",
    ],
    de: [
      "Standardsprache",
      "Sprache der automatisch ausgewählten Untertitel.",
      "Untertitel werden in {lang} ausgewählt, sofern verfügbar.",
    ],
    it: [
      "Lingua Predefinita",
      "Scegli la lingua dei sottotitoli da selezionare.",
      "I sottotitoli si selezioneranno in {lang} quando disponibili.",
    ],
    pt: [
      "Idioma Padrão",
      "Escolha o idioma das legendas a selecionar.",
      "As legendas serão selecionadas em {lang} quando disponível.",
    ],
    ja: [
      "既定の言語",
      "自動選択する字幕の言語を選びます。",
      "利用可能な場合、字幕は{lang}で自動選択されます。",
    ],
    ko: [
      "기본 언어",
      "자동 선택할 자막 언어를 고릅니다.",
      "사용 가능할 때 자막이 {lang}(으)로 자동 선택됩니다.",
    ],
    hi: [
      "डिफ़ॉल्ट भाषा",
      "ऑटो-चयन के लिए सबटाइटल भाषा चुनें।",
      "उपलब्ध होने पर सबटाइटल {lang} में चुने जाएँगे।",
    ],
    ar: [
      "اللغة الافتراضية",
      "اختر لغة الترجمة التي تُختار تلقائيًا.",
      "ستُختار الترجمة باللغة {lang} عند توفرها.",
    ],
  };

  it("defines all six keys in every catalogue", () => {
    const gaps = {};
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      const keys = flatten(dict);
      const missing = ROW.filter((key) => !keys.has(key));
      if (missing.length) gaps[lang] = missing;
    }
    expect(gaps).toEqual({});
  });

  it("no longer describes the row as a subtitle-language picker", () => {
    const reverted = {};
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      const keys = flatten(dict);
      const stale = ROW.filter((key) => LEGACY[lang].includes(keys.get(key)));
      if (stale.length) reverted[lang] = stale;
    }
    expect(reverted).toEqual({});
  });
});
