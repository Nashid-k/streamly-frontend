// src/utils/artwork.js — centralizes the HD-thumbnails preference so the
// Settings toggle has one place to consult instead of scattered `hdThumbs ?
// "w500" : "w342"` ternaries. Sizes follow TMDB's ladder; `hd` swaps the
// base rung up one step. Callers pass the kind of surface so the ladder can
// grow (card / rail / hero / episode) without each site re-deriving it.
const LADDER = {
  card: { low: "w342", high: "w500" },
  rail: { low: "w500", high: "w780" },
  episode: { low: "w342", high: "w500" },
  hero: { low: "w780", high: "w1280" },
  logo: { low: "w342", high: "w500" },
};

export function artworkWidth(kind, hdThumbs) {
  const rung = LADDER[kind] || LADDER.card;
  return hdThumbs === false ? rung.low : rung.high;
}

export function pickImageWidth(kind, prefs) {
  const hd = prefs?.hdThumbs !== false;
  return artworkWidth(kind, hd);
}
