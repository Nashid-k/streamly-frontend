import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMediaQuery } from '../hooks/useMediaQuery';

describe('useMediaQuery', () => {
  const origMatchMedia = window.matchMedia;

  beforeEach(() => {
    // jsdom doesn't have matchMedia — define it for tests
    window.matchMedia = window.matchMedia || function(query) {
      return {
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    };
  });

  afterEach(() => {
    window.matchMedia = origMatchMedia;
  });

  it('returns a boolean', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(typeof result.current).toBe('boolean');
  });

  it('returns true when media query matches', () => {
    window.matchMedia = (query) => ({
      matches: true, media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('returns false when media query does not match', () => {
    window.matchMedia = (query) => ({
      matches: false, media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('cleans up event listener on unmount', () => {
    const removeEventListener = vi.fn();
    window.matchMedia = () => ({
      matches: false, addEventListener: vi.fn(), removeEventListener,
    });
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    unmount();
    expect(removeEventListener).toHaveBeenCalled();
  });

  it('re-queries when query prop changes', () => {
    const mql1 = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const mql2 = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    // Track by query string so both useState and useEffect get consistent results
    const results = { '(min-width: 768px)': mql1, '(min-width: 1024px)': mql2 };
    window.matchMedia = (query) => ({ ...results[query], media: query });
    const { result, rerender } = renderHook(
      ({ query }) => useMediaQuery(query),
      { initialProps: { query: '(min-width: 768px)' } }
    );
    expect(result.current).toBe(true);
    rerender({ query: '(min-width: 1024px)' });
    expect(result.current).toBe(false);
  });
});
