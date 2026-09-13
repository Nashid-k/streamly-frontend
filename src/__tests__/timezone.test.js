import { describe, it, expect } from 'vitest';
import { getUserTimezone, formatTMDBDate, getTMDBWeekday, getTimeUntil, getTMDBWeekdayShort } from '../utils/timezone';

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
