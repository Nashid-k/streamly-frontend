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
