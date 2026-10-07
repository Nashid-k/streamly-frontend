/**
 * Platform-aware timezone utilities.
 *
 * Streaming platforms (Netflix, Prime, Hotstar, JioCinema, …) release at
 * midnight local time, so the TMDB date IS the viewer's local date. US
 * broadcast networks air at 8PM Eastern, which shifts the local date for viewers
 * outside ET. The platform's release rule picks the conversion.
 */

// Platform → release-time config, keyed by lowercase platform ID (matches
// movie.source / movie.platform):
//   "midnight-local"  → midnight in the viewer's timezone (no shift needed)
//   "midnight-utc"    → midnight UTC (Prime Video)
//   "midnight-source" → midnight in the source region, e.g. Asia/Kolkata
//   "8pm-et"          → traditional US broadcast at 8PM Eastern
const PLATFORM_RELEASE = {
  // Streaming platforms — midnight local
  netflix:    { type: 'midnight-local' },
  appletv:    { type: 'midnight-local' },
  zee5:       { type: 'midnight-local' },
  sonyliv:    { type: 'midnight-local' },

  // Regional platforms — midnight in their source region
  hotstar:    { type: 'midnight-source', sourceTimezone: 'Asia/Kolkata' },
  jio:        { type: 'midnight-source', sourceTimezone: 'Asia/Kolkata' },

  // Prime Video — global rollout at midnight UTC
  prime:      { type: 'midnight-utc' },
};

// Default for unknown platforms / US broadcast networks
const DEFAULT_RELEASE = { type: '8pm-et' };


export function getUserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * The IANA timezone for a platform: the viewer's own for midnight-local
 * platforms, the source region's for regional ones.
 */
function getSourceTimezone(platform, viewerTimezone) {
  const config = PLATFORM_RELEASE[platform?.toLowerCase()] || DEFAULT_RELEASE;
  if (config.type === 'midnight-local') return viewerTimezone;
  if (config.type === 'midnight-source') return config.sourceTimezone;
  if (config.type === 'midnight-utc') return 'UTC';
  if (config.type === '8pm-et') return 'America/New_York';
  return 'America/New_York';
}

/** Release hour in the source timezone for a platform: { hour, minute, utcOffsetHours }. */
function getReleaseTime(platform) {
  const config = PLATFORM_RELEASE[platform?.toLowerCase()] || DEFAULT_RELEASE;
  switch (config.type) {
    case 'midnight-local':
    case 'midnight-source':
    case 'midnight-utc':
      return { hour: 0, minute: 0 };
    case '8pm-et':
      return { hour: 20, minute: 0 };
    default:
      return { hour: 0, minute: 0 };
  }
}

/** UTC offset in hours for an IANA timezone at a given Date, DST included (via Intl). */
function getUTCOffsetHours(timezone, date) {
  try {
    const str = date.toLocaleString('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const match = str.match(/GMT([+-]\d{1,2}(?::\d{2})?)/);
    if (match) {
      const parts = match[1].split(':');
      return (
        parseInt(parts[0], 10) +
        (parts[1] ? parseInt(parts[1], 10) / 60 : 0)
      );
    }
  } catch {}
  // Fallback: compute from difference between UTC and local representation
  try {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const localStr = date.toLocaleString('en-US', { timeZone: timezone });
    return (new Date(localStr) - new Date(utcStr)) / (1000 * 60 * 60);
  } catch {
    return 0;
  }
}


/**
 * The exact UTC instant a title becomes available, derived from its TMDB date
 * (YYYY-MM-DD) and the platform's release rule.
 *
 * "Midnight-local" titles become available at their own calendar midnight;
 * regional/UTC platforms anchor at midnight (+ any release time) in their
 * source region. US broadcast — the default fallback — anchors at 20:00
 * America/New_York: a Monday 8PM ET show goes live Monday 20:00 ET, i.e. 00:00
 * UTC Tuesday, and a Monday 8PM local date reaches an IST viewer on Tuesday.
 *
 * @param {string} tmdbDateString - Raw TMDB date (YYYY-MM-DD)
 * @param {string} [viewerTimezone] - IANA timezone of the viewer (auto-detected if omitted)
 * @param {string} [platform] - Content platform (e.g. "netflix", "hotstar", "prime")
 * @returns {Date|null} The release instant (UTC), or null when the date is unusable.
 */
export function getReleaseInstant(tmdbDateString, viewerTimezone, platform) {
  if (!tmdbDateString) return null;
  const s = String(tmdbDateString);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m, d));
  // Reject overflow like 2026-02-31 or 2026-13-45 (rather than letting
  // Date.UTC roll over) so malformed dates stay untouched upstream.
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }

  const tz = viewerTimezone || getUserTimezone();
  const srcTz = getSourceTimezone(platform, tz);
  const { hour, minute } = getReleaseTime(platform);

  // Source-local midnight as a UTC instant. Two passes through the offset so a
  // DST border day (midnight lands in the previous day's offset) still decodes
  // to the right wall-clock hour.
  let inst = Date.UTC(y, m, d);
  let offset = getUTCOffsetHours(srcTz, new Date(inst));
  offset = getUTCOffsetHours(srcTz, new Date(inst - offset * 3600 * 1000));
  return new Date(inst - offset * 3600 * 1000 + hour * 3600 * 1000 + minute * 60 * 1000);
}

