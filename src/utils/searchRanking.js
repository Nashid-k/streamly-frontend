/**
 * searchRanking.js — search relevance scoring.
 *
 * Tiers (Netflix/Prime/Disney+ style): exact title (100), word boundary (98),
 * prefix (95), word match (70-85), substring (40-65), weak (0-25), then
 * bonuses: genre (+8), popularity (+5), recency (+3).
 *
 * Deliberately NOT a cast/director bonus, despite this file historically
 * advertising one: TMDB's `/search/multi` payload carries no credits (the
 * detail endpoint is the only place `cast`/`director` exist, see
 * movieService/detail.js:43,49), and `normalizeResult` has no fields for them,
 * so every scorer input in this repo was a shape where the +12 branch read
 * `""`/`[]` and never fired. A bonus that cannot fire is worse than no bonus:
 * it documents a signal the ranking does not actually use. Scoring it from a
 * per-result `/credits` call would turn one search into N requests. If a future
 * caller genuinely has people data, add the branch back WITH a test that proves
 * it fires, rather than leaving dead code here.
 */

// Common genre aliases (what users type vs. what's in the data)
const GENRE_ALIASES = {
  "sci-fi": "science fiction",
  "scifi": "science fiction",
  "action": "action",
  "comedy": "comedy",
  "drama": "drama",
  "horror": "horror",
  "thriller": "thriller",
  "romance": "romance",
  "animation": "animation",
  "anime": "animation",
  "documentary": "documentary",
  "docu": "documentary",
  "fantasy": "fantasy",
  "mystery": "mystery",
  "adventure": "adventure",
  "crime": "crime",
  "war": "war",
  "western": "western",
  "musical": "music",
  "music": "music",
  "family": "family",
  "kids": "family",
  "biography": "biography",
  "biopic": "biography",
  "history": "history",
  "historical": "history",
  "reality": "reality",
  "talk show": "talk show",
  "kdrama": "drama",
  "k-drama": "drama",
  "korean drama": "drama",
};

/**
 * Score a movie's relevance to a search query.
 * @param {Object} movie - Movie/show object
 * @param {string} query - Search query
 * @returns {number} Relevance score (0-120)
 */
