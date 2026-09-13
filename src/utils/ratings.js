export function getRatingColor(rating) {
  if (rating >= 8) return "#4ade80";
  if (rating >= 6.5) return "#fbbf24";
  if (rating > 0) return "#f87171";
  return null;
}