/**
 * Convert a raw TMDB date (YYYY-MM-DD) to the viewer's local date.
 *
 * Midnight-local platforms need no conversion; other platforms resolve the
 * release moment in the source timezone (see getReleaseInstant) and reformat
 * it locally.
 *
 * @param {string} tmdbDateString - Raw TMDB date (YYYY-MM-DD)
 * @param {string} [viewerTimezone] - IANA timezone of the viewer (auto-detected if omitted)
 * @param {string} [platform] - Content platform (e.g. "netflix", "hotstar", "prime")
 * @returns {string|null} Local date string (YYYY-MM-DD) or null
 */
export function tmdbDateToLocalDate(tmdbDateString, viewerTimezone, platform) {
  if (!tmdbDateString) return null;
  const tz = viewerTimezone || getUserTimezone();
  const release = getReleaseInstant(tmdbDateString, viewerTimezone, platform);
  if (!release) return tmdbDateString;

  // Format the release instant in the viewer's local timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(release);
  const yy = parts.find((p) => p.type === 'year')?.value;
  const mm = parts.find((p) => p.type === 'month')?.value;
  const dd = parts.find((p) => p.type === 'day')?.value;
  if (yy && mm && dd) return `${yy}-${mm}-${dd}`;
  return tmdbDateString;
}

// ─── Formatting helpers ────────────────────────────────────────────────────

/** Format a TMDB date for the user's locale and timezone, e.g. "Monday, Sep 7". */
export function formatTMDBDate(
  tmdbDateString,
  options = {},
  viewerTimezone,
  platform,
) {
  if (!tmdbDateString) return '';
  const localDateStr = tmdbDateToLocalDate(tmdbDateString, viewerTimezone, platform);
  if (!localDateStr) return tmdbDateString;
  const tz = viewerTimezone || getUserTimezone();
  try {
    const date = new Date(localDateStr + 'T12:00:00Z');
    if (isNaN(date.getTime())) return tmdbDateString;
    return date.toLocaleDateString(undefined, { timeZone: tz, ...options });
  } catch {
    return tmdbDateString;
  }
}

/** Weekday name in the user's locale, e.g. "Tuesday" for a Monday US-broadcast
    date viewed from India. */
export function getTMDBWeekday(tmdbDateString, viewerTimezone, platform) {
  return formatTMDBDate(tmdbDateString, { weekday: 'long' }, viewerTimezone, platform);
}

/** Short weekday (e.g. "Tue") for a TMDB date. */
export function getTMDBWeekdayShort(tmdbDateString, viewerTimezone, platform) {
  return formatTMDBDate(tmdbDateString, { weekday: 'short' }, viewerTimezone, platform);
}

/** Format a TMDB date as "Mon DD, YYYY" in the user's locale. */
function formatTMDBDateFull(tmdbDateString, viewerTimezone, platform) {
  return formatTMDBDate(
    tmdbDateString,
    { month: 'short', day: 'numeric', year: 'numeric' },
    viewerTimezone,
    platform,
  );
}

/** Human-readable "time until" for a TMDB date: "in 2 days", "tomorrow", "today", "yesterday". */
export function getTimeUntil(tmdbDateString, viewerTimezone, platform) {
  if (!tmdbDateString) return '';
  const tz = viewerTimezone || getUserTimezone();
  const localDateStr = tmdbDateToLocalDate(tmdbDateString, tz, platform);
  if (!localDateStr) return '';

  const todayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const todayStr = `${todayParts.find((p) => p.type === 'year')?.value}-${todayParts.find((p) => p.type === 'month')?.value}-${todayParts.find((p) => p.type === 'day')?.value}`;

  const diffDays = Math.round(
    (new Date(localDateStr + 'T12:00:00Z') - new Date(todayStr + 'T12:00:00Z')) /
    (1000 * 60 * 60 * 24),
  );

  if (diffDays < -1) return `${Math.abs(diffDays)} days ago`;
  if (diffDays === -1) return 'yesterday';
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays <= 7) return `in ${diffDays} days`;
  return formatTMDBDateFull(tmdbDateString, tz, platform);
}
