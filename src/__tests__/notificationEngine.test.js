import { describe, it, expect } from 'vitest';
import {
  buildMovieAddedNotification,
  buildMilestoneNotification,
  buildWelcomeNotification,
  fireListMilestone,
  NOTIF_TYPES,
} from '../utils/notificationEngine';

describe('Notification Builders', () => {
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

    it('handles null platform', () => {
      const n = buildMovieAddedNotification({ title: 'Test', movieId: '1' });
      expect(n.type).toBe(NOTIF_TYPES.MOVIE_ADDED);
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

  describe('all builders produce objects with required fields', () => {
    it('each has id/type/title/message/createdAt/isRead', () => {
      const builders = [
        () => buildMovieAddedNotification({ title: 'T', movieId: '1' }),
        () => buildMilestoneNotification({ type: 'test', count: 5 }),
        () => buildWelcomeNotification({ isSignedIn: true }),
      ];
      builders.forEach((builder) => {
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

  describe('fireListMilestone', () => {
    it('fires only at thresholds', () => {
      const calls = [];
      const add = (n) => calls.push(n);
      fireListMilestone(9, add);
      fireListMilestone(10, add);
      fireListMilestone(11, add);
      expect(calls.length).toBe(1);
      expect(calls[0].id).toBe('milestone-list_milestone-10');
    });

    it('is a no-op without a function', () => {
      expect(() => fireListMilestone(10, null)).not.toThrow();
    });
  });
});
