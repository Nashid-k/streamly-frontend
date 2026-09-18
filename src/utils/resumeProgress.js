// Normalize a stored continue-watching entry's runtime to SECONDS so the
// "N% watched" progress bar, percentage badges and time-left labels all
// compute correctly. The watch page saves `durationMins`/`runtime` as
// numbers and episode `duration` as "45m"-style strings — a raw number of
// seconds is rarely present on the stored item.
export const durationSeconds = (item) => {
  if (!item) return 0;
  if (typeof item.durationMins === "number" && item.durationMins > 0) return item.durationMins * 60;
  if (typeof item.runtime === "number" && item.runtime > 0) return item.runtime * 60;
  if (typeof item.duration === "number" && item.duration > 60) return item.duration;
  if (typeof item.duration === "string" && /^\d+/.test(item.duration.trim())) {
    const mins = parseInt(item.duration, 10);
    if (mins > 0) return mins * 60;
  }
  return 0;
};

// Percent watched with sensible floors so a fresh partial watch still shows.
export const progressPct = (item) => {
  const dur = durationSeconds(item);
  if (item.timestamp > 0 && dur > 0) {
    return Math.min(100, Math.max(1, (item.timestamp / dur) * 100));
  }
  if (item.timestamp > 0) {
    // No reliable runtime — assume a 90-minute average so the bar still moves.
    return Math.min(95, Math.max(3, (item.timestamp / 5400) * 100));
  }
  return 0;
};

export const remainingSeconds = (item) => {
  const dur = durationSeconds(item);
  if (dur > 0 && item.timestamp > 0) {
    return Math.max(0, dur - item.timestamp);
  }
  return null;
};