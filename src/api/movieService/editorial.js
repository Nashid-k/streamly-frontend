import tmdb from '../tmdbClient';
import { logEmptyData, logWarn } from '../../utils/debugLogger';
import { logServiceError, warnIfEmpty } from './core';
import { normalizeResult } from './normalize';

// Ordered home editorial rows — the rows render top→bottom; an empty result
// simply hides a row. Keyword ids are resolved at runtime (never hardcoded).
export const EDITORIAL_RAILS = [
  { key: 'top-rated-editors', label: 'Top Rated Movies & Series', sort: { field: 'vote_count.desc', voteCountGte: 2000 }, types: ['movie', 'tv'] },
  { key: 'award-winning', label: 'Award Winning Movies & Shows', keywords: ['award-winning', 'award winner'], types: ['movie', 'tv'] },
  { key: 'oscar-nominees', label: 'Oscar Nominees', keywords: ['oscar winner', 'oscar'], types: ['movie'] },
  { key: 'psychological-thrillers', label: 'Psychological Thrillers', keywords: ['psychological thriller'], types: ['movie', 'tv'] },
  { key: 'cannes-film-festival', label: 'Cannes Film Festival', keywords: ['cannes'], types: ['movie'] },
  { key: 'top-100-halloween', label: 'Top 100 Halloween Movies', keywords: ['halloween'], types: ['movie'] },
  { key: 'rotten-tomatoes-best', label: 'Rotten Tomatoes Best Movies', sort: { field: 'vote_average.desc', voteCountGte: 500 }, types: ['movie'] },
  { key: 'mindfuck-movies', label: 'Mindf*ck Movies', keywords: ['mindfuck', 'mind f*ck'], types: ['movie'] },
  { key: 'based-on-true-story', label: 'Based on a True Story', keywords: ['based on true story', 'true story'], types: ['movie', 'tv'] },
];

/* Keyword → keyword-id resolution: TMDB has no static id list here, so we
   search once, cache per phrase, and match exact-ish or accept the top hit. */
const editorKeywordCache = new Map();
async function resolveEditorialKeyword(candidates) {
  for (const q of candidates) {
    const lower = String(q).toLowerCase().replace(/\*/g, '').trim();
    if (!lower) continue;
    if (editorKeywordCache.has(lower)) {
      const cached = editorKeywordCache.get(lower);
      return cached || null;
    }
    try {
      const data = await tmdb('/search/keyword', { query: lower });
      const list = (data.results || []);
      const normalized = list.map((k) => ({ id: k.id, name: (k.name || '').toLowerCase() }));
      const exact = normalized.find((k) => k.name === lower);
      const fuzzy = normalized.find((k) => k.name.includes(lower));
      const chosen = exact || fuzzy || normalized[0];
      editorKeywordCache.set(lower, chosen ? String(chosen.id) : '');
      if (chosen) return String(chosen.id);
    } catch (error) {
      logServiceError('resolveEditorialKeyword', error, { query: lower });
      editorKeywordCache.set(lower, '');
    }
  }
  return null;
}

// ── Editorial curated rails (Cinejoy-style rows) ─────────────────────────
// Keyword-keyed rails resolve their TMDB keyword ids once (cached in a
// module-level map) then run /discover with with_keywords so every row the
// catalog can fill is genuinely curated. Sort-mode rails ("Top Rated",
// "Rotten Tomatoes Best") just use sort_by + a vote-count floor. Rows with
// no resolvable keyword or no results return [] — the rail hides itself.
export const getEditorialRail = async (key) => {
  const cfg = EDITORIAL_RAILS.find((r) => r.key === key);
  if (!cfg) {
    logWarn('movieService', `getEditorialRail: unknown rail key "${key}" — returning [].`, { key });
    return [];
  }

  const byType = async (mt) => {
    const params = { include_adult: 'false', include_video: 'false' };
    if (cfg.keywords) {
      const keywordId = await resolveEditorialKeyword(cfg.keywords);
      if (!keywordId) {
        logEmptyData('movieService', `getEditorialRail[${key}]: no TMDB keyword resolved for "${cfg.keywords.join(' / ')}".`, { key, keywords: cfg.keywords });
        return [];
      }
      params.with_keywords = String(keywordId);
      params.sort_by = 'popularity.desc';
      params.vote_count_gte = 10;
    } else {
      params.sort_by = cfg.sort.field;
      params.vote_count_gte = cfg.sort.voteCountGte;
    }
    let data = await tmdb(`/discover/${mt}`, params);
    // Sparse keyword catalogs (festival/niche tags) can sink a strict vote
    // floor to zero rows. Remove the floor (English fallback) so the rail
    // still surfaces whatever the matched keyword actually has.
    if (cfg.keywords && !(data.results || []).length) {
      delete params.vote_count_gte;
      params.language = 'en';
      data = await tmdb(`/discover/${mt}`, params);
    }
    return (data.results || []).map((r) =>
      normalizeResult({ ...r, media_type: mt }),
    );
  };

  try {
    const grouped = await Promise.all(
      (cfg.types || ['movie']).filter(Boolean).map(async (mt) => {
        try {
          return await byType(mt);
        } catch (error) {
          // A failed type must not blank the whole rail — log and return []
          // so the other types still render (rows hide themselves when empty).
          logServiceError(`getEditorialRail[${key}][${mt}]`, error, { key });
          return [];
        }
      }),
    );
    const out = [];
    const max = grouped.reduce((m, g) => Math.max(m, g.length), 0);
    for (let i = 0; i < max; i++) {
      for (const g of grouped) if (g[i]) out.push(g[i]);
    }
    warnIfEmpty('getEditorialRail', out, { key });
    return out.slice(0, 24);
  } catch (error) {
    logServiceError('getEditorialRail', error, { key });
    throw error;
  }
};