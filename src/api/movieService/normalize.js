import { CdnImageAdapter } from '../cdnImageAdapter';

// Helper: pick the English (or any) title logo from a TMDB images payload.
// Prefers the given size (default w500), skipping the decorated "block" logos TMDB
// sometimes returns alongside the brand wordmark so the wordmark wins.
const LOGO_SIZE_SCORE = { original: 3, w500: 2, w185: 1 };
export function logoUrlFromImages(images, size = 'w500') {
  const logos = (images?.logos || []).filter((l) => {
    if (l.file_path === undefined || l.file_path === null) return false;
    const type = (l.type || '').toLowerCase();
    if (type.includes('white') && type.includes('purple')) return false;
    return true;
  });
  const best = logos.find((l) => l.iso_639_1 === 'en') || logos.find((l) => !l.iso_639_1) || logos[0];
  if (!best) return null;
  const resolvedSize = LOGO_SIZE_SCORE[size] != null ? size : 'w500';
  return CdnImageAdapter.getUrl(best.file_path, resolvedSize);
}

// Helper: US (fallback any-country) certification from an appended
// release_dates (movies) / content_ratings (TV) payload.
export function certificationFromDetail(detail, isTV) {
  if (isTV) {
    const results = detail?.content_ratings?.results || [];
    const us = results.find((r) => r.iso_3166_1 === 'US' && r.rating);
    const any = results.find((r) => r.rating);
    return (us || any)?.rating || null;
  }
  const results = detail?.release_dates?.results || [];
  const pick = (code) => {
    const entry = results.find((r) => r.iso_3166_1 === code);
    return entry?.release_dates?.find((rd) => rd.certification)?.certification || null;
  };
  return pick('US') || results
    .map((r) => (r.release_dates || []).find((rd) => rd.certification)?.certification)
    .find(Boolean) || null;
}

export function isBrowsableTitle(item) {
  return item?.media_type === 'movie' || item?.media_type === 'tv';
}

// Normalize a TMDB result to the shape the app expects
export function normalizeResult(item) {
  const isTV = item.media_type === 'tv' || (
    item.media_type == null && Boolean(item.first_air_date) && !item.release_date
  );
  const id = isTV ? `tv-${item.id}` : `movie-${item.id}`;
  return {
    id,
    tmdbId: item.id,
    title: item.title || item.name || 'Untitled',
    posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
    backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
    overview: item.overview || '',
    description: item.overview || '',
    longDescription: item.overview || '',
    imdbRating: item.vote_average ? parseFloat(item.vote_average.toFixed(1)) : null,
    year: (item.release_date || item.first_air_date || '').slice(0, 4) || null,
    isSeries: isTV,
    type: isTV ? 'tv' : 'movie',
    genres: (item.genre_ids || []).map(gid => GENRE_MAP[gid]).filter(Boolean),
    mediaType: item.media_type || (isTV ? 'tv' : 'movie'),
    popularity: item.popularity || 0,
    originalLanguage: item.original_language || null,
  };
}

const GENRE_MAP = {
  28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',
  99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',
  27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',
  878:'Sci-Fi',10770:'TV Movie',53:'Thriller',10752:'War',37:'Western',
  10759:'Action & Adventure',10762:'Kids',10763:'News',10764:'Reality',
  10765:'Sci-Fi & Fantasy',10766:'Soap',10767:'Talk',10768:'War & Politics',
};

// Original-language codes for the regional (Indian) rails — Tamil, Hindi,
// Malayalam, Telugu. The app already treats these as its regional cluster, so the
// Upcoming + Airing rails pull the same languages through /discover.
export const REGIONAL_PRIMARY_LANGUAGES = ['ta', 'hi', 'ml', 'te'];

// ── Trailer curation ────────────────────────────────────────────────────────
// "Authentic platform" rules: never dump every Clip/Featurette on the page.
// Rank trailer-family videos by prominence — Final → Official → Trailer →
// Teaser → Extended — one per rank, bounded.
const TRAILER_ORDER = ['final', 'official', 'trailer', 'teaser', 'extended'];
export function classifyTrailer(v) {
  const name = (v.name || '').toLowerCase();
  const type = (v.type || '').toLowerCase();
  if (name.includes('final')) return 'final';
  if (name.includes('official')) return 'official';
  if (name.includes('superbowl') || name.includes('super bowl') || type === 'trailer' || name.includes(' trailer')) return 'trailer';
  if (name.includes('teaser') || type === 'teaser') return 'teaser';
  if (name.includes('extended')) return 'extended';
  return null;
}

export function rankTrailerVideos(videos, limit = 4) {
  const byRank = {};
  for (const v of videos || []) {
    if (v?.site && v.site !== 'YouTube') continue;
    if (!v?.key || !String(v.key).trim()) continue;
    const rank = classifyTrailer(v);
    if (rank && !byRank[rank]) byRank[rank] = v;
  }
  return TRAILER_ORDER.map((r) => byRank[r]).filter(Boolean).slice(0, limit);
}