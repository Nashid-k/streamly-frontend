import { describe, it, expect } from 'vitest';
import {
  buildWeeklyCalendar,
  getWeekDays,
  getCountdown,
  getCountdownUrgency,
  detectNewReleasesThisWeek,
  detectLeavingSoon,
  getAiringEpisode,
  buildUpcomingThisMonth,
  buildUpcoming,
} from '../utils/releaseCalendar';

// buildUpcomingThisMonth filters against LOCAL month boundaries, so build
// fixture dates in local calendar terms to stay robust in any TZ.
const localDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
// Today is always inside the [today, end-of-month] window by construction,
// so it is the safe in-window fixture regardless of local timezone/date.
const inWindowDate = localDateStr(now);
// Mid previous month: unambiguously before the window in every timezone.
const pastDate = localDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 5));
// Day 2 of next month: unambiguously after the window in every timezone.
const futureDate = localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 2));

describe('buildWeeklyCalendar', () => {
  it('returns calendar with all 7 days', () => {
    const calendar = buildWeeklyCalendar([]);
    expect(Object.keys(calendar)).toHaveLength(7);
    expect(calendar).toHaveProperty('Monday');
    expect(calendar).toHaveProperty('Sunday');
  });

  it('returns empty arrays for items with no releaseDate', () => {
    const calendar = buildWeeklyCalendar([{ id: '1', title: 'No Date' }]);
    const totalItems = Object.values(calendar).flat();
    expect(totalItems).toHaveLength(0);
  });

  it('places items on correct day', () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const calendar = buildWeeklyCalendar([{ id: '1', title: 'Test', releaseDate: todayStr }]);
    // Item should appear on exactly one day
    const totalItems = Object.values(calendar).flat();
    expect(totalItems.length).toBe(1);
    expect(totalItems[0].title).toBe('Test');
  });

  it('handles null/undefined items', () => {
    const calendar = buildWeeklyCalendar(null);
    expect(Object.keys(calendar)).toHaveLength(7);
  });
});

describe('getWeekDays', () => {
  it('returns 7 days', () => {
    const days = getWeekDays();
    expect(days).toHaveLength(7);
  });

  it('each day has required fields', () => {
    const days = getWeekDays();
    days.forEach(d => {
      expect(d).toHaveProperty('name');
      expect(d).toHaveProperty('fullName');
      expect(d).toHaveProperty('date');
      expect(d).toHaveProperty('isToday');
      expect(d).toHaveProperty('fullDate');
    });
  });

  it('exactly one day is today', () => {
    const days = getWeekDays();
    const todayCount = days.filter(d => d.isToday).length;
    expect(todayCount).toBe(1);
  });
});

describe('getCountdown', () => {
  it('returns empty for null date', () => {
    const result = getCountdown(null);
    expect(result.text).toBe('');
    expect(result.isReleased).toBe(true);
  });

  it('returns "Available Now" for past dates', () => {
    const result = getCountdown('2020-01-01');
    expect(result.text).toBe('Available Now');
    expect(result.isReleased).toBe(true);
  });

  it('returns meaningful text for future dates', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const dateStr = future.toISOString().split('T')[0];
    const result = getCountdown(dateStr);
    expect(result.text).toBeTruthy();
    expect(result.isReleased).toBe(false);
  });

  it('returns countdown text for tomorrow', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    const result = getCountdown(dateStr);
    expect(result.text).toBeTruthy();
    expect(result.isReleased).toBe(false);
    expect(result.days).toBeGreaterThanOrEqual(0);
  });
});

describe('getCountdownUrgency', () => {
  it('returns "released" for 0 or negative', () => {
    expect(getCountdownUrgency(0)).toBe('released');
    expect(getCountdownUrgency(-5)).toBe('released');
  });

  it('returns "imminent" for 1 day', () => {
    expect(getCountdownUrgency(1)).toBe('imminent');
  });

  it('returns "soon" for 2-3 days', () => {
    expect(getCountdownUrgency(2)).toBe('soon');
    expect(getCountdownUrgency(3)).toBe('soon');
  });

  it('returns "upcoming" for 4-7 days', () => {
    expect(getCountdownUrgency(4)).toBe('upcoming');
    expect(getCountdownUrgency(7)).toBe('upcoming');
  });

  it('returns "future" for 8+ days', () => {
    expect(getCountdownUrgency(8)).toBe('future');
    expect(getCountdownUrgency(100)).toBe('future');
  });
});

