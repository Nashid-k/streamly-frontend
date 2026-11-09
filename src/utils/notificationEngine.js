/**
 * notificationEngine.js — notification builders for the in-app notification
 * center. Only the families that actually ship in production live here:
 * watchlist additions, watchlist milestones, and the welcome notification.
 * (Episode/airing/recommendation builders were removed — no production emitter
 * ever fired them; see the audit that preceded this cleanup.)
 */
import { getPlatformName, normalizePlatformKey } from "./platforms";

export const NOTIF_TYPES = {
  MOVIE_ADDED: "movie_added",
  SERIES_ADDED: "series_added",
  MILESTONE: "milestone",
  WELCOME: "welcome",
};

/** Watchlist addition: "Inception added — Now streaming on Netflix". */
export function buildMovieAddedNotification({ title, platform, year, duration, imageUrl, movieId, isSeries }) {
  const platformKey = normalizePlatformKey(platform);
  const platformName = getPlatformName(platform);
  const emoji = isSeries ? "📺" : "🎬";
  const typeLabel = isSeries ? "Series" : "Movie";

  const parts = [];
  if (platformName) parts.push(`Now streaming on ${platformName}`);
  if (year) parts.push(`${year}`);
  if (duration) parts.push(duration);

  return {
    id: `added-${movieId}`,
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

/** Milestone: "You've watched 50 episodes this month!". */
export function buildMilestoneNotification({ type, count, title }) {
  const messages = {
    watch_count: `You've watched ${count} titles so far. Keep exploring!`,
    binge_streak: `You're on a ${count}-day watching streak! 🔥`,
    list_milestone: `Your watchlist has grown to ${count} titles. Time to start one!`,
    rating_milestone: `You've rated ${count} titles. Your taste profile is shaping up!`,
  };

  return {
    id: `milestone-${type}-${count}`,
    type: NOTIF_TYPES.MILESTONE,
    title: title || `🎉 Milestone Reached`,
    message: messages[type] || `You've reached a new milestone!`,
    detail: null,
    link: "/watchlist",
    createdAt: Date.now(),
    isRead: false,
    priority: "low",
    actionable: false,
  };
}

/** Welcome notification. */
export function buildWelcomeNotification({ isSignedIn }) {
  return {
    id: `welcome-${isSignedIn ? "in" : "out"}`,
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

export function fireListMilestone(count, addNotification) {
  if (typeof addNotification !== "function") return;
  const thresholds = [10, 25, 50];
  if (!thresholds.includes(count)) return;
  addNotification(buildMilestoneNotification({ type: "list_milestone", count, title: "🎉 Watchlist milestone" }));
}
