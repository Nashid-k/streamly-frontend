import { describe, it, expect } from 'vitest';
import { getRatingColor, getScoreColor } from '../utils/ratings';

describe('getRatingColor', () => {
  it('returns green for high ratings (>= 8)', () => {
    expect(getRatingColor(8)).toBe('#4ade80');
    expect(getRatingColor(9.5)).toBe('#4ade80');
    expect(getRatingColor(10)).toBe('#4ade80');
  });

  it('returns yellow for medium ratings (>= 6.5)', () => {
    expect(getRatingColor(6.5)).toBe('#fbbf24');
    expect(getRatingColor(7.9)).toBe('#fbbf24');
  });

  it('returns red for low ratings (> 0)', () => {
    expect(getRatingColor(1)).toBe('#f87171');
    expect(getRatingColor(5)).toBe('#f87171');
    expect(getRatingColor(6.4)).toBe('#f87171');
  });

  it('returns null for zero or no rating', () => {
    expect(getRatingColor(0)).toBeNull();
    expect(getRatingColor(null)).toBeNull();
    expect(getRatingColor(undefined)).toBeNull();
  });

  it('handles negative ratings (-1 > 0 is false in JS)', () => {
    // In JS: -1 > 0 is false, so falls through to return null
    expect(getRatingColor(-1)).toBeNull();
  });

  it('handles string input via type coercion', () => {
    // "8.5" >= 8 → 8.5 >= 8 → true (JS coerces string to number)
    expect(getRatingColor("8.5")).toBe('#4ade80');
    // "not-a-number" comparisons are all false → falls to rating > 0 → false
    expect(getRatingColor("not-a-number")).toBeNull();
  });

  it('handles Infinity (>= 8 is true)', () => {
    expect(getRatingColor(Infinity)).toBe('#4ade80');
  });

  it('boundary: exactly 8.0 returns green', () => {
    expect(getRatingColor(8.0)).toBe('#4ade80');
  });

  it('boundary: 7.99 returns yellow', () => {
    expect(getRatingColor(7.99)).toBe('#fbbf24');
  });

  it('boundary: exactly 6.5 returns yellow', () => {
    expect(getRatingColor(6.5)).toBe('#fbbf24');
  });

  it('boundary: 6.49 returns red', () => {
    expect(getRatingColor(6.49)).toBe('#f87171');
  });

  it('handles very large numbers', () => {
    expect(getRatingColor(999)).toBe('#4ade80');
  });

  it('handles float precision', () => {
    expect(getRatingColor(7.999999)).toBe('#fbbf24');
  });

  it('handles NaN (all comparisons false, NaN > 0 is false)', () => {
    expect(getRatingColor(NaN)).toBeNull();
  });
});

describe('getScoreColor', () => {
  it('returns deep green for exceptional scores (>= 8.5)', () => {
    expect(getScoreColor(8.5)).toBe('#22c55e');
    expect(getScoreColor(9.2)).toBe('#22c55e');
    expect(getScoreColor(10)).toBe('#22c55e');
  });

  it('returns green for great scores (>= 8)', () => {
    expect(getScoreColor(8)).toBe('#4ade80');
    expect(getScoreColor(8.49)).toBe('#4ade80');
  });

  it('returns light green for good scores (>= 7)', () => {
    expect(getScoreColor(7)).toBe('#86efac');
    expect(getScoreColor(7.9)).toBe('#86efac');
  });

  it('returns yellow for fair scores (>= 6.5)', () => {
    expect(getScoreColor(6.5)).toBe('#fbbf24');
    expect(getScoreColor(6.9)).toBe('#fbbf24');
  });

  it('returns orange for weak scores (>= 6)', () => {
    expect(getScoreColor(6)).toBe('#fb923c');
    expect(getScoreColor(6.49)).toBe('#fb923c');
  });

  it('returns red for poor scores (> 0)', () => {
    expect(getScoreColor(1)).toBe('#f87171');
    expect(getScoreColor(5.9)).toBe('#f87171');
  });

  it('returns null for zero, missing, or invalid scores', () => {
    expect(getScoreColor(0)).toBeNull();
    expect(getScoreColor(null)).toBeNull();
    expect(getScoreColor(undefined)).toBeNull();
    expect(getScoreColor(NaN)).toBeNull();
    expect(getScoreColor(-1)).toBeNull();
  });

  it('coerces numeric strings', () => {
    expect(getScoreColor("8.5")).toBe('#22c55e');
    expect(getScoreColor("7.2")).toBe('#86efac');
    expect(getScoreColor("not-a-number")).toBeNull();
  });
});