describe('detectNewReleasesThisWeek', () => {
  it('returns empty for empty input', () => {
    expect(detectNewReleasesThisWeek([])).toEqual([]);
    expect(detectNewReleasesThisWeek(null)).toEqual([]);
  });

  it('detects items released this week', () => {
    const today = new Date().toISOString().split('T')[0];
    const items = [{ id: '1', title: 'Test', releaseDate: today }];
    const result = detectNewReleasesThisWeek(items);
    expect(result.length).toBe(1);
    expect(result[0].releaseType).toBe('movie');
  });

  it('detects upcoming episodes this week', () => {
    const today = new Date().toISOString().split('T')[0];
    const items = [{
      id: '1', title: 'Test',
      nextEpisode: { season: 2, episode: 5, releaseDate: today },
    }];
    const result = detectNewReleasesThisWeek(items);
    expect(result.length).toBe(1);
    expect(result[0].releaseType).toBe('episode');
    expect(result[0].episodeInfo).toBe('S2E5');
  });

  it('excludes items from other weeks', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const items = [{ id: '1', title: 'Test', releaseDate: future.toISOString().split('T')[0] }];
    const result = detectNewReleasesThisWeek(items);
    expect(result.length).toBe(0);
  });
});

describe('detectLeavingSoon', () => {
  it('returns empty for empty input', () => {
    expect(detectLeavingSoon([])).toEqual([]);
    expect(detectLeavingSoon(null)).toEqual([]);
  });

  it('detects items leaving within threshold', () => {
    const leaving = new Date();
    leaving.setDate(leaving.getDate() + 5);
    const items = [{ id: '1', title: 'Test', leavingDate: leaving.toISOString().split('T')[0] }];
    const result = detectLeavingSoon(items, 14);
    expect(result.length).toBe(1);
    expect(result[0].daysLeft).toBeLessThanOrEqual(14);
  });

  it('excludes items leaving after threshold', () => {
    const leaving = new Date();
    leaving.setDate(leaving.getDate() + 30);
    const items = [{ id: '1', title: 'Test', leavingDate: leaving.toISOString().split('T')[0] }];
    const result = detectLeavingSoon(items, 14);
    expect(result.length).toBe(0);
  });

  it('excludes items with no leavingDate', () => {
    const items = [{ id: '1', title: 'Test' }];
    const result = detectLeavingSoon(items);
    expect(result.length).toBe(0);
  });

  it('sorts by daysLeft ascending', () => {
    const d1 = new Date(); d1.setDate(d1.getDate() + 2);
    const d2 = new Date(); d2.setDate(d2.getDate() + 10);
    const items = [
      { id: '1', title: 'Later', leavingDate: d2.toISOString().split('T')[0] },
      { id: '2', title: 'Sooner', leavingDate: d1.toISOString().split('T')[0] },
    ];
    const result = detectLeavingSoon(items, 14);
    expect(result[0].title).toBe('Sooner');
    expect(result[1].title).toBe('Later');
  });
});

