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
   counts as aired). Rule shared by the card, list and controls — and by the
   player's episode rail, so both surfaces agree on what is playable.
   The day is anchored at noon UTC, matching getSeasonEpisodes' releasedEpisodes
   count / contentTags / day labels: parsing the YYYY-MM-DD as UTC midnight flips
   an episode "released today" a day early near the boundary. */
export function isEpAired(ep, now = new Date()) {
  if (!ep || !ep.airDate) return true;
  const s = String(ep.airDate);
  const day = /^\d{4}-\d{2}-\d{2}/.exec(s)?.[0];
  const t = day ? Date.parse(`${day}T12:00:00Z`) : new Date(s).getTime();
  return !Number.isFinite(t) || t <= now.getTime();
}

/* The timestamp argument a "start playback" action should hand to
   updateProgress: `null` means "keep whatever resume point is already stored",
   `0` means "reset to a fresh start". Starting an episode the viewer already
   progressed in (or a movie with progress) must never zero its saved position,
   so keep the stored timestamp whenever the stored entry is the very episode
   about to play; a different episode (or no progress) starts clean. */
export function startPlaybackTimestamp(entry, { isTv, season, episode } = {}) {
  const ts = Number(entry?.timestamp) || 0;
  if (ts <= 0) return 0;
  if (!isTv) return null;
  const sameEpisode =
    Number(entry?.savedSeason) === Number(season) &&
    Number(entry?.savedEpisode) === Number(episode);
  return sameEpisode ? null : 0;
}

/* Per-episode watch state: the live resume point counts, plus the explicit
   watchedEpisodes set for THAT season. Scoped to the season so a tick on S1E5
   never leaks onto S2E5. */
export function isEpisodeWatchedEntry(entry, season, episodeNumber) {
  if (!entry) return false;
  if (
    Number(entry.savedSeason) === Number(season) &&
    entry.savedEpisode === episodeNumber &&
    (entry.timestamp || 0) > 0
  ) {
    return true;
  }
  return (entry.watchedEpisodes?.[season] || []).includes(episodeNumber);
}

/* The episode to land on when stepping across a season boundary. Uses the
   target season's own episode count — never the series' absolute last episode,
   which would jump past the season — so "last" lands on that season's final
   episode and "first" on its opening one. */
export function seasonEdgeEpisode(seasonEpisodeCount, edge) {
  if (edge === "last") {
    const count = Number(seasonEpisodeCount) || 0;
    return count > 0 ? count : 1;
  }
  return 1;
}

/* Compact "Thu, Sep 9"-style label for an upcoming episode chip. Lives here so
   the details page and the player's episode rail cannot drift apart. */
export function formatAirsDate(dateStr) {
  if (!dateStr) return "Upcoming";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return String(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
