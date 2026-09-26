/* Shared meta-fact helpers for the Netflix-style info surfaces
   (TitleInfoModal). Kept outside the component file so both the component
   and its tests can import them without tripping fast-refresh rules. */

function formatRuntime(mins) {
  const m = Number(mins);
  if (!m || m <= 0) return null;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}

/* Build the meta facts Netflix shows under the title:
   "97% Match · 2021 · 2 Seasons · 58m". Missing parts drop out.
   Each fact is { text, accent } — accent facts get the green "Match" tint. */
export function buildMetaFacts(detail, fallback) {
  const src = detail || fallback || {};
  const facts = [];
  if (src.imdbRating) {
    facts.push({ text: `${Math.round(src.imdbRating * 10)}% Match`, accent: true });
  }
  const year = src.releaseYear || src.year;
  if (year) facts.push({ text: String(year).substring(0, 4) });
  const seasons = Number(src.seasonsCount);
  if (src.isSeries && seasons > 0) {
    facts.push({ text: seasons === 1 ? "1 Season" : `${seasons} Seasons` });
  }
  const runtime = formatRuntime(src.runtime ?? src.durationMins);
  if (runtime) {
    facts.push({ text: runtime });
  } else if (typeof src.duration === "string" && src.duration && !/^\d{4}/.test(src.duration)) {
    // Rail payloads carry "1h 53m" style strings; date-like strings are not runtimes.
    facts.push({ text: src.duration });
  }
  return facts;
}
