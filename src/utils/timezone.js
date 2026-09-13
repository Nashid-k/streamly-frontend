/**
 * Platform-aware timezone utilities.
 *
 * Different platforms release content at different times:
 *   - Streaming (Netflix, Prime, Hotstar, JioCinema, etc.):
 *       Global/regional release at midnight LOCAL time.
 *       TMDB date = the user's local date (no conversion needed).
 *   - US Broadcast (ABC, NBC, CBS, FOX, etc.):
 *       Airs at 8PM Eastern Time on the listed date.
 *       For users outside ET, the local date may shift forward.
 *
 * This module auto-detects the user's timezone and applies the
 * correct conversion based on the content's source platform.
 */

// ─── Platform → Release Time mapping ───────────────────────────────────────
// Key: lowercase platform ID (matches movie.source / movie.platform)
// Value: release time config
//
// "midnight-local"  → Available at midnight in the viewer's own timezone
//                     (TMDB date IS the local date — no shift needed)
// "midnight-utc"    → Available at midnight UTC (e.g. Prime Video)
// "midnight-source" → Available at midnight in the source region's timezone
//                      e.g. "Asia/Kolkata" for Hotstar/JioCinema
// "8pm-et"          → Traditional US broadcast at 8PM Eastern Time
// ───────────────────────────────────────────────────────────────────────────
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

// ─── Helpers ───────────────────────────────────────────────────────────────

export function getUserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Get the IANA timezone for a given platform.
 * For streaming platforms that release at midnight local, returns the viewer's timezone.
 * For regional platforms, returns the source region's timezone.
 */
function getSourceTimezone(platform, viewerTimezone) {
  const config = PLATFORM_RELEASE[platform?.toLowerCase()] || DEFAULT_RELEASE;
  if (config.type === 'midnight-local') return viewerTimezone;
  if (config.type === 'midnight-source') return config.sourceTimezone;
  if (config.type === 'midnight-utc') return 'UTC';
  if (config.type === '8pm-et') return 'America/New_York';
  return 'America/New_York';
}

/**
 * Get the release hour (in the source timezone) for a given platform.
 * Returns { hour, minute, utcOffsetHours } in the source timezone.
 */
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

/**
 * Get the UTC offset in hours for a given IANA timezone at a given Date.
 * Handles DST automatically via Intl formatting.
 */
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

// ─── Core conversion ───────────────────────────────────────────────────────

/**
 * Convert a raw TMDB date string (YYYY-MM-DD) to the viewer's local date.
 *
 * Platform-aware logic:
 *   - Streaming platforms (Netflix, Prime, Hotstar, JioCinema, etc.):
 *     Release at midnight local/source time. The TMDB date IS the viewer's
 *     local date for most platforms (Netflix, Apple TV+, Zee5, Sony LIV).
 *     For regional platforms (Hotstar, Jio), the release is at midnight IST,
 *     so IST users see the same date but users in other timezones may shift.
 *   - US Broadcast networks (default fallback):
 *     Airs at 8PM Eastern Time. For an Indian user (IST = ET+9:30), a
 *     Monday 8PM ET show arrives Tuesday 5:30 AM IST — so they see Tuesday.
 *
 * @param {string} tmdbDateString - Raw TMDB date (YYYY-MM-DD)
 * @param {string} [viewerTimezone] - IANA timezone of the viewer (auto-detected if omitted)
 * @param {string} [platform] - Content platform (e.g. "netflix", "hotstar", "prime")
 * @returns {string|null} Local date string (YYYY-MM-DD) or null
 */
export function tmdbDateToLocalDate(tmdbDateString, viewerTimezone, platform) {
  if (!tmdbDateString) return null;
  const tz = viewerTimezone || getUserTimezone();
  const srcTz = getSourceTimezone(platform, tz);
  const { hour, minute } = getReleaseTime(platform);

  try {
    // For midnight-local: the release is at midnight in the viewer's own timezone.
    // So the TMDB date IS the local date — no conversion needed.
    if (platform && (PLATFORM_RELEASE[platform?.toLowerCase()] || DEFAULT_RELEASE).type === 'midnight-local') {
      // The date as-is is the viewer's local date
      return tmdbDateString;
    }

    // For other platforms: construct the release moment in the source timezone,
    // then convert to the viewer's local timezone to get their local date.
    //
    // Strategy: create a UTC date from (source date + source offset)
    // then format it in the viewer's timezone.
    const srcOffset = getUTCOffsetHours(srcTz, new Date(tmdbDateString + 'T12:00:00Z'));
    const releaseUTC = new Date(
      new Date(tmdbDateString + 'T12:00:00Z').getTime() -
      srcOffset * 3600 * 1000 +
      hour * 3600 * 1000 +
      minute * 60 * 1000
    );

    // Format the UTC instant in the viewer's local timezone
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(releaseUTC);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {}
  return tmdbDateString;
}

// ─── Formatting helpers ────────────────────────────────────────────────────

/**
 * Format a TMDB date for the user's locale and timezone.
 * Returns e.g. "Monday, Sep 7" or "Sep 7, 2026" depending on options.
 */
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

/**
 * Get the weekday name in the user's locale for a TMDB date.
 * e.g. "Tuesday" for a Monday US broadcast viewed from India.
 */
export function getTMDBWeekday(tmdbDateString, viewerTimezone, platform) {
  return formatTMDBDate(tmdbDateString, { weekday: 'long' }, viewerTimezone, platform);
}

/**
 * Get short weekday (e.g. "Tue") for a TMDB date.
 */
export function getTMDBWeekdayShort(tmdbDateString, viewerTimezone, platform) {
  return formatTMDBDate(tmdbDateString, { weekday: 'short' }, viewerTimezone, platform);
}

/**
 * Format a TMDB date as "Mon DD, YYYY" in user's locale.
 */
export function formatTMDBDateFull(tmdbDateString, viewerTimezone, platform) {
  return formatTMDBDate(
    tmdbDateString,
    { month: 'short', day: 'numeric', year: 'numeric' },
    viewerTimezone,
    platform,
  );
}

/**
 * Get a human-readable "time until" string for a TMDB date.
 * e.g. "in 2 days", "tomorrow", "today", "yesterday"
 */
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
