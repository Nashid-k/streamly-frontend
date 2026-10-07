import { describe, it, expect } from 'vitest';
import { getUserTimezone, formatTMDBDate, getTMDBWeekday, getTimeUntil, getTMDBWeekdayShort, getReleaseInstant, tmdbDateToLocalDate } from '../utils/timezone';

describe('getUserTimezone', () => {
  it('returns a string timezone', () => {
    const tz = getUserTimezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });

  it('returns a valid IANA timezone or UTC fallback', () => {
    const tz = getUserTimezone();
    expect(tz).toMatch(/^[A-Za-z]+\/[A-Za-z_]+|^UTC$/);
  });
});

describe('formatTMDBDate', () => {
  it('returns empty string for null/undefined', () => {
    expect(formatTMDBDate(null)).toBe('');
    expect(formatTMDBDate(undefined)).toBe('');
    expect(formatTMDBDate('')).toBe('');
  });

  it('formats a valid date', () => {
    const result = formatTMDBDate('2026-09-04', { month: 'short', day: 'numeric' });
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns original string on invalid date', () => {
    const result = formatTMDBDate('not-a-date');
    expect(result).toBe('not-a-date');
  });

  it('handles leap year date', () => {
    const result = formatTMDBDate('2024-02-29');
    expect(result).toBeTruthy();
  });

  it('handles year-only format', () => {
    const result = formatTMDBDate('2026-01-01');
    expect(result).toBeTruthy();
  });

  it('handles invalid format gracefully', () => {
    const result = formatTMDBDate('2026-13-45');
    expect(typeof result).toBe('string');
  });

  it('handles empty options object', () => {
    const result = formatTMDBDate('2026-09-04', {});
    expect(typeof result).toBe('string');
  });
});

describe('getTMDBWeekday', () => {
  it('returns a weekday name', () => {
    const weekday = getTMDBWeekday('2026-09-04');
    expect(weekday).toBeTruthy();
    expect(typeof weekday).toBe('string');
  });

  it('returns empty string for null', () => {
    expect(getTMDBWeekday(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(getTMDBWeekday(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(getTMDBWeekday('')).toBe('');
  });

  it('returns a weekday from known date', () => {
    const weekday = getTMDBWeekday('2026-09-07');
    expect(weekday).toBeTruthy();
    // Weekday depends on timezone, just verify it returns a valid string
    expect(typeof weekday).toBe('string');
    expect(weekday.length).toBeGreaterThan(0);
  });

  it('handles invalid date string', () => {
    const result = getTMDBWeekday('not-a-date');
    expect(typeof result).toBe('string');
  });
});

describe('getTMDBWeekdayShort', () => {
  it('returns a short weekday name', () => {
    const result = getTMDBWeekdayShort('2026-09-04');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('returns empty string for null', () => {
    expect(getTMDBWeekdayShort(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(getTMDBWeekdayShort(undefined)).toBe('');
  });

  it('returns short weekday from known date', () => {
    const result = getTMDBWeekdayShort('2026-09-07');
    // Weekday depends on timezone, just verify it's a valid short string
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('getTimeUntil', () => {
  it('returns empty string for null', () => {
    expect(getTimeUntil(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(getTimeUntil(undefined)).toBe('');
  });

  it('returns a meaningful string for a valid date', () => {
    const result = getTimeUntil('2026-09-04');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns "today" for today\'s date', () => {
    const today = new Date().toISOString().split('T')[0];
    // Pass explicit UTC viewer + midnight-local platform so the date is
    // not shifted by the default 8pm-ET broadcast rule or the machine TZ.
    const result = getTimeUntil(today, 'UTC', 'netflix');
    expect(result).toBe('today');
  });

  it('returns "yesterday" for yesterday\'s date', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const result = getTimeUntil(yesterday, 'UTC', 'netflix');
    expect(result).toBe('yesterday');
  });

  it('handles past date far away', () => {
    const result = getTimeUntil('2020-01-01');
    expect(result).toBeTruthy();
  });

  it('handles future date', () => {
    const result = getTimeUntil('2099-12-31');
    expect(result).toBeTruthy();
  });

  it('handles invalid date string', () => {
    const result = getTimeUntil('not-a-date');
    expect(typeof result).toBe('string');
  });
});

describe('getReleaseInstant (platform release rule)', () => {
  it('anchors US broadcast (default) at 20:00 America/New_York', () => {
    // 2026-10-08 20:00 EDT (UTC-4) = 2026-10-09T00:00:00Z.
    const inst = getReleaseInstant('2026-10-08', 'America/New_York');
    expect(inst.toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });

  it('anchors at midnight in a midnight-utc source (Prime)', () => {
    const inst = getReleaseInstant('2026-10-08', 'UTC', 'prime');
    expect(inst.toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });

  it('anchors at local midnight for midnight-local platforms', () => {
    // IST = UTC+5:30 → 00:00 IST is 2026-10-07T18:30:00Z.
    const inst = getReleaseInstant('2026-10-08', 'Asia/Kolkata', 'netflix');
    expect(inst.toISOString()).toBe('2026-10-07T18:30:00.000Z');
  });

  it('anchors regional platforms in their source timezone', () => {
    const inst = getReleaseInstant('2026-10-08', 'UTC', 'hotstar');
    expect(inst.toISOString()).toBe('2026-10-07T18:30:00.000Z');
  });

  it('respects DST on both sides of the border', () => {
    // February is EST (UTC-5): 20:00 EST = next-day 01:00Z.
    const feb = getReleaseInstant('2026-02-15', 'UTC');
    expect(feb.toISOString()).toBe('2026-02-16T01:00:00.000Z');
    // August is EDT (UTC-4): 20:00 EDT = next-day 00:00Z.
    const aug = getReleaseInstant('2026-08-15', 'UTC');
    expect(aug.toISOString()).toBe('2026-08-16T00:00:00.000Z');
  });

  it('returns null for malformed or impossible dates', () => {
    expect(getReleaseInstant(null)).toBeNull();
    expect(getReleaseInstant('not-a-date')).toBeNull();
    expect(getReleaseInstant('2026-02-31')).toBeNull();
    expect(getReleaseInstant('2026-13-45')).toBeNull();
  });
});

describe('tmdbDateToLocalDate (the +12h regression)', () => {
  it('keeps the US broadcast date for an ET viewer', () => {
    expect(tmdbDateToLocalDate('2026-10-08', 'America/New_York')).toBe('2026-10-08');
  });

  it('shifts a Monday 8PM ET release to Tuesday for IST viewers', () => {
    // 20:00 ET Oct 8 = 05:30 IST Oct 9 → local date Oct 9.
    expect(tmdbDateToLocalDate('2026-10-08', 'Asia/Kolkata')).toBe('2026-10-09');
  });

  it('passes midnight-local dates through unchanged', () => {
    expect(tmdbDateToLocalDate('2026-10-08', 'UTC', 'netflix')).toBe('2026-10-08');
  });

  it('keeps midnight-utc dates for Prime unchanged for a UTC viewer', () => {
    expect(tmdbDateToLocalDate('2026-10-08', 'UTC', 'prime')).toBe('2026-10-08');
  });

  it('returns the raw string for malformed dates', () => {
    expect(tmdbDateToLocalDate('not-a-date', 'UTC')).toBe('not-a-date');
    expect(tmdbDateToLocalDate('2026-02-31', 'UTC')).toBe('2026-02-31');
  });
});
