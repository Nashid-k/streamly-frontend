/* Pure helpers for the title-details page. Kept out of the page component so
   the module only exports a component (React Fast Refresh friendly) and so the
   formatting logic is unit-testable. */

/* "2h 45m" runtime label (Cinejoy meta row format). */
export function formatRuntimeLabel(durationMins) {
  if (!durationMins || durationMins <= 0) return null;
  const h = Math.floor(durationMins / 60);
  const m = durationMins % 60;
  return h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/* True while the title's release date is still in the future. */
export function isUnreleased(releaseDate) {
  if (!releaseDate) return false;
  const t = new Date(releaseDate).getTime();
  return Number.isFinite(t) && t > Date.now();
}

/* Simple "split" derived from the IMDb-style score (Cinejoy's vote-split):
   the share of the max score counts as the "up" proportion. */
export function voteSplitPct(imdbRating) {
  const rating = Number(imdbRating) || 0;
  if (rating <= 0) return null;
  const up = Math.max(1, Math.min(99, Math.round((rating / 10) * 100)));
  return { up, down: 100 - up };
}

/* Episode ordering for the Episodes section — Cinejoy sorts "Oldest"
   (default) or "Newest" — and is a pure (non-mutating) copy+reverse. */
export function buildEpisodeOrder(episodes, newest = false) {
  const list = Array.isArray(episodes) ? [...episodes] : [];
  if (newest) list.reverse();
  return list;
}

/* "E1" chip label exactly like the Cinejoy episode-card badge. */
export function episodeNumberLabel(episodeNumber) {
  if (episodeNumber == null) return "";
  return `E${episodeNumber}`;
}

/* An episode is playable once its air date is not in the future (null date
   counts as aired). Rule shared by the card, list and controls. */
export function isEpAired(ep, now = new Date()) {
  if (!ep || !ep.airDate) return true;
  const t = new Date(ep.airDate).getTime();
  return !Number.isFinite(t) || t <= now.getTime();
}
