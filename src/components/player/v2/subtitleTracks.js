/**
 * Subtitle track metadata: SDH, forced, and ordering (task.md 3.29).
 *
 * Pure functions over plain objects, no React and no fetch — same shape as
 * `sheetPanels.js` and `radioGroup.js`, so the ordering and the badge logic are
 * testable without a DOM and the panel stays a renderer.
 *
 * WHY THIS EXISTS. OpenSubtitles returns `SubHearingImpaired` and `SubForced` on
 * every result, and `subtitleFetcher` threw both away at the dedupe step: it keyed
 * the map on `LanguageName` alone, so for a title with a plain English track AND an
 * English SDH track only the first survives. The viewer was never offered a choice
 * that existed, and nothing on screen said the data had been dropped — the sheet
 * simply listed "English". That is why this is a fetcher change and not a CSS one.
 */

/**
 * Coerce OpenSubtitles' `"0"`/`"1"` (or a boolean, or `undefined`) to a boolean.
 *
 * The upstream REST API returns these as STRINGS, and `"0"` is truthy in JavaScript —
 * so `Boolean(sub.SubHearingImpaired)` marks every track as SDH, which is worse than
 * the current behaviour: the badge would appear on all rows and read as a rendering
 * fault. Only `"1"` and `1` and `true` count.
 */
export const flagOf = (value) =>
  value === true || value === 1 || value === "1" || value === 1n;

/**
 * A short, human badge for a track's variant, or `null` when it is a plain track.
 *
 * "SDH" over "hearing impaired" because that is the term the upstream data uses and
 * the one viewers recognise from other players; the full phrase belongs in the
 * accessible name, not in a 3-character chip. `Forced` for signage/narration tracks,
 * which are a different thing entirely and must not be labelled SDH: a forced track
 * has no extra dialogue description, it has no dialogue at all.
 */
export function trackBadge(track) {
  if (forcedOf(track)) return "Forced";
  if (sdhOf(track)) return "SDH";
  return null;
}

const sdhOf = (track) => flagOf(track?.hearingImpaired);
const forcedOf = (track) => flagOf(track?.forced);

/**
 * A badge's expanded form, for the screen-reader name.
 *
 * "SDH" alone is read as three letters; "hearing impaired" is the phrase a viewer
 * looking for this track would search for. Both badges get an expansion because
 * "Forced" read literally is ambiguous between "the player forced this" and "this
 * track contains forced narrative".
 */
export function trackBadgeLabel(track) {
  if (forcedOf(track)) return "Forced (signage and narration)";
  if (sdhOf(track)) return "SDH (hearing impaired)";
  return null;
}

/**
 * Dedupe key for a subtitle result.
 *
 * `languageId` alone is what the fetcher used, and it is why SDH tracks vanished:
 * every English variant shares one `SubLanguageID`, so the map kept exactly one of
 * them. The variant is part of the identity — an SDH track and a plain track are
 * different files with different content and the viewer is entitled to pick either.
 *
 * `forced` is in the key for the same reason, and it is also why the ORDER matters:
 * a forced track and an SDH track of one language are three distinct files, and
 * collapsing them to one row would hide two of them.
 */
export function trackKey(track) {
  const id = track?.languageId ?? track?.language ?? "";
  const variant = [sdhOf(track) ? "sdh" : "", forcedOf(track) ? "forced" : ""]
    .filter(Boolean)
    .join("+");
  return variant ? `${id}:${variant}` : String(id);
}

/**
 * Order the caption options: alphabetical by language, then plain before SDH before
 * forced, with `Off` pinned first by the caller.
 *
 * Two rules, both deliberate:
 *
 * 1. Plain before SDH. Most viewers want the clean track and the SDH one is the
 *    fallback for the specific case where it is needed; listing SDH first buries the
 *    common choice under a badge.
 * 2. Forced LAST within a language, not first. A forced signage track is context, not
 *    a subtitle — most viewers never want it, and pinning it to the top of the list
 *    makes it the accidental default under a fast arrow-key run.
 *
 * `localeCompare` with a numeric option, not plain `<`: "English (UK)" and "English
 * (US)" sort lexically as characters in many locales, and track lists are exactly the
 * place where "English 2" sorting before "English 10" reads as broken.
 */
