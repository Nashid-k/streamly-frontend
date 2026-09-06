/**
 * releaseCalendar.js — Release intelligence system
 *
 * Provides:
 *   • Countdown timers for upcoming content
 *   • "Leaving Soon" alerts for content about to leave platforms
 */

import { normalizePlatformKey, PlatformAdapter, PLATFORMS } from "../api/platformAdapter";
import { formatTMDBDate, getTimeUntil } from "./timezone";

// ─── Airing / Upcoming normalization ───────────────────────────────────────

const isTvishItem = (item) =>
  Boolean(
    item?.isSeries ||
      item?.type === "tv" ||
      /^tmdb-tv-/i.test(String(item?.id || "")),
  );

/**
 * Resolve the NEXT-episode airing info for a title, no matter how the backend
 * shipped it. Handles both shapes seen in the wild:
 *   • { nextEpisode: { releaseDate, season, episode } }
 *   • flat airing rows: { releaseDate, season, episode } on TV titles
 *
 * @returns {{ releaseDate: string, season: number, episode: number, episodeLabel: string|null } | null}
 */
export function getAiringEpisode(item) {
  if (!item) return null;
  const nx = item.nextEpisode;
  const isTv = isTvishItem(item);
  const releaseDate = nx?.releaseDate || (isTv ? item.releaseDate : null);
  if (!releaseDate) return null;

  const seasonRaw = nx?.season ?? nx?.seasonNumber ?? item.season ?? item.seasonNumber;
  const episodeRaw = nx?.episode ?? nx?.episodeNumber ?? nx?.number ?? item.episode ?? item.episodeNumber;
  const season =
    seasonRaw != null && !Number.isNaN(Number(seasonRaw)) && Number(seasonRaw) > 0
      ? Number(seasonRaw)
      : null;
  const episode =
    episodeRaw != null && !Number.isNaN(Number(episodeRaw)) && Number(episodeRaw) > 0
      ? Number(episodeRaw)
      : null;
  const episodeLabel =
    episode != null ? `S${season || 1} E${episode}` : null;

  return { releaseDate, season, episode, episodeLabel };
}