describe('getAiringEpisode', () => {
  it('returns null for missing input', () => {
    expect(getAiringEpisode(null)).toBeNull();
    expect(getAiringEpisode({})).toBeNull();
  });

  it('resolves nextEpisode for a series', () => {
    const item = {
      id: 'tmdb-tv-1',
      isSeries: true,
      nextEpisode: { releaseDate: '2026-09-10', season: 2, episode: 5 },
    };
    const result = getAiringEpisode(item);
    expect(result.releaseDate).toBe('2026-09-10');
    expect(result.season).toBe(2);
    expect(result.episode).toBe(5);
    expect(result.episodeLabel).toBe('S2 E5');
  });

  it('handles backend seasonNumber/episodeNumber shape', () => {
    const item = {
      id: 'tmdb-tv-2',
      isSeries: true,
      nextEpisode: { releaseDate: '2026-09-12', seasonNumber: 1, episodeNumber: 3 },
    };
    const result = getAiringEpisode(item);
    expect(result.season).toBe(1);
    expect(result.episode).toBe(3);
    expect(result.episodeLabel).toBe('S1 E3');
  });

  it('falls back to flat airing rows on TV items', () => {
    const item = {
      id: 'tmdb-tv-3',
      isSeries: true,
      releaseDate: '2026-09-14',
      season: 3,
      episode: 8,
    };
    const result = getAiringEpisode(item);
    expect(result.releaseDate).toBe('2026-09-14');
    expect(result.episodeLabel).toBe('S3 E8');
  });

  it('ignores releaseDate on non-TV (movie) items without nextEpisode', () => {
    const item = { id: 'm1', title: 'Film', releaseDate: '2026-09-10' };
    expect(getAiringEpisode(item)).toBeNull();
  });

  it('produces no episode label when episode number is unknown', () => {
    const item = {
      id: 'tmdb-tv-4',
      isSeries: true,
      releaseDate: '2026-09-20',
    };
    const result = getAiringEpisode(item);
    expect(result.releaseDate).toBe('2026-09-20');
    expect(result.episodeLabel).toBeNull();
  });
});

describe('buildUpcomingThisMonth', () => {
  it('returns empty for empty/invalid input', () => {
    expect(buildUpcomingThisMonth([])).toEqual([]);
    expect(buildUpcomingThisMonth(null)).toEqual([]);
  });

  it('includes movie premieres this month with kind + date info', () => {
    const items = [{
      id: 'm-premiere',
      title: 'Big Movie',
      releaseDate: inWindowDate,
      availablePlatforms: ['netflix'],
    }];
    const result = buildUpcomingThisMonth(items);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('movie');
    expect(result[0].releaseDate).toBe(inWindowDate);
    expect(result[0].formattedRelease).toBeTruthy();
    expect(result[0].releaseDay).toBeTruthy();
    expect(result[0].platformKey).toBe('netflix');
  });

  it('includes series next episodes as kind series with S/E kept', () => {
    const items = [{
      id: 'tmdb-tv-airing',
      title: 'Airing Show',
      isSeries: true,
      nextEpisode: { releaseDate: inWindowDate, season: 4, episode: 9 },
    }];
    const result = buildUpcomingThisMonth(items);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('series');
    expect(result[0].nextEpisode?.season).toBe(4);
    expect(result[0].nextEpisode?.episode).toBe(9);
  });

  it('detects anime premieres by genres/tags/isAnime', () => {
    const viaGenres = {
      id: 'a1', title: 'Anime Film', releaseDate: inWindowDate, genres: ['Animation', 'anime'],
    };
    const viaFlag = {
      id: 'a2', title: 'Anime Series', isSeries: true, isAnime: true,
      releaseDate: inWindowDate,
    };
    const result = buildUpcomingThisMonth([viaGenres, viaFlag]);
    expect(result.find((r) => r.id === 'a1')?.kind).toBe('anime');
    expect(result.find((r) => r.id === 'a2')?.kind).toBe('anime');
  });

  it('excludes past and next-month releases', () => {
    const items = [
      { id: 'old', title: 'Old', releaseDate: pastDate },
      { id: 'later', title: 'Later', releaseDate: futureDate },
    ];
    const result = buildUpcomingThisMonth(items);
    expect(result).toHaveLength(0);
  });

  it('dedupes same id+kind+date and sorts soonest first', () => {
    const items = [
      { id: 'd1', title: 'Same', releaseDate: inWindowDate },
      { id: 'd1', title: 'Same Dupe', releaseDate: inWindowDate },
    ];
    const result = buildUpcomingThisMonth(items);
    expect(result).toHaveLength(1);
  });
});

