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

/* Provider wording we do not want in a short row. Matched as whole words so a
   language whose own name contains one of these survives: "Audio" never appears
   inside "Tamil", and "Original Audio" is the row this whole file exists for. */
const NOISE = /\b(dubbed?|dub|audio|track|version|audio\s*track|soundtrack)\b/gi;

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
 * @param {Array<{label: string}>} tracks  provider rows, may be empty
 * @param {string} [language]              ISO 639-1 for the original row
 * @returns {Array<{label: string, isOriginal: boolean, sourceIndex: number|null}>}
 */
export function buildAudioTrackList(tracks, language) {
  const out = [{ label: originalTrackLabel(language), isOriginal: true, sourceIndex: null }];
  const seen = new Set([out[0].label.toLowerCase()]);
  (tracks || []).forEach((t, i) => {
    const label = normalizeAudioLabel(t?.label);
    // An empty or duplicate row is noise: a provider listing the original
    // again as "Tamil Dub" next to our "Tamil" row helps nobody.
    if (!label || seen.has(label.toLowerCase())) return;
    seen.add(label.toLowerCase());
    out.push({ label, isOriginal: false, sourceIndex: i });
  });
  return out;
}
