/**
 * Home rail plan — the two data sources behind the home feed's rail order.
 *
 * 1. `STREAMING_PROVIDERS` drives the two provider rails ("Movies on X" /
 *    "TV Series on X"). Ids are TMDB watch-provider ids for the US catalogue
 *    (the same ids `getDiscover` already takes as `providerId`).
 * 2. `ROTATING_RAIL_DOMAINS` is the pool of "domain" rails that fill the tail
 *    of the feed. They are NOT a fixed list on screen: a deterministic,
 *    date-seeded shuffle picks ten of them per day and alternates film/TV, so
 *    the page stays fresh for a returning viewer without ever re-ordering
 *    itself mid-session (a row never moves or swaps while you are browsing —
 *    the rotation only happens when the day key changes).
 *
 * Each domain is a plain data recipe, resolved by `movieService.getDiscoverRail`
 * (see src/api/movieService/discover.js) into a TMDB /discover query. Keeping
 * them declarative means adding a domain is a one-line data change, not a new
 * component, and no rail hardcodes a request shape.
 */

export const STREAMING_PROVIDERS = Object.freeze([
  { id: 8, name: "Netflix" },
  { id: 15, name: "Hulu" },
  { id: 337, name: "Disney+" },
  { id: 9, name: "Prime Video" },
  // TMDB id 1899 is the service currently branded "Max" (it was HBO Max);
  // the legacy id 384 no longer returns a flatrate catalogue.
  { id: 1899, name: "Max" },
  { id: 350, name: "Apple TV+" },
]);

/* `sortBy`: "popular" | "top_rated" | "newest" (see getDiscoverRail).
   `genreIds` are OR'd together by the service. `decade` is expanded to a
   release-date window at request time so a rail never ages out. */
export const ROTATING_RAIL_DOMAINS = Object.freeze([
  // ── Films ────────────────────────────────────────────────────────────────
  {
    key: "movie-hidden-gems",
    label: "Hidden gems worth the hype",
    mediaType: "movie",
    sortBy: "top_rated",
    minRating: 7.5,
    minVotes: 250,
    maxVotes: 4000,
  },
  {
    key: "movie-90s-thrillers",
    label: "90s thrillers that still hold up",
    mediaType: "movie",
    genreIds: [53],
    decade: 1990,
    minVotes: 150,
  },
  {
    key: "movie-80s-action",
    label: "80s action, no apologies",
    mediaType: "movie",
    genreIds: [28],
    decade: 1980,
    minVotes: 150,
  },
  {
    key: "movie-horror",
    label: "Horror that keeps the lights on",
    mediaType: "movie",
    genreIds: [27],
    minVotes: 200,
  },
  {
    key: "movie-animation",
    label: "Animation for grown-ups",
    mediaType: "movie",
    genreIds: [16],
    minVotes: 400,
  },
  {
    key: "movie-crime",
    label: "Crime, cons and getaways",
    mediaType: "movie",
    genreIds: [80, 53],
    minVotes: 300,
  },
  {
    key: "movie-sci-fi",
    label: "Sci-fi worlds to get lost in",
    mediaType: "movie",
    genreIds: [878],
    minVotes: 400,
  },
  {
    key: "movie-romance",
    label: "Romance that earns it",
    mediaType: "movie",
    genreIds: [10749],
    minRating: 6.5,
    minVotes: 250,
  },
  {
    key: "movie-documentary",
    label: "Documentaries that stick",
    mediaType: "movie",
    genreIds: [99],
    minVotes: 60,
  },
  {
    key: "movie-korean",
    label: "Korean cinema essentials",
    mediaType: "movie",
    language: "ko",
    minVotes: 150,
  },
  {
    key: "movie-anime",
    label: "Japanese animation",
    mediaType: "movie",
    genreIds: [16],
    language: "ja",
    minVotes: 100,
  },
  {
    key: "movie-hindi",
    label: "Hindi blockbusters",
    mediaType: "movie",
    language: "hi",
    minVotes: 60,
  },
  {
    key: "movie-tamil",
    label: "Tamil favourites",
    mediaType: "movie",
    language: "ta",
    minVotes: 40,
  },
  {
    key: "movie-malayalam",
    label: "Malayalam picks",
    mediaType: "movie",
    language: "ml",
    minVotes: 30,
  },
  {
    key: "movie-long-haul",
    label: "Two-and-a-half-hour epics",
    mediaType: "movie",
    sortBy: "top_rated",
    runtimeGte: 150,
    minVotes: 500,
  },
  {
    key: "movie-westerns",
    label: "Westerns, old and new",
    mediaType: "movie",
    genreIds: [37],
    minVotes: 100,
  },
  {
    key: "movie-war",
    label: "War on film",
    mediaType: "movie",
    genreIds: [10752],
    minVotes: 200,
  },
  {
    key: "movie-family",
    label: "Family night, sorted",
    mediaType: "movie",
    genreIds: [10751],
    minVotes: 200,
  },
  {
    key: "movie-fresh",
    label: "New in cinemas and streaming",
    mediaType: "movie",
    sortBy: "newest",
    recentYears: 1,
  },

  // ── Series ───────────────────────────────────────────────────────────────
  {
    key: "tv-prestige-drama",
    label: "Prestige drama, binge-ready",
    mediaType: "tv",
    genreIds: [18],
    minRating: 7.5,
    minVotes: 250,
  },
  {
    key: "tv-comedy",
    label: "Comedies to run in the background",
    mediaType: "tv",
    genreIds: [35],
    minVotes: 200,
  },
  {
    key: "tv-crime",
    label: "Crime series and slow burns",
    mediaType: "tv",
    genreIds: [80],
    minVotes: 150,
  },
  {
    key: "tv-sci-fi",
    label: "Sci-fi and fantasy series",
    mediaType: "tv",
    genreIds: [10765],
    minVotes: 200,
  },
  {
    key: "tv-kdrama",
    label: "K-dramas to start tonight",
    mediaType: "tv",
    genreIds: [18],
    language: "ko",
    minVotes: 50,
  },
  {
    key: "tv-anime",
    label: "Anime series worth the queue",
    mediaType: "tv",
    genreIds: [16],
    language: "ja",
    minVotes: 100,
  },
  {
    key: "tv-reality",
    label: "Reality and competition",
    mediaType: "tv",
    genreIds: [10764],
    minVotes: 20,
  },
  {
    key: "tv-documentary",
    label: "Documentary series",
    mediaType: "tv",
    genreIds: [99],
    minVotes: 30,
  },
  {
    key: "tv-mystery",
    label: "Mystery and whodunnit",
    mediaType: "tv",
    genreIds: [9648],
    minVotes: 150,
  },
  {
    key: "tv-kids",
    label: "Kids and family series",
    mediaType: "tv",
    genreIds: [10762],
    minVotes: 50,
  },
  {
    key: "tv-all-time",
    label: "The best-rated series ever made",
    mediaType: "tv",
    sortBy: "top_rated",
    minVotes: 1500,
  },
  {
    key: "tv-fresh",
    label: "New seasons, just landed",
    mediaType: "tv",
    sortBy: "newest",
    recentYears: 1,
  },
]);