function buildUpcomingInRange(items, todayStr, endStr) {
  if (!items || !Array.isArray(items)) return [];

  const seen = new Set();
  const out = [];

  for (const item of items) {
    if (!item || !item.id) continue;
    const air = getAiringEpisode(item);
    const isTv = isTvishItem(item);
    const dateStr = air?.releaseDate || (!isTv ? item.releaseDate : null);
    if (!dateStr) continue;

    // Only keep well-formed YYYY-MM-DD strings, dated today or later. Backend
    // "isUpcoming" flags are honored beyond the window end so explicitly
    // announced premieres aren't dropped just because they're far out.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    if (dateStr < todayStr) continue;
    if (dateStr > endStr && !(item.isUpcoming === true)) continue;

    const isAnime = Boolean(
      (Array.isArray(item.genres) &&
        item.genres.some((g) => /anime/i.test(String(g)))) ||
        (Array.isArray(item.tags) &&
          item.tags.some((t) => /anime/i.test(String(t)))) ||
        item.isAnime === true,
    );
    const kind = isAnime ? "anime" : isTv ? "series" : "movie";
    const key = `${item.id}|${kind}|${dateStr}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const platformKey = normalizePlatformKey(item.source || item.availablePlatforms?.[0]);
    const platformObj = platformKey ? PLATFORMS[platformKey] : null;

    // Days from today (UTC-anchored so the "current date" stays exact for the
    // user regardless of local TZ). Powers the relative chip labels below.
    const daysUntil = Math.round(
      (Date.parse(`${dateStr}T12:00:00Z`) - Date.parse(`${todayStr}T12:00:00Z`)) / 86400000,
    );
    const relLabel =
      daysUntil <= 0
        ? "TODAY"
        : daysUntil === 1
          ? "TOMORROW"
          : daysUntil <= 7
            ? formatTMDBDate(dateStr, { weekday: "short" }, undefined, platformKey).toUpperCase()
            : formatTMDBDate(dateStr, { month: "short", day: "numeric" }, undefined, platformKey);

    out.push({
      ...item,
      kind,
      releaseDate: dateStr,
      daysUntil,
      relLabel,
      // Give the card the info it needs to draw date/S·E badges
      nextEpisode: air && air.releaseDate
        ? { ...(item.nextEpisode || {}), releaseDate: air.releaseDate, season: air.season, episode: air.episode }
        : item.nextEpisode,
      formattedRelease: relLabel,
      releaseDay: formatTMDBDate(dateStr, { weekday: "short" }, undefined, platformKey),
      releaseMonthDay: formatTMDBDate(dateStr, { month: "short", day: "numeric" }, undefined, platformKey),
      platformKey,
      platformName: platformObj?.name || item.sourceName || "TBA",
      platformColor: platformObj?.color || "#71717a",
    });
  }

  return out.sort((a, b) =>
    String(a.releaseDate).localeCompare(String(b.releaseDate)),
  );
}

/**
 * Build an "Upcoming" list from any pool of titles — enriched with kind,
 * relative labels, and release metadata. Surfaces future premiere dates and
 * next-episode airings on a rolling window.
 *
 * @returns {Array} items enriched with { kind, formattedRelease, releaseDay,
 *   releaseMonthDay, nextEpisode } sorted by release date (soonest first).
 */
export function buildUpcoming(items = [], windowDays = 90) {
  if (!items || !Array.isArray(items)) return [];

  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const end = new Date(now);
  end.setDate(now.getDate() + windowDays);
  const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;

  return buildUpcomingInRange(items, todayStr, endStr);
}

// ─── Countdown Timer ────────────────────────────────────────────────────────

/**
 * Calculate countdown to a release date.
 * Returns a human-readable countdown string and numeric values.
 *
 * @param {string} releaseDate - YYYY-MM-DD
 * @param {string} platform - Platform key for timezone handling
 * @returns {Object} { text, days, hours, minutes, isReleased, isToday }
 */
export function getCountdown(releaseDate, platform) {
  if (!releaseDate) return { text: "", days: 0, hours: 0, minutes: 0, isReleased: true, isToday: false };

  const now = new Date();
  const release = new Date(releaseDate + "T00:00:00Z");
  const diff = release.getTime() - now.getTime();

  if (diff <= 0) {
    return { text: "Available Now", days: 0, hours: 0, minutes: 0, isReleased: true, isToday: false };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  const timeUntil = getTimeUntil(releaseDate, undefined, platform);
  const isToday = timeUntil === "today";

  let text;
  if (isToday) {
    text = hours > 0 ? `In ${hours}h ${minutes}m` : `In ${minutes}m`;
  } else if (days === 1) {
    text = "Tomorrow";
  } else if (days <= 7) {
    text = `In ${days} days`;
  } else if (days <= 30) {
    text = `In ${Math.ceil(days / 7)} weeks`;
  } else {
    text = formatTMDBDate(releaseDate, { month: "short", day: "numeric" }, undefined, platform);
  }

  return { text, days, hours, minutes, isReleased: false, isToday };
}

/**
 * Get countdown urgency level for badge styling.
 */
export function getCountdownUrgency(days) {
  if (days <= 0) return "released";
  if (days <= 1) return "imminent";  // red pulse
  if (days <= 3) return "soon";      // orange
  if (days <= 7) return "upcoming";  // blue
  return "future";                    // gray
}

// ─── Leaving Soon Detection ─────────────────────────────────────────────────

/**
 * Detect content that's leaving a platform soon.
 * Uses license expiry data from the backend/API.
 *
 * @param {Array} items - Content items with leavingDate field
 * @param {number} thresholdDays - Alert threshold (default 14 days)
 * @returns {Array} Content leaving soon, sorted by urgency
 */
export function detectLeavingSoon(items = [], thresholdDays = 14) {
  if (!items || !Array.isArray(items)) return [];

  const now = new Date();
  const threshold = new Date(now);
  threshold.setDate(now.getDate() + thresholdDays);

  return items
    .filter(item => {
      if (!item.leavingDate) return false;
      const leaveDate = new Date(item.leavingDate + "T00:00:00Z");
      return leaveDate > now && leaveDate <= threshold;
    })
    .map(item => {
      const leaveDate = new Date(item.leavingDate + "T00:00:00Z");
      const daysLeft = Math.ceil((leaveDate - now) / (1000 * 60 * 60 * 24));
      const platformKey = normalizePlatformKey(item.source || item.availablePlatforms?.[0]);
      const platformName = platformKey ? PlatformAdapter.getName(platformKey) : "streaming";

      return {
        ...item,
        daysLeft,
        platformKey,
        platformName,
        urgency: daysLeft <= 3 ? "critical" : daysLeft <= 7 ? "warning" : "info",
        formattedLeaveDate: formatTMDBDate(item.leavingDate, { month: "short", day: "numeric", year: "numeric" }),
        timeUntilLeave: getTimeUntil(item.leavingDate),
        message: daysLeft <= 1
          ? `Leaving ${platformName} tomorrow!`
          : `Leaving ${platformName} in ${daysLeft} days`,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
