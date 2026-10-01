import { SUBTITLE_FONTS } from "../../../constants/settings";

/**
 * Subtitle typography and colour (task.md 3.18-3.21).
 *
 * React-free on purpose, like every other core in this player: these are the
 * decisions a viewer makes in Settings and the decisions the cue node then obeys,
 * and keeping them out of the component means a wrong font can be reproduced from
 * a test with no DOM at all.
 *
 * The legacy resolves the font with a nested ternary over `subtitleFont` and a
 * three-way comparison that has to be edited in lockstep with
 * `constants/settings.js:66` — the registry already carries the family, so the
 * mapping here is a LOOKUP and a fallback rather than a second copy of the list.
 */

/**
 * The registry entry for a preference value, or the first entry.
 *
 * A preference can be stale in two directions: an id from a registry that has
 * since lost it (a rename), or a hand-edited localStorage with a value that was
 * never an id. Both fall back to the default rather than rendering `undefined`
 * into a `font-family`, which the browser drops — and a dropped `font-family`
 * inherits the player's own stack, so a bad preference silently becomes
 * "some font" rather than an error anyone can see.
 */
function fontEntry(preferenceId) {
  const wanted = String(preferenceId ?? "").trim().toLowerCase();
  return SUBTITLE_FONTS.find((f) => f.id === wanted) || SUBTITLE_FONTS[0] || null;
}

/**
 * 3.18. The `font-family` for a `subtitleFont` preference id.
 *
 * @returns {string} a CSS font stack, or "" when the registry is empty
 */
export function subtitleFontFamily(preferenceId) {
  return fontEntry(preferenceId)?.family || "";
}

/**
 * The cue text size, as a percentage of a base the caller measures.
 *
 * 3.19 replaces the legacy's `clamp(16px, 2.6vw, 26px)`. The defect there is the
 * unit: `2.6vw` is a fraction of the VIEWPORT, so the same cue is tiny on a phone
 * held next to the video and enormous on a 32" monitor, even when the player box
 * is the same size in both. The preference is a percentage, so this returns the
 * percentage and the node applies it against its own container.
 *
 * Bounded rather than passed through: a preference of 0 would make the cue
 * invisible and 5000 would paint over the video, and neither is a state worth
 * having a setting for. The legacy had the same clamp semantics buried in
 * `PlayerPreview.jsx:84` — `(Number(subtitleSize) || 100) / 100` — which also
 * cannot represent a deliberate 0.
 */
export function subtitleSizeScale(preferencePercent) {
  const n = Number(preferencePercent);
  const percent = Number.isFinite(n) && n > 0 ? n : 100;
  return Math.min(300, Math.max(50, percent)) / 100;
}

/**
 * Relative luminance of a `#rgb` / `#rrggbb` colour, 0 (black) to 1 (white).
 *
 * Written out rather than pulled from a colour library: the only thing needed is
 * one number, and the whole of the scrim decision below rests on it being the
 * WCAG relative-luminance formula rather than an eyeballed average. The gamma
 * step is the part that matters — linearising before weighting is what stops a
 * mid-tone like `#808080` from scoring as half-bright when it is really ~0.22.
 *
 * @returns {number|null} null when the value is not a hex colour we can read
 */
