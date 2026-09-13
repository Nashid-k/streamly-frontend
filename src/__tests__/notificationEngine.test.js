import { describe, it, expect } from 'vitest';
import {
  buildEpisodeReleasedNotification,
  buildEpisodeAiringNotification,
  buildMovieAddedNotification,
  buildRecommendationNotification,
  buildMilestoneNotification,
  buildWelcomeNotification,
  isNotificationTypeEnabled,
  NOTIF_TYPES,
} from '../utils/notificationEngine';

describe('Notification Builders', () => {
  describe('buildEpisodeReleasedNotification', () => {
    it('generates deterministic ID (no Date.now)', () => {
      const n1 = buildEpisodeReleasedNotification({
        title: 'Test', season: 1, episode: 1, platform: 'netflix', movieId: '123',
      });
      const n2 = buildEpisodeReleasedNotification({
        title: 'Test', season: 1, episode: 1, platform: 'netflix', movieId: '123',
      });
      expect(n1.id).toBe(n2.id);
      expect(n1.id).toBe('ep-released-123-s1e1');
    });

    it('includes required fields', () => {
      const n = buildEpisodeReleasedNotification({
        title: 'Stranger Things', season: 4, episode: 1, platform: 'netflix', movieId: '456',
      });
      expect(n.type).toBe(NOTIF_TYPES.EPISODE_RELEASED);
      expect(n.title).toContain('New Episode');
      expect(n.message).toContain('Stranger Things');
      expect(n.message).toContain('Season 4');
      expect(n.link).toBe('/watch/456');
      expect(n.isRead).toBe(false);
    });
  });

  describe('buildEpisodeAiringNotification', () => {
    it('generates deterministic ID', () => {
      const n = buildEpisodeAiringNotification({
        title: 'Test', season: 2, episode: 3, platform: 'prime', movieId: '789',
        releaseDate: '2026-09-10',
      });
      expect(n.id).toBe('ep-airing-789-s2e3');
    });
  });

  describe('buildMovieAddedNotification', () => {
    it('generates deterministic ID', () => {
      const n1 = buildMovieAddedNotification({ title: 'Inception', movieId: '111' });
      const n2 = buildMovieAddedNotification({ title: 'Inception', movieId: '111' });
      expect(n1.id).toBe(n2.id);
      expect(n1.id).toBe('added-111');
    });

    it('uses series type for TV shows', () => {
      const n = buildMovieAddedNotification({ title: 'Breaking Bad', movieId: '222', isSeries: true });
      expect(n.type).toBe(NOTIF_TYPES.SERIES_ADDED);
    });

    it('uses movie type for movies', () => {
      const n = buildMovieAddedNotification({ title: 'Inception', movieId: '333', isSeries: false });
      expect(n.type).toBe(NOTIF_TYPES.MOVIE_ADDED);
    });
  });

  describe('buildRecommendationNotification', () => {
    it('generates deterministic ID', () => {
      const n = buildRecommendationNotification({
        title: 'Interstellar', reason: 'Inception', movieId: '444',
      });
      expect(n.id).toBe('rec-444');
    });
  });

  describe('buildMilestoneNotification', () => {
    it('generates deterministic ID with count', () => {
      const n1 = buildMilestoneNotification({ type: 'list_milestone', count: 10 });
      const n2 = buildMilestoneNotification({ type: 'list_milestone', count: 10 });
      expect(n1.id).toBe(n2.id);
      expect(n1.id).toBe('milestone-list_milestone-10');
    });

    it('different counts produce different IDs', () => {
      const n1 = buildMilestoneNotification({ type: 'list_milestone', count: 10 });
      const n2 = buildMilestoneNotification({ type: 'list_milestone', count: 25 });
      expect(n1.id).not.toBe(n2.id);
    });
  });

describe('buildWelcomeNotification', () => {
  it('generates deterministic ID based on sign-in state', () => {
    const n1 = buildWelcomeNotification({ isSignedIn: true });
    const n2 = buildWelcomeNotification({ isSignedIn: true });
    expect(n1.id).toBe(n2.id);
    expect(n1.id).toBe('welcome-in');
  });

  it('different sign-in states produce different IDs', () => {
    const signedIn = buildWelcomeNotification({ isSignedIn: true });
    const signedOut = buildWelcomeNotification({ isSignedIn: false });
    expect(signedIn.id).not.toBe(signedOut.id);
  });

  it('includes correct link based on sign-in state', () => {
    const signedIn = buildWelcomeNotification({ isSignedIn: true });
    const signedOut = buildWelcomeNotification({ isSignedIn: false });
    expect(signedIn.link).toBe('/');
    expect(signedOut.link).toBeNull();
  });
});

describe('Notification edge cases', () => {
  it('buildEpisodeReleasedNotification handles missing optional fields', () => {
    const n = buildEpisodeReleasedNotification({
      title: 'Test', season: 1, episode: 1, movieId: '1',
    });
    expect(n.platform).toBeTruthy();
    expect(n.message).toContain('Test');
  });

  it('buildMovieAddedNotification handles null platform', () => {
    const n = buildMovieAddedNotification({ title: 'Test', movieId: '1' });
    expect(n.type).toBe(NOTIF_TYPES.MOVIE_ADDED);
  });

  it('buildRecommendationNotification handles null platform', () => {
    const n = buildRecommendationNotification({ title: 'Test', reason: 'X', movieId: '1' });
    expect(n.type).toBe(NOTIF_TYPES.RECOMMENDATION);
  });

  it('all builders produce objects with required fields', () => {
    const builders = [
      () => buildEpisodeReleasedNotification({ title: 'T', season: 1, episode: 1, movieId: '1' }),
      () => buildEpisodeAiringNotification({ title: 'T', season: 1, episode: 1, movieId: '1', releaseDate: '2026-09-10' }),
      () => buildMovieAddedNotification({ title: 'T', movieId: '1' }),
      () => buildRecommendationNotification({ title: 'T', reason: 'R', movieId: '1' }),
      () => buildMilestoneNotification({ type: 'test', count: 5 }),
      () => buildWelcomeNotification({ isSignedIn: true }),
    ];

    builders.forEach(builder => {
      const n = builder();
      expect(n).toHaveProperty('id');
      expect(n).toHaveProperty('type');
      expect(n).toHaveProperty('title');
      expect(n).toHaveProperty('message');
      expect(n).toHaveProperty('createdAt');
      expect(n).toHaveProperty('isRead');
      expect(n.isRead).toBe(false);
    });
  });
});
});

describe('isNotificationTypeEnabled', () => {
  it('returns true for unknown types (default allow)', () => {
    expect(isNotificationTypeEnabled('unknown_type')).toBe(true);
  });

  it('returns correct values for known types', () => {
    // Default prefs: episodeReleased=true, movieAdded=false
    expect(isNotificationTypeEnabled(NOTIF_TYPES.EPISODE_RELEASED)).toBe(true);
    expect(isNotificationTypeEnabled(NOTIF_TYPES.MOVIE_ADDED)).toBe(false);
    expect(isNotificationTypeEnabled(NOTIF_TYPES.SERIES_ADDED)).toBe(false);
  });

  it('handles all notification types', () => {
    Object.values(NOTIF_TYPES).forEach(type => {
      const result = isNotificationTypeEnabled(type);
      expect(typeof result).toBe('boolean');
    });
  });
});