// ─── buildUpcoming (rolling 365-day "Coming Soon" window) ──────────────────

// Local-calendar helpers so every fixture survives any test TZ.
const addDaysStr = (d, n) => {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
  return localDateStr(t);
};
const todayStr = localDateStr(now);
const tomorrowStr = addDaysStr(now, 1);
const in4DaysStr = addDaysStr(now, 4);
const in60DaysStr = addDaysStr(now, 60);
const in200DaysStr = addDaysStr(now, 200);
const in400DaysStr = addDaysStr(now, 400);
const in500DaysStr = addDaysStr(now, 500);
const released5dAgoStr = addDaysStr(now, -5);

// Mirrors the Home rail's "premiere-only" predicate.
const isSeriesKind = (m) =>
  Boolean(m.isSeries || m.type === 'tv' || /^tmdb-tv-/i.test(String(m.id || '')));
const premiereOnly = (m) => !isSeriesKind(m) || m.isUpcoming === true;

describe('buildUpcoming', () => {
  it('returns [] for null/undefined/empty input', () => {
    expect(buildUpcoming(null)).toEqual([]);
    expect(buildUpcoming(undefined)).toEqual([]);
    expect(buildUpcoming([])).toEqual([]);
  });

  it('silently drops rows that are null, have no id, or no date', () => {
    const items = [
      null,
      undefined,
      { id: 'no-date', title: 'TBA' },
      { title: 'No Id', releaseDate: in4DaysStr },
      {},
    ];
    expect(buildUpcoming(items)).toHaveLength(0);
  });

  it('excludes malformed and already-released dates', () => {
    const items = [
      { id: 'm1', title: 'Bad Format', releaseDate: '2026/09/30' },
      { id: 'm2', title: 'Bad Format 2', releaseDate: 'Sep 30 2026' },
      { id: 'm3', title: 'Old Movie', releaseDate: released5dAgoStr },
    ];
    expect(buildUpcoming(items)).toHaveLength(0);
  });

  it('includes future movie releases with kind movie + daysUntil + rel label', () => {
    const result = buildUpcoming([
      { id: 'm1', title: 'Future Film', releaseDate: in4DaysStr },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('movie');
    expect(result[0].releaseDate).toBe(in4DaysStr);
    expect(result[0].daysUntil).toBe(4);
    expect(result[0].relLabel).toMatch(/^[A-Z]{2,3}$/); // weekday short, e.g. MON
    expect(result[0].formattedRelease).toBe(result[0].relLabel);
  });

  it('labels TODAY and TOMORROW relative to the current date', () => {
    const result = buildUpcoming([
      { id: 't1', title: 'Drops Today', releaseDate: todayStr },
      { id: 't2', title: 'Drops Tomorrow', releaseDate: tomorrowStr },
    ]);
    expect(result.find((r) => r.id === 't1').daysUntil).toBe(0);
    expect(result.find((r) => r.id === 't1').relLabel).toBe('TODAY');
    expect(result.find((r) => r.id === 't2').daysUntil).toBe(1);
    expect(result.find((r) => r.id === 't2').relLabel).toBe('TOMORROW');
  });

  it('shows a month-day label for releases more than a week out', () => {
    const result = buildUpcoming([
      { id: 'm1', title: 'Distant Film', releaseDate: in60DaysStr },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].relLabel).toMatch(/^(\d{1,2} [A-Z][a-z]{2}|[A-Z][a-z]{2} \d{1,2})$/); // e.g. Nov 4 / 5 Nov
  });

  it('includes series within window whether premiere or next-episode', () => {
    const result = buildUpcoming([
      { id: 'tmdb-tv-1', title: 'Premiering Show', isSeries: true, releaseDate: in4DaysStr, isUpcoming: true },
      { id: 'tmdb-tv-2', title: 'Airing Show', isSeries: true, releaseDate: released5dAgoStr, nextEpisode: { releaseDate: in4DaysStr, season: 3, episode: 8 } },
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.id, r]));
    expect(byId['tmdb-tv-1']).toBeTruthy();
    expect(byId['tmdb-tv-1'].kind).toBe('series');
    expect(byId['tmdb-tv-2']).toBeTruthy();
    expect(byId['tmdb-tv-2'].kind).toBe('series');
    expect(byId['tmdb-tv-2'].nextEpisode?.season).toBe(3);
    expect(byId['tmdb-tv-2'].nextEpisode?.episode).toBe(8);
  });

  it('excludes released series with no future next episode', () => {
    const result = buildUpcoming([
      { id: 'tmdb-tv-3', title: 'Old Show', isSeries: true, releaseDate: released5dAgoStr },
    ]);
    expect(result).toHaveLength(0);
  });

  it('detects anime premieres from genres/tags/isAnime', () => {
    const result = buildUpcoming([
      { id: 'a1', title: 'Anime Film', releaseDate: in4DaysStr, genres: ['Animation', 'anime'] },
      { id: 'a2', title: 'Anime Series', isSeries: true, isAnime: true, releaseDate: in4DaysStr, isUpcoming: true },
    ]);
    expect(result.find((r) => r.id === 'a1').kind).toBe('anime');
    expect(result.find((r) => r.id === 'a2').kind).toBe('anime');
  });

  it('dedupes same id+kind+date across the pool', () => {
    const items = [
      { id: 'x', title: 'Dup A', releaseDate: in4DaysStr },
      { id: 'x', title: 'Dup B', releaseDate: in4DaysStr },
    ];
    const result = buildUpcoming(items);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Dup A');
  });

  it('sorts results soonest-first', () => {
    const result = buildUpcoming([
      { id: 'm1', title: 'Later', releaseDate: in60DaysStr },
      { id: 'm2', title: 'Soon', releaseDate: tomorrowStr },
      { id: 'm3', title: 'Soonest', releaseDate: todayStr },
    ]);
    expect(result.map((r) => r.title)).toEqual(['Soonest', 'Soon', 'Later']);
  });

  it('respects a custom window and drops un-flagged titles beyond it', () => {
    const items = [
      { id: 'm1', title: 'In Window', releaseDate: in200DaysStr },
      { id: 'm2', title: 'Beyond, not flagged', releaseDate: in400DaysStr },
    ];
    const result = buildUpcoming(items, 365);
    expect(result.map((r) => r.id)).toEqual(['m1']);
  });

  it('keeps isUpcoming-flagged items even beyond the window end', () => {
    const result = buildUpcoming(
      [{ id: 'm1', title: 'Far Off Premiere', releaseDate: in500DaysStr, isUpcoming: true }],
      365,
    );
    expect(result).toHaveLength(1);
    expect(result[0].daysUntil).toBeGreaterThan(365);
  });

  it('does not require artwork at util level (Home enforces imagery)', () => {
    const result = buildUpcoming([
      { id: 'm1', title: 'No Poster Yet', releaseDate: in4DaysStr },
    ]);
    expect(result).toHaveLength(1);
  });

  it('simulates the Home premiere-only rail pipeline:', () => {
    // Released film, airing series' next episode, premiere series, premiere film.
    const items = [
      { id: 'tmdb-movie-550', title: 'Fight Club', releaseDate: '1999-10-15' },
      { id: 'tmdb-tv-air', title: 'Airing Show', isSeries: true, releaseDate: released5dAgoStr, nextEpisode: { releaseDate: in4DaysStr, season: 1, episode: 2 }, isUpcoming: false },
      { id: 'tmdb-tv-new', title: 'New Series', isSeries: true, releaseDate: tomorrowStr, isUpcoming: true },
      { id: 'tmdb-movie-new', title: 'New Film', releaseDate: tomorrowStr, isUpcoming: true },
    ];
    const rail = buildUpcoming(items).filter(premiereOnly);
    // Fight Club is released, the airing show is not a premiere → both gone.
    expect(rail.map((r) => r.id)).toEqual(['tmdb-tv-new', 'tmdb-movie-new']);
    expect(rail.every((r) => r.daysUntil >= 0)).toBe(true);
  });
});