export function sortTracks(tracks) {
  const rank = (track) => (forcedOf(track) ? 2 : sdhOf(track) ? 1 : 0);
  /* Junk entries are DROPPED, not sorted. `languages` is hook state fed by a fetch,
   * and this function is also what the panel calls directly — so a stray `null` here
   * would otherwise become a caption row with an empty language name and a key of `""`,
   * which reads as a rendering fault rather than as bad data. Sorting is the wrong
   * place to be lenient about list CONTENTS. */
  return (Array.isArray(tracks) ? tracks : []).filter(Boolean).sort((a, b) => {
    /* Language FIRST, variant second — and the order of these two comparisons is the
     * whole implementation.
     *
     * Ranking globally (all plain tracks, then all SDH, then all forced) reads as a
     * sensible reading of rule 1 until you have two languages: English plain and Tamil
     * plain land adjacent, then English SDH goes BELOW Tamil, so the two English
     * variants are no longer next to each other. That is the case 3.29 exists for — a
     * viewer comparing the descriptive track against the plain one for the SAME
     * language — and it is exactly the comparison the list exists to support.
     *
     * So: group by language, and rank within the group. */
    const nameA = String(a?.language ?? "");
    const nameB = String(b?.language ?? "");
    const byName = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" });
    if (byName !== 0) return byName;
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    /* Last tiebreak, and it has to exist: two results can share a language AND a
     * variant only when upstream returned the same file twice, and returning `0` there
     * leaves the order to the engine's sort — which happens to be stable in V8 today and
     * is not a contract, so the list can reorder between renders and move the selected
     * row out from under the viewer's thumb mid-press.
     *
     * Ordering by download link is arbitrary, and arbitrary is fine: it is a total
     * order, which is the actual requirement. Dedupe means only one of the two is ever
     * rendered anyway. */
    const byKey = trackKey(a).localeCompare(trackKey(b));
    if (byKey !== 0) return byKey;
    return String(a?.downloadLink ?? "").localeCompare(String(b?.downloadLink ?? ""));
  });
}

/**
 * Reduce raw upstream results to the caption options the panel renders.
 *
 * Dedupe AND sort in one pass, because doing them separately is where the current bug
 * lives: dedupe on `languageId` and the SDH track is gone before sorting ever runs.
 *
 * First result per key wins, which keeps OpenSubtitles' own ordering (highest rated
 * first) inside a variant group — the fetcher relied on that and it is still the right
 * call for choosing WHICH SDH file to offer.
 */
export function captionOptions(tracks) {
  const seen = new Set();
  const unique = [];
  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (!track) continue;
    const key = trackKey(track);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(track);
  }
  return sortTracks(unique);
}

/**
 * The interface languages the Settings picker can name (task.md 5.12).
 *
 * `defaultLanguage` is an ISO-639-1 code ("en"); OpenSubtitles returns its own
 * pair — `SubLanguageID` as ISO-639-2/B ("eng") and `LanguageName` in English
 * ("English"). Both the code and its variants are accepted per language, because
 * a hardcoded interface id and an upstream id are different vocabularies and
 * comparing them directly is how a preference silently never matches.
 *
 * The deprecated ISO-639-2/B forms (`fre`, `ger`) are listed alongside the
 * current `fra`/`deu`: the REST API still emits the older ones for some titles,
 * and both spell the same language.
 */
export const LANGUAGE_ALIASES = Object.freeze({
  en: { names: ["english"], ids: ["en", "eng"] },
  es: { names: ["spanish"], ids: ["es", "spa", "esp"] },
  fr: { names: ["french"], ids: ["fr", "fre", "fra"] },
  de: { names: ["german"], ids: ["de", "ger", "deu"] },
  it: { names: ["italian"], ids: ["it", "ita"] },
  pt: { names: ["portuguese"], ids: ["pt", "por"] },
  ja: { names: ["japanese"], ids: ["ja", "jpn"] },
  ko: { names: ["korean"], ids: ["ko", "kor"] },
  hi: { names: ["hindi"], ids: ["hi", "hin"] },
  ar: { names: ["arabic"], ids: ["ar", "ara"] },
});

function matchesLanguage(track, aliases) {
  const id = String(track?.languageId || "").toLowerCase();
  if (id && aliases.ids.includes(id)) return true;
  /* `startsWith`, not equality: OpenSubtitles distinguishes "Portuguese" from
   * "Portuguese (BR)" and "Spanish" from "Spanish (LA)" by a suffix, and a
   * viewer who chose Portuguese wants either. None of the ten names is a prefix
   * of another, so this cannot cross-match a different language. */
  const name = String(track?.language || "").trim().toLowerCase();
  return Boolean(name) && aliases.names.some((alias) => name.startsWith(alias));
}

/**
 * The best track for a preferred interface language, or null.
 *
 * When a language offers several variants the PLAIN track wins over SDH, and SDH
 * over forced, so auto-selection never turns on a descriptive or signage track
 * by accident. Ranking is done here rather than relying on the caller's order,
 * because this is also called with raw fixtures.
 *
 * Null is a real answer, not a failure: the preferred language is simply absent,
 * and the caller leaves subtitles Off rather than switching the viewer to a
 * language they did not ask for.
 */
export function preferredTrack(tracks, code) {
  const aliases = LANGUAGE_ALIASES[String(code || "").toLowerCase()];
  if (!aliases) return null;
  const matches = (Array.isArray(tracks) ? tracks : []).filter(
    (track) => track && matchesLanguage(track, aliases),
  );
  if (!matches.length) return null;
  const rank = (track) => (flagOf(track.forced) ? 2 : flagOf(track.hearingImpaired) ? 1 : 0);
  return matches.reduce((best, track) => (rank(track) < rank(best) ? track : best), matches[0]);
}