export function subtitleLuminance(color) {
  const hex = String(color ?? "").trim().replace(/^#/, "");
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  const channels = [0, 2, 4].map((i) => {
    const raw = parseInt(full.slice(i, i + 2), 16) / 255;
    /* Linearise: sRGB's transfer function, not the identity. */
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * 3.20. The scrim behind the cue text, with an opacity derived from the cue's own
 * luminance.
 *
 * The legacy painted `rgba(0,0,0,0.42)` no matter what colour the text was, which
 * is wrong in both directions: bright yellow captions sit on a box heavy enough
 * to look like a highlight, and mid-grey captions on white video wash out because
 * the scrim never got darker. A dark scrim has to be stronger the brighter the
 * text is, and weak enough on dark text that it is not visible as a box at all.
 *
 * Interpolated between two ends rather than a curve: at 0 luminance the cue is
 * lighter than the scrim is meant to be and the scrim is pointless, so it is
 * dropped to its floor; at 1 it must be near-opaque or the text has nothing to
 * sit on.
 *
 * @returns {string} a CSS colour
 */
export function subtitleScrim(color) {
  const luminance = subtitleLuminance(color);
  /* An unreadable colour is not a reason to lose the scrim. White is the safe
   * assumption: it is what the legacy hardcoded, and it is the worst case for
   * contrast, so a bad preference gets the most protective treatment. */
  const l = luminance === null ? 1 : luminance;
  const opacity = 0.18 + l * 0.62;
  return `rgba(0, 0, 0, ${opacity.toFixed(3)})`;
}

/**
 * 3.20. The resolved cue colour, normalised to a CSS colour.
 *
 * A preference is a free string from localStorage, so `#zzz`, `red;` and `` all
 * arrive eventually. An unparseable value falls back to white rather than being
 * passed through, because an invalid `color` in a style object is dropped and the
 * cue then inherits — which on a white-scene video is invisible text.
 *
 * @returns {string} a hex colour
 */
export function subtitleColor(preferenceValue) {
  const raw = String(preferenceValue ?? "").trim();
  if (subtitleLuminance(raw) !== null) return raw.startsWith("#") ? raw : `#${raw}`;
  return "#ffffff";
}

/**
 * 3.21. The BCP-47 tag for a subtitle language name.
 *
 * Needed so a Tamil cue is announced in Tamil rather than read with the viewer's
 * screen-reader voice. The registry of subtitle languages comes from
 * OpenSubtitles as a DISPLAY NAME ("English", "Tamil"), so this maps the names
 * that matter onto tags. Anything unmapped returns "", and the caller then omits
 * the attribute — `lang=""` is worse than no `lang` at all, because an empty
 * value is a claim that the content has no language.
 *
 * Only unambiguous names are mapped. "Spanish" and "Spanish (Latin America)" are
 * both Spanish and differ in region; guessing `es` for the second would be
 * correct but the same lookup cannot also distinguish "Haitian Creole" from
 * "Creole", so the table stops at the language level deliberately.
 */
const LANGUAGE_TAGS = Object.freeze({
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  brazilian: "pt-BR",
  dutch: "nl",
  russian: "ru",
  japanese: "ja",
  korean: "ko",
  chinese: "zh",
  mandarin: "zh",
  cantonese: "zh-HK",
  hindi: "hi",
  tamil: "ta",
  telugu: "te",
  malayalam: "ml",
  kannada: "kn",
  bengali: "bn",
  punjabi: "pa",
  marathi: "mr",
  gujarati: "gu",
  arabic: "ar",
  turkish: "tr",
  polish: "pl",
  swedish: "sv",
  norwegian: "no",
  danish: "da",
  finnish: "fi",
  greek: "el",
  hebrew: "he",
  thai: "th",
  vietnamese: "vi",
  indonesian: "id",
  czech: "cs",
  romanian: "ro",
  hungarian: "hu",
  ukrainian: "uk",
});

/**
 * 3.21. `lang` for the cue node, or "" when the name is not confidently mapped.
 *
 * @param {string} languageName  a display name from the subtitle list
 * @returns {string} a BCP-47 tag, or "" for "omit the attribute"
 */
export function subtitleLang(languageName) {
  const raw = String(languageName ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (LANGUAGE_TAGS[raw]) return LANGUAGE_TAGS[raw];
  /* Regional suffixes are common ("English (US)") and the BASE language is still
   * known — the tag is honest about the language and makes no claim about the
   * region. Stripping at the parenthesis keeps "Haitian Creole" working, since
   * its base name is not a bare English word in the table. */
  const base = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return LANGUAGE_TAGS[base] || "";
}