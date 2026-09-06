/**
 * notificationEngine.js — Smart notification intelligence
 *
 * Generates rich, context-aware notifications for:
 *   • Episode releases (new episode of Y season released)
 *   • Upcoming episodes (Z will air on K day)
 *   • Movie additions (movie streaming on platform name)
 *   • Watchlist milestones (binge reminders, completion)
 *   • Recommendations (based on viewing patterns)
 *
 * All notifications include image thumbnails, platform badges,
 * deep-links, and categorized types for smart display.
 */

import { normalizePlatformKey, PlatformAdapter } from "../api/platformAdapter";
import { formatTMDBDate, getTMDBWeekday, getTimeUntil } from "./timezone";

// ─── Notification Types ─────────────────────────────────────────────────────

export const NOTIF_TYPES = {
  EPISODE_RELEASED: "episode_released",
  EPISODE_AIRING: "episode_airing",
  MOVIE_ADDED: "movie_added",
  MOVIE_STREAMING: "movie_streaming",
  SERIES_ADDED: "series_added",
  PLATFORM_AVAILABILITY: "platform_availability",
  WEEKLY_DIGEST: "weekly_digest",
  RECOMMENDATION: "recommendation",
  MILESTONE: "milestone",
  WELCOME: "welcome",
};

// ─── Notification Builders ──────────────────────────────────────────────────

/**
 * Create a notification for a newly released episode.
 * "Season 2 Episode 5 of Stranger Things released on Netflix"
 */
export function buildEpisodeReleasedNotification({ title, season, episode, episodeTitle, platform, releaseDate, imageUrl, movieId }) {
  const platformKey = normalizePlatformKey(platform);
  const platformName = platformKey ? PlatformAdapter.getName(platformKey) : platform || "streaming";
  const formattedDate = releaseDate ? formatTMDBDate(releaseDate, { weekday: 'long', month: 'short', day: 'numeric' }, undefined, platformKey) : "today";

  return {
    id: `ep-released-${movieId}-s${season}e${episode }`,
    type: NOTIF_TYPES.EPISODE_RELEASED,
    title: `📺 New Episode Released`,
    message: `Season ${season}, Episode ${episode}${episodeTitle ? `: "${episodeTitle}"` : ""} of ${title} is now streaming on ${platformName}.`,
    detail: `${season}x${String(episode).padStart(2, "0")} · ${formattedDate}`,
    link: `/watch/${movieId}`,
    platform: platformName,
    platformKey,
    image: imageUrl || null,
    season,
    episode,
    createdAt: Date.now(),
    isRead: false,
    priority: "high",
    actionable: true,
  };
}

/**
 * Create a notification for an upcoming episode.
 * "New episode of The Bear airs on Wednesday, Sep 10"
 */
export function buildEpisodeAiringNotification({ title, season, episode, episodeTitle, platform, releaseDate, imageUrl, movieId }) {
  const platformKey = normalizePlatformKey(platform);
  const platformName = platformKey ? PlatformAdapter.getName(platformKey) : platform || "streaming";
  const weekday = getTMDBWeekday(releaseDate, undefined, platformKey);
  const timeUntil = getTimeUntil(releaseDate, undefined, platformKey);
  const formattedDate = formatTMDBDate(releaseDate, { weekday: 'long', month: 'short', day: 'numeric' }, undefined, platformKey);

  const timeContext = timeUntil === "today" ? "later today"
    : timeUntil === "tomorrow" ? "tomorrow"
    : `in ${timeUntil.replace('in ', '')}`;

  return {
    id: `ep-airing-${movieId}-s${season}e${episode }`,
    type: NOTIF_TYPES.EPISODE_AIRING,
    title: `🔴 Upcoming Episode`,
    message: `Season ${season}, Episode ${episode}${episodeTitle ? `: "${episodeTitle}"` : ""} of ${title} will air ${timeContext} on ${platformName}.`,
    detail: `${weekday} · ${formattedDate} · ${platformName}`,
    link: `/watch/${movieId}`,
    platform: platformName,
    platformKey,
    image: imageUrl || null,
    season,
    episode,
    releaseDate,
    createdAt: Date.now(),
    isRead: false,
    priority: "medium",
    actionable: true,
  };
}

/**
 * Create a notification for a movie added to watchlist.
 * "🎬 Inception added — Now streaming on Netflix"
 */
export function buildMovieAddedNotification({ title, platform, year, duration, imageUrl, movieId, isSeries }) {
  const platformKey = normalizePlatformKey(platform);
  const platformName = platformKey ? PlatformAdapter.getName(platformKey) : null;
  const emoji = isSeries ? "📺" : "🎬";
  const typeLabel = isSeries ? "Series" : "Movie";

  const parts = [];
  if (platformName) parts.push(`Now streaming on ${platformName}`);
  if (year) parts.push(`${year}`);
  if (duration) parts.push(duration);

  return {
    id: `added-${movieId }`,
    type: isSeries ? NOTIF_TYPES.SERIES_ADDED : NOTIF_TYPES.MOVIE_ADDED,
    title: `${emoji} ${typeLabel} Added`,
    message: `${title} added to your list.${parts.length > 0 ? " " + parts.join(" · ") : ""}`,
    detail: parts.join(" · ") || null,
    link: `/watch/${movieId}`,
    platform: platformName,
    platformKey,
    image: imageUrl || null,
    createdAt: Date.now(),
    isRead: false,
    priority: "low",
    actionable: true,
  };
}

/**
 * Create a recommendation notification.
 * "💡 Because you watched Inception — Interstellar is now streaming"
 */
export function buildRecommendationNotification({ title, reason, platform, imageUrl, movieId }) {
  const platformKey = normalizePlatformKey(platform);
  const platformName = platformKey ? PlatformAdapter.getName(platformKey) : platform || null;

  return {
    id: `rec-${movieId }`,
    type: NOTIF_TYPES.RECOMMENDATION,
    title: `💡 Recommended for You`,
    message: `Because you watched ${reason}${platformName ? `, "${title}" is now streaming on ${platformName}` : `, you might like "${title}"`}.`,
    detail: platformName ? `Streaming on ${platformName}` : null,
    link: `/watch/${movieId}`,
    platform: platformName,
    platformKey,
    image: imageUrl || null,
    createdAt: Date.now(),
    isRead: false,
    priority: "low",
    actionable: true,
  };
}

/**
 * Create a milestone notification.
 * "🎉 You've watched 50 episodes this month!"
 */
export function buildMilestoneNotification({ type, count, title }) {
  const messages = {
    watch_count: `You've watched ${count} titles so far. Keep exploring!`,
    binge_streak: `You're on a ${count}-day watching streak! 🔥`,
    list_milestone: `Your watchlist has grown to ${count} titles. Time to start one!`,
    rating_milestone: `You've rated ${count} titles. Your taste profile is shaping up!`,
  };

  return {
    id: `milestone-${type}-${count }`,
    type: NOTIF_TYPES.MILESTONE,
    title: title || `🎉 Milestone Reached`,
    message: messages[type] || `You've reached a new milestone!`,
    detail: null,
    link: "/mylist",
    createdAt: Date.now(),
    isRead: false,
    priority: "low",
    actionable: false,
  };
}

/**
 * Create a welcome notification (improved).
 */
export function buildWelcomeNotification({ isSignedIn }) {
  return {
    id: `welcome-${isSignedIn ? 'in' : 'out' }`,
    type: NOTIF_TYPES.WELCOME,
    title: `👋 Welcome to Streamly!`,
    message: isSignedIn
      ? "Discover movies and series from 20+ streaming platforms — all curated in one place. Your watchlist syncs across devices."
      : "Sign in to unlock personalized notifications, sync your watchlist, and get smart episode alerts.",
    detail: null,
    link: isSignedIn ? "/" : null,
    createdAt: Date.now(),
    isRead: false,
    priority: "low",
    actionable: false,
  };
}

// ─── Notification Preferences ───────────────────────────────────────────────

export const DEFAULT_NOTIF_PREFS = {
  episodeReleased: true,
  episodeAiring: true,
  movieAdded: false, // Don't notify for own actions
  platformAvailability: true,
  weeklyDigest: true,
  recommendations: true,
  milestones: true,
  continueWatching: true,
};

export function getNotificationPrefs() {
  try {
    const stored = localStorage.getItem("streamly_notif_prefs");
    return stored ? { ...DEFAULT_NOTIF_PREFS, ...JSON.parse(stored) } : DEFAULT_NOTIF_PREFS;
  } catch {
    return DEFAULT_NOTIF_PREFS;
  }
}

export function isNotificationTypeEnabled(type) {
  const prefs = getNotificationPrefs();
  const mapping = {
    [NOTIF_TYPES.EPISODE_RELEASED]: "episodeReleased",
    [NOTIF_TYPES.EPISODE_AIRING]: "episodeAiring",
    [NOTIF_TYPES.MOVIE_ADDED]: "movieAdded",
    [NOTIF_TYPES.SERIES_ADDED]: "movieAdded",
    [NOTIF_TYPES.PLATFORM_AVAILABILITY]: "platformAvailability",
    [NOTIF_TYPES.WEEKLY_DIGEST]: "weeklyDigest",
    [NOTIF_TYPES.RECOMMENDATION]: "recommendations",
    [NOTIF_TYPES.MILESTONE]: "milestones",
    [NOTIF_TYPES.WELCOME]: "milestones",
  };
  const key = mapping[type];
  return key ? prefs[key] !== false : true;
}
