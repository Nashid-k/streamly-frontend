/* Card content tags — the "what should the viewer notice about this title at a
   glance" rules, in ONE pure place, so MovieCard (and anything else that later
   wants the same verdict) does not re-derive them inline.

   ── Why there is no "recently added" tag ─────────────────────────────────────
   The catalogue is a set of TMDB ids. TMDB exposes release_date /
   first_air_date and NOTHING about when a title was added to a provider's
   catalogue — there is no addedAt / dateAdded / firstSeen field anywhere in
   src/, api/ or server/. A tag claiming "recently added" would therefore be
   inventing a fact we cannot check.

   What IS knowable, and what every major service's red "New" ribbon actually
   means, is "this came out recently" — derived from the release date. That is
   what NEW means here: recently RELEASED, not recently ingested. The rule is
   deliberately narrow so the tag stays informative instead of blanketing a
   third of every rail. */

const MS_PER_DAY = 86400000;

/** A title is NEW for this long after its release date. Tight on purpose: the
    wider the window, the more of the rail wears the badge and the less it
    means. Mirrors how DiscoveryRails' "Latest Releases" rail infers freshness
    (90 days), but much stricter because a badge is far more visible than a
    section header. */
export const NEW_TAG_WINDOW_DAYS = 14;

/** Days since `dateStr` (YYYY-MM-DD), or null when the date is unusable.
    Noon-UTC anchoring matches releaseCalendar so a title released "today" is
    0 days old in both places and never flips to -1 across a timezone edge. */
export function daysSinceRelease(dateStr, now = Date.now()) {
  if (!dateStr) return null;
  const s = String(dateStr);
  // Accept a full ISO timestamp but compare on the date part alone.
  const day = /^\d{4}-\d{2}-\d{2}/.exec(s)?.[0];
  if (!day) return null;
  const ms = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  // "Now" is pinned to noon UTC too, so partial days don't round either way.
  const nowMs = Math.floor(now / MS_PER_DAY) * MS_PER_DAY + 12 * 3600000;
  return Math.round((nowMs - ms) / MS_PER_DAY);
}

/** Is this a TV/series item? MovieCard already had this check inline; kept
    permissive so it matches what the card itself considers a series. */
function isSeries(movie) {
  return Boolean(
    movie?.isSeries ||
      movie?.type === "tv" ||
      movie?.mediaType === "tv" ||
      String(movie?.id || "").startsWith("tv-") ||
      String(movie?.id || "").startsWith("tmdb-tv-"),
  );
}

/**
 * The tags a card should show, in priority order.
 *
 * @returns {Array<{id: string, label: string, tone: "new", reason: string, days: number}>}
 *   Empty when the title has nothing worth flagging — callers must handle
 *   `[]` (a tag row is not a given).
 *
 * Rules, and why each one is the way it is:
 *  - NEW only for a title that has ALREADY come out. An unreleased title gets
 *    CountdownBadge instead; calling it "new" would be a lie, and both badges
 *    on one card is noise.
 *  - Suppressed when the rail already renders an equivalent label
 *    (formattedRelease, i.e. a TODAY/TOMORROW/weekday chip). Two chips saying
 *    the same thing on the same card is a bug, not emphasis.
 *  - Suppressed for unreleased-but-soon titles even when a formatted label
 *    exists, since the countdown owns that state.
 */
export function getContentTags(movie, { now = Date.now(), windowDays = NEW_TAG_WINDOW_DAYS } = {}) {
  if (!movie) return [];

  // Reading the clock during render is a deliberate, bounded trade-off (the
  // same pattern DiscoveryRails' freshness filter uses): a card only changes
  // verdict if it stays mounted across midnight AND the title is exactly on
  // the 14-day boundary. Cards are virtualised and unmount constantly, so this
  // cannot realistically hold a stale verdict. `now` is injectable for tests.
  const dateStr = movie.releaseDate || (isSeries(movie) ? movie.firstAirDate : null);
  const days = daysSinceRelease(dateStr, now);

  // No date, or a date in the future: nothing honest to say.
  if (days == null || days < 0) return [];

  if (days > windowDays) return [];

  // The card is already showing this title's release day/label — let it.
  if (movie.formattedRelease) return [];

  return [
    {
      id: "new",
      label: "NEW",
      tone: "new",
      days,
      // A real, checkable reason. Shown as the tag's tooltip, so the viewer
      // learns WHY rather than trusting a colour.
      reason: `Released ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}`,
    },
  ];
}
