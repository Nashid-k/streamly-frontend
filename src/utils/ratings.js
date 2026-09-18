export function getRatingColor(rating) {
  if (rating >= 8) return "#4ade80";
  if (rating >= 6.5) return "#fbbf24";
  if (rating > 0) return "#f87171";
  return null;
}

// Finer color ladder for the per-episode ratings table — green → light
// green → yellow → orange → red, so a season's episode scores read as a
// heat scale at a glance.
export function getScoreColor(rating) {
  if (rating >= 8.5) return "#22c55e";
  if (rating >= 8) return "#4ade80";
  if (rating >= 7) return "#86efac";
  if (rating >= 6.5) return "#fbbf24";
  if (rating >= 6) return "#fb923c";
  if (rating > 0) return "#f87171";
  return null;
}