/* ── Seeded rotation ────────────────────────────────────────────────────────
   A hash → PRNG pair instead of Math.random(): the same calendar day always
   yields the same ten rails (so re-mounting, navigating back, or React
   StrictMode double-rendering cannot reshuffle the home feed), and tomorrow
   yields a different set. */

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The rotation key — one rail set per local calendar day. */
export function homeRailDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Ten domain recipes for `date`, alternating film/series rails. Deterministic
 * for a given day key; `count` only exists so tests can ask for fewer.
 */
export function pickHomeRailDomains(date = new Date(), count = 10) {
  const rng = mulberry32(hashSeed(homeRailDayKey(date)));
  const shuffled = shuffle(ROTATING_RAIL_DOMAINS, rng);
  const films = shuffled.filter((d) => d.mediaType === "movie");
  const series = shuffled.filter((d) => d.mediaType === "tv");
  const filmsFirst = rng() < 0.5;
  const picked = [];
  // Alternate film/series while both queues have entries, then drain whichever
  // is left. Guarantees the ten rails never clump into a same-medium run.
  while (picked.length < count && (films.length > 0 || series.length > 0)) {
    const wantFilm = filmsFirst ? picked.length % 2 === 0 : picked.length % 2 === 1;
    const primary = wantFilm ? films : series;
    const secondary = wantFilm ? series : films;
    const next = primary.length > 0 ? primary.shift() : secondary.shift();
    if (next) picked.push(next);
  }
  return picked;
}

/** Expand a recipe's declarative windows into the concrete request fields. */
export function resolveRailRequest(domain, today = new Date()) {
  const year = today.getFullYear();
  const request = {
    mediaType: domain.mediaType,
    genreIds: domain.genreIds,
    sortBy: domain.sortBy,
    minVotes: domain.minVotes,
    maxVotes: domain.maxVotes,
    minRating: domain.minRating,
    language: domain.language,
    runtimeGte: domain.runtimeGte,
    runtimeLte: domain.runtimeLte,
  };
  if (domain.decade) {
    request.fromYear = domain.decade;
    request.toYear = domain.decade + 9;
  } else if (domain.recentYears) {
    request.fromYear = year - domain.recentYears;
    request.toYear = year;
  }
  return request;
}