export function getSearchRelevance(movie, query) {
  if (!movie || !query) return 0;

  const title = (movie.title || movie.name || "").toLowerCase().trim();
  const q = query.toLowerCase().trim();

  if (!title || !q) return 0;

  let score = 0;

    // Tier 1: exact / near-exact (88-100)

  if (title === q) {
    score = 100;
  } else if (title.startsWith(q)) {
    // Word boundary check
    const afterChar = title[q.length] || "";
    const isWordBoundary = !afterChar || /[^a-z0-9]/i.test(afterChar);
    score = isWordBoundary ? 98 : 95;
  } else if (q.startsWith(title) && title.length >= 3) {
    score = 88;
  } else {
        // Tier 2: word matches (70-85)
    const queryWords = q.split(/\s+/).filter(Boolean);
    const titleWords = title.split(/\s+/);

    if (queryWords.length >= 2) {
      const matchedIndices = [];
      const allMatched = queryWords.every((qw) => {
        const idx = titleWords.findIndex(
          (tw, i) =>
            !matchedIndices.includes(i) &&
            (tw === qw || tw.includes(qw) || qw.includes(tw)),
        );
        if (idx >= 0) {
          matchedIndices.push(idx);
          return true;
        }
        return false;
      });

      if (allMatched) {
        const inOrder = matchedIndices.every(
          (v, i) => i === 0 || v > matchedIndices[i - 1],
        );
        if (inOrder) {
          const isConsecutive = matchedIndices.every(
            (v, i) => i === 0 || v === matchedIndices[i - 1] + 1,
          );
          score = isConsecutive ? 85 : 80;
        } else {
          score = 75;
        }
      }
    }

        // Tier 3: substring / partial (40-65)
    if (score === 0) {
      if (title.includes(q)) {
        score = 65;
      } else if (queryWords.length > 1) {
        const matchCount = queryWords.filter((qw) =>
          titleWords.some((tw) => tw.includes(qw) || qw.includes(tw)),
        ).length;
        const ratio = matchCount / queryWords.length;
        if (ratio >= 0.5) score = 55;
      }

      if (score === 0) {
        if (queryWords.some((qw) => titleWords.some((tw) => tw === qw))) {
          score = 45;
        } else if (
          queryWords.some((qw) =>
            titleWords.some((tw) => tw.includes(qw) || qw.includes(tw)),
          )
        ) {
          score = 40;
        }
      }
    }

        // Tier 4: weak matches (0-25)
    if (score === 0) {
      const minLen = Math.max(3, Math.floor(q.length * 0.6));
      const prefix = q.substring(0, minLen);
      if (title.includes(prefix)) score = 25;
      else if (q.length >= 3 && title.includes(q[0])) score = 10;
    }
  }

    // Genre bonus (+8) when the query names a genre ("horror", "sci-fi")
  const aliasedQuery = GENRE_ALIASES[q] || q;
  if (movie.genres && Array.isArray(movie.genres)) {
    const genresLower = movie.genres.map((g) => g.toLowerCase());
    if (
      genresLower.some(
        (g) =>
          g === aliasedQuery ||
          g.includes(aliasedQuery) ||
          aliasedQuery.includes(g),
      )
    ) {
      score += 8;
    }
  }

    // People bonus REMOVED — see the file header. Search results carry no
    // cast/director, so this block always read "" and [] and never scored.

    // Popularity bonus (+5). This used to read `movie.matchScore > 70`, which
    // was self-referential twice over: searchMovies ZEROS matchScore before
    // calling this (so it never fired there), and rankSearchResults writes
    // matchScore FROM the relevance it is about to compute (so a high score
    // bought itself a higher score). TMDB `popularity` is the independent
    // quantity this bonus was always meant to measure — it is present on every
    // normalized result (normalize.js:64).
  const popularity = Number(movie.popularity);
  if (Number.isFinite(popularity) && popularity >= 40) {
    score += 5;
  }

    // Recency bonus (+3)
  const year = movie.releaseYear || movie.year;
  if (year) {
    const currentYear = new Date().getFullYear();
    if (year >= currentYear - 1) score += 3;
    else if (year >= currentYear - 3) score += 1;
  }

  return Math.min(score, 120);
}

/** Rank search results by relevance to `query`, most relevant first. */
export function rankSearchResults(results, query) {
  if (!results || !query) return results || [];

  const q = query.toLowerCase().trim();

  return results
    .map((m) => {
      const relevance = getSearchRelevance(m, query);
      return {
        ...m,
        _relevance: relevance,
        // Details pages read movie.matchScore for the "N% match" callout —
        // surface the (0-100) relevance as that field on every ranked result.
        matchScore: Math.max(0, Math.min(100, Math.round(relevance))),
      };
    })
    .sort((a, b) => {
      // Primary: relevance score
      if (b._relevance !== a._relevance) return b._relevance - a._relevance;

      // Secondary: exact title bonus
      const aExact = (a.title || "").toLowerCase().trim() === q;
      const bExact = (b.title || "").toLowerCase().trim() === q;
      if (aExact !== bExact) return aExact ? -1 : 1;

      // Tertiary: shorter title = more likely intended match
      const aLen = (a.title || "").length;
      const bLen = (b.title || "").length;
      if (aLen !== bLen) return aLen - bLen;

      // Quaternary: IMDb rating
      return (b.imdbRating || 0) - (a.imdbRating || 0);
    });
}

/** "Did you mean" suggestions for when no exact match exists. */
export function getDidYouMean(query, results = [], threshold = 0.4) {
  if (!query || !results.length) return [];

  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];

  const suggestions = results
    .map((m) => {
      const title = (m.title || m.name || "").toLowerCase();
      if (!title) return null;

      const similarity = getStringSimilarity(q, title);
      if (similarity >= threshold && title !== q) {
        return { title: m.title || m.name, similarity, id: m.id };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  // Deduplicate by title
  const seen = new Set();
  return suggestions.filter((s) => {
    const key = s.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** String similarity via longest-common-subsequence ratio. */
function getStringSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1;

  if (longer.includes(shorter)) return shorter.length / longer.length;

  const lcsLen = longestCommonSubsequence(a, b);
  return lcsLen / longer.length;
}

function longestCommonSubsequence(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[m][n];
}
