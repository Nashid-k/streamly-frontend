import React, { useState, useEffect } from "react";
import { EASE_OUT } from "../constants/motion";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, Zap } from "lucide-react";
import { getCountdown, getCountdownUrgency } from "../utils/releaseCalendar";

/**
 * CountdownBadge — "In 3 days" / "Tomorrow" / "In 2 weeks" on a poster.
 *
 * Every countdown is a GLASS pill (styles/ui-kit.css `.content-badge`): the
 * urgency sets the ink, and the ring is the only difference between "out
 * imminently" (red + pulse + Zap) and "out in a few days" (amber) or "weeks"
 * (violet). The solid accent fill belongs to ContentTag's NEW, so a red-accent
 * theme cannot make "just released" and "out in 5 hours" the same object.
 */
const TONE_BY_URGENCY = {
  imminent: "imminent",
  soon: "soon",
  upcoming: "upcoming",
};

// One shared minute ticker for all mounted CountdownBadges instead of N
// independent setIntervals; starts on first subscriber, stops when empty,
// and skips hidden tabs.
const minuteSubscribers = new Set();
let sharedMinuteTimer = null;

function subscribeMinuteTick(listener) {
  minuteSubscribers.add(listener);
  if (!sharedMinuteTimer) {
    sharedMinuteTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      for (const fn of minuteSubscribers) fn();
    }, 60000);
  }
  return () => {
    minuteSubscribers.delete(listener);
    if (minuteSubscribers.size === 0 && sharedMinuteTimer) {
      clearInterval(sharedMinuteTimer);
      sharedMinuteTimer = null;
    }
  };
}

export default function CountdownBadge({ releaseDate, platform, compact = false }) {
  const [countdown, setCountdown] = useState(() => getCountdown(releaseDate, platform));
  const reduceMotion = useReducedMotion();

  // Update every minute for live countdown via the shared module ticker
  useEffect(() => {
    if (!releaseDate || countdown.isReleased) return undefined;
    return subscribeMinuteTick(() => {
      setCountdown(getCountdown(releaseDate, platform));
    });
  }, [releaseDate, platform, countdown.isReleased]);

  if (!releaseDate || countdown.isReleased) return null;

  // A release under 24h out floors to 0 days, which getCountdownUrgency labels
  // "released" (dull grey). It is the opposite of released — treat it as imminent.
  const urgency = countdown.underADay
    ? "imminent"
    : getCountdownUrgency(countdown.days);

  // Past four weeks getCountdown switches to a plain date ("Nov 4"), so the
  // four-week violet would be flagging a fact the label no longer states.
  const tone =
    TONE_BY_URGENCY[urgency] ||
    (countdown.days <= 30 ? "weeks" : "later");
  const pulse = urgency === "imminent" && !reduceMotion;

  return (
    <motion.div
      className={`content-badge${compact ? "" : " content-badge--md"} content-badge--${tone}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      title={`Releases ${countdown.text}`}
    >
      {pulse && (
        // Compositor-only pulse ring (opacity + scale) — same "ping" look as
        // the old box-shadow keyframes but without per-frame paint.
        <span aria-hidden="true" className="countdown-badge-ring" />
      )}
      {urgency === "imminent" ? (
        <Zap size={compact ? 8 : 10} fill="currentColor" stroke="none" />
      ) : (
        <Clock size={compact ? 8 : 10} />
      )}
      {countdown.text}
    </motion.div>
  );
}
