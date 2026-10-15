/* Audio track labels, normalised for display.
   ── Why this exists ─────────────────────────────────────────────────────────
   Two providers supply the sibling-URL dub list, and they word it differently:
   ZXC sends `lanName` straight through (so the player shows the provider's own
   "Tamil Dub"), and the original track is a row literally titled "Original".
   Neither is wrong, and neither is good: a list reading

       Original
       Tamil Dub
       Hindi Dub
       English Dub

   tells the viewer nothing they did not already assume, wastes the width the row
   has, and — worst — the row called "Original" is a claim we cannot check. We
   KNOW the film's language from TMDB, so the honest label is the language name.

   ── The rule ────────────────────────────────────────────────────────────────
   Strip the word "dub" (and "audio"/"track"/"version" noise) from a provider
   label, and title-case whatever is left. Then, for the original track, prefer
   the film's actual language and fall back to "Original" only when TMDB did not
   say — a wrong guess is worse than no guess. */

const FILM_LANG = {
  en: "English", te: "Telugu", hi: "Hindi", ta: "Tamil", ml: "Malayalam",
  kn: "Kannada", bn: "Bengali", pa: "Punjabi", mr: "Marathi", gu: "Gujarati",
  es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese",
  ru: "Russian", ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic",
  tr: "Turkish", vi: "Vietnamese", th: "Thai", id: "Indonesian", pl: "Polish",
  nl: "Dutch", sv: "Swedish", no: "Norwegian", da: "Danish", fi: "Finnish",
  cs: "Czech", hu: "Hungarian", ro: "Romanian", el: "Greek", he: "Hebrew",
  uk: "Ukrainian", bg: "Bulgarian", hr: "Croatian", sr: "Serbian", sk: "Slovak",
  sl: "Slovenian", et: "Estonian", lv: "Latvian", lt: "Lithuanian",
  fa: "Persian", ur: "Urdu", ta_: "Tamil", ca: "Catalan", eu: "Basque",
  gl: "Galician", lt_: "Lithuanian", is: "Icelandic", ms: "Malay",
};

/* Provider language CODES that are neither a 2-letter ISO code nor a name. The
   ZXC/dub payload speaks in these: `esla` = Spanish (Latin America), `ptbr` =
   Portuguese (Brazil). Left unmapped they leaked into the Audio menu verbatim —
   a row literally reading "esla" beside "French" (live 2026-10-15). Regional
   codes are kept apart on purpose: "Spanish" and "Spanish (Latin America)" are
   two different tracks and must read as such. */
const LANG_ALIASES = {
  esla: "Spanish (Latin America)",
  es419: "Spanish (Latin America)",
  esmx: "Spanish (Mexico)",
  essp: "Spanish (Spain)",
  ptbr: "Portuguese (Brazil)",
  ptpt: "Portuguese (Portugal)",
  zhcn: "Chinese (Simplified)",
  zhtw: "Chinese (Traditional)",
  zhch: "Chinese (Simplified)",
  enus: "English (US)",
  engb: "English (UK)",
  frca: "French (Canada)",
  frfr: "French (France)",
};

/* ISO 639-2/B three-letter codes. The transcoded DASH master names its audio
   group by the MPD's own `lang` ("eng", "hin", "fra"), so a single-audio source
   (Andromeda) showed a bare "eng" row. */
const ISO3_LANG = {
  eng: "English", spa: "Spanish", fra: "French", fre: "French", deu: "German",
  ger: "German", ita: "Italian", por: "Portuguese", rus: "Russian", jpn: "Japanese",
  kor: "Korean", zho: "Chinese", chi: "Chinese", ara: "Arabic", tur: "Turkish",
  vie: "Vietnamese", tha: "Thai", ind: "Indonesian", pol: "Polish", nld: "Dutch",
  dut: "Dutch", swe: "Swedish", nor: "Norwegian", dan: "Danish", fin: "Finnish",
  ces: "Czech", cze: "Czech", hun: "Hungarian", ron: "Romanian", rum: "Romanian",
  ell: "Greek", gre: "Greek", heb: "Hebrew", ukr: "Ukrainian", bul: "Bulgarian",
  hrv: "Croatian", srp: "Serbian", slk: "Slovak", slo: "Slovak", slv: "Slovenian",
  est: "Estonian", lav: "Latvian", lit: "Lithuanian", fas: "Persian", per: "Persian",
  urd: "Urdu", tam: "Tamil", tel: "Telugu", hin: "Hindi", mal: "Malayalam",
  kan: "Kannada", ben: "Bengali", pan: "Punjabi", mar: "Marathi", guj: "Gujarati",
  cat: "Catalan", eus: "Basque", baq: "Basque", glg: "Galician", isl: "Icelandic",
  ice: "Icelandic", msa: "Malay", may: "Malay",
};

