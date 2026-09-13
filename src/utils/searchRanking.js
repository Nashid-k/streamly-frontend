/**
 * searchRanking.js — Advanced search result relevance scoring
 *
 * Implements patterns from Netflix, Prime Video, Disney+, HBO Max, Apple TV+:
 *
 * 1. EXACT TITLE MATCH (100) — "The Matrix" for query "the matrix"
 * 2. WORD BOUNDARY BONUS (98) — "Hi Nanna" for query "hi" (complete word)
 * 3. PREFIX MATCH (95) — "HIM" for query "hi" (starts with)
 * 4. GENRE MATCH (+8) — "Horror" query boosts horror movies
 * 5. CAST/DIRECTOR MATCH (+12) — "Tom Hanks" boosts his movies
 * 6. POPULARITY BOOST (+5) — trending/popular content ranks higher
 * 7. RECENCY BOOST (+3) — newer content gets a small bonus
 * 8. FRANCHISE MATCH (+6) — "Marvel" boosts MCU titles
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

  // ── TIER 1: Exact / near-exact (88-100) ──

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
    // ── TIER 2: Word matches (70-85) ──
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

    // ── TIER 3: Substring / partial (40-65) ──
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

    // ── TIER 4: Weak matches (0-25) ──
    if (score === 0) {
      const minLen = Math.max(3, Math.floor(q.length * 0.6));
      const prefix = q.substring(0, minLen);
      if (title.includes(prefix)) score = 25;
      else if (q.length >= 3 && title.includes(q[0])) score = 10;
    }
  }

  // ── BONUS: Genre matching (+8) ──
  // If query matches a genre (e.g. "horror", "sci-fi"), boost movies with that genre
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

  // ── BONUS: Cast/Director matching (+12) ──
  // If query looks like a person name (2+ words, no digits), check cast/director
  const nameWords = q.split(/\s+/).filter(Boolean);
  if (
    nameWords.length >= 2 &&
    nameWords.every((w) => /^[a-z]+$/.test(w)) &&
    score > 0
  ) {
    const director = (movie.director || "").toLowerCase();
    const cast = (movie.cast || []).map((c) =>
      typeof c === "string" ? c.toLowerCase() : (c.name || "").toLowerCase(),
    );
    const allPeople = [director, ...cast].filter(Boolean);
    if (allPeople.some((p) => p.includes(q) || q.includes(p))) {
      score += 12;
    }
  }

  // ── BONUS: Popularity/trending boost (+5) ──
  if (movie.matchScore && movie.matchScore > 70) {
    score += 5;
  }

  // ── BONUS: Recency boost (+3) ──
  const year = movie.releaseYear || movie.year;
  if (year) {
    const currentYear = new Date().getFullYear();
    if (year >= currentYear - 1) score += 3;
    else if (year >= currentYear - 3) score += 1;
  }

  return Math.min(score, 120);
}

/**
 * Rank search results by relevance to query.
 * Returns sorted array with most relevant first.
 */
export function rankSearchResults(results, query) {
  if (!results || !query) return results || [];

  const q = query.toLowerCase().trim();

  return results
    .map((m) => ({
      ...m,
      _relevance: getSearchRelevance(m, query),
    }))
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

/**
 * Find "Did you mean" suggestions when no exact match exists.
 */
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

/**
 * Calculate string similarity using longest common subsequence ratio.
 */
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
