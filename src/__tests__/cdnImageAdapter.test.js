import { describe, it, expect } from 'vitest';
import { CdnImageAdapter } from '../api/cdnImageAdapter';

describe('CdnImageAdapter', () => {
  describe('getUrl', () => {
    it('returns null for null/undefined path', () => {
      expect(CdnImageAdapter.getUrl(null)).toBeNull();
      expect(CdnImageAdapter.getUrl(undefined)).toBeNull();
    });

    it('generates correct TMDB URL from path', () => {
      const url = CdnImageAdapter.getUrl('/abc123.jpg');
      expect(url).toBe('https://image.tmdb.org/t/p/w500/abc123.jpg');
    });

    it('uses custom size', () => {
      const url = CdnImageAdapter.getUrl('/abc123.jpg', 'w342');
      expect(url).toBe('https://image.tmdb.org/t/p/w342/abc123.jpg');
    });

    it('handles full URLs', () => {
      const url = CdnImageAdapter.getUrl('https://example.com/image.jpg');
      expect(url).toBe('https://example.com/image.jpg');
    });

    it('downgrades large TMDB URLs', () => {
      const url = CdnImageAdapter.getUrl('https://image.tmdb.org/t/p/w1280/abc.jpg', 'w500');
      expect(url).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
    });

    it('resizes an existing medium TMDB URL for data-saving cards', () => {
      const url = CdnImageAdapter.getUrl('https://image.tmdb.org/t/p/w500/abc.jpg', 'w342');
      expect(url).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
    });

    it('does not downgrade when size is original', () => {
      const url = CdnImageAdapter.getUrl('https://image.tmdb.org/t/p/w1280/abc.jpg', 'original');
      expect(url).toBe('https://image.tmdb.org/t/p/w1280/abc.jpg');
    });
  });

  describe('getTinyUrl', () => {
    it('returns w92 size', () => {
      const url = CdnImageAdapter.getTinyUrl('/abc.jpg');
      expect(url).toContain('/w92/');
    });
  });

  describe('getSmallUrl', () => {
    it('returns w154 size', () => {
      const url = CdnImageAdapter.getSmallUrl('/abc.jpg');
      expect(url).toContain('/w154/');
    });
  });

  describe('getMediumUrl', () => {
    it('returns w342 size', () => {
      const url = CdnImageAdapter.getMediumUrl('/abc.jpg');
      expect(url).toContain('/w342/');
    });
  });

  describe('getBackdropUrl', () => {
    it('returns w780 size', () => {
      const url = CdnImageAdapter.getBackdropUrl('/abc.jpg');
      expect(url).toContain('/w780/');
    });
  });

  describe('getSrcSet', () => {
    it('returns undefined for null path', () => {
      expect(CdnImageAdapter.getSrcSet(null)).toBeUndefined();
    });

    it('returns srcSet string with multiple sizes', () => {
      const srcSet = CdnImageAdapter.getSrcSet('/abc.jpg');
      expect(srcSet).toContain('342w');
      expect(srcSet).toContain('500w');
      expect(srcSet).toContain('780w');
    });
  });
});