/* A code (2-letter, 3-letter, or a regional alias) to a human language name.
   Returns null when nothing is known, so a caller can fall back to the raw
   provider label rather than inventing a name. */
export function languageNameFromCode(code) {
  const c = String(code || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!c) return null;
  return LANG_ALIASES[c] || FILM_LANG[c] || ISO3_LANG[c] || null;
}

/* Provider wording we do not want in a short row. Matched as whole words so a
   language whose own name contains one of these survives: "Audio" never appears
   inside "Tamil", and "Original Audio" is the row this whole file exists for. */
const NOISE = /\b(dubbed?|dub|audio|track|version|audio\s*track|soundtrack)\b/gi;

/* The Audio-menu name for one dub row. Prefer the language CODE the source
   reported (proper regional names for `esla`/`ptbr`, ISO-2/ISO-3 otherwise);
   fall back to the normalised provider label, then to a code hidden inside that
   label (older payloads carry no `lang`, only "esla dub"). */
function dubLabel(track) {
  const fromCode = languageNameFromCode(track?.lang);
  if (fromCode) return fromCode;
  const normalized = normalizeAudioLabel(track?.label);
  if (!normalized) return "";
  return LANG_ALIASES[normalized.toLowerCase().replace(/[^a-z0-9]/g, "")] || normalized;
}

/** "Tamil Dub" / "TAMIL_AUDIO" / "tamil" -> "Tamil". Empty input -> "". */
export function normalizeAudioLabel(raw) {
  if (raw == null) return "";
  let s = String(raw).trim();
  if (!s) return "";
  // Underscores/dashes are how several providers pack a language into a code.
  s = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(NOISE, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  // Capitalise the first letter of each word and leave the rest alone. Applied
  // per word rather than with a blanket toUpperCase/toLowerCase sweep, so
  // "TAMIL_AUDIO" and "portuguese-dub" both come out as "Tamil" / "Portuguese"
  // while an already-correct "Hindi" is not disturbed.
  return s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/**
 * Label for the original soundtrack.
 * @param {string} [language] ISO 639-1 from TMDB.
 * @returns {string} the language name, or "Original" when we do not know.
 */
export function originalTrackLabel(language) {
  if (!language) return "Original";
  const key = String(language).toLowerCase();
  return FILM_LANG[key] || (key.length === 2 ? key.toUpperCase() : String(language));
}

/**
 * The full list a viewer sees, in the order they see it.
 *
 * `sourceIndex` is carried on every dub row and is NOT the row's own position.
 * Rows can be dropped here (a provider listing the original again, or a label
 * that normalises to nothing), so positional indexing would silently drift and
 * `pickDub(i + 1)` would play a DIFFERENT language than the one the viewer
 * clicked. The caller must switch on `sourceIndex + 1`, never on its own index.
 *
 * @param {Array<{label: string, lang?: string}>} tracks  provider rows, may be empty
 * @param {string} [language]              ISO 639-1 for the original row
 * @returns {Array<{label: string, isOriginal: boolean, sourceIndex: number|null}>}
 */
export function buildAudioTrackList(tracks, language) {
  const out = [{ label: originalTrackLabel(language), isOriginal: true, sourceIndex: null }];
  const seen = new Set([out[0].label.toLowerCase()]);
  (tracks || []).forEach((track, i) => {
    const label = dubLabel(track);
    if (!label || seen.has(label.toLowerCase())) return;
    seen.add(label.toLowerCase());
    out.push({ label, isOriginal: false, sourceIndex: i });
  });
  return out;
}
