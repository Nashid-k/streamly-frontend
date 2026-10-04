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
      expect(url).toBe('https://wsrv.nl/?url=https://image.tmdb.org/t/p/w500/abc123.jpg&output=webp&q=80&af=true');
    });

    it('uses custom size', () => {
      const url = CdnImageAdapter.getUrl('/abc123.jpg', 'w342');
      expect(url).toBe('https://wsrv.nl/?url=https://image.tmdb.org/t/p/w342/abc123.jpg&output=webp&q=80&af=true');
    });

    it('handles full URLs', () => {
      const url = CdnImageAdapter.getUrl('https://example.com/image.jpg');
      expect(url).toBe('https://example.com/image.jpg');
    });

    it('downgrades large TMDB URLs', () => {
      const url = CdnImageAdapter.getUrl('https://image.tmdb.org/t/p/w1280/abc.jpg', 'w500');
      expect(url).toBe('https://wsrv.nl/?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw500%2Fabc.jpg&output=webp&q=80&af=true');
    });

    it('resizes an existing medium TMDB URL for data-saving cards', () => {
      const url = CdnImageAdapter.getUrl('https://image.tmdb.org/t/p/w500/abc.jpg', 'w342');
      expect(url).toBe('https://wsrv.nl/?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw342%2Fabc.jpg&output=webp&q=80&af=true');
    });

    it('does not downgrade when size is original', () => {
      const url = CdnImageAdapter.getUrl('https://image.tmdb.org/t/p/w1280/abc.jpg', 'original');
      expect(url).toBe('https://wsrv.nl/?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw1280%2Fabc.jpg&output=webp&q=80&af=true');
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
    // The banner art box is 100vw, so w780 was upscaled on every laptop.
    it('returns w1280 size', () => {
      const url = CdnImageAdapter.getBackdropUrl('/abc.jpg');
      expect(url).toContain('/w1280/');
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

    it('ladder reaches past 1280 for the full-width backdrop context', () => {
      const srcSet = CdnImageAdapter.getSrcSet('/abc.jpg', 'backdrop');
      expect(srcSet).toContain('1280w');
      expect(srcSet).toContain('1920w');
      // Card ladders stay small — a card must never fetch a banner frame.
      expect(CdnImageAdapter.getSrcSet('/abc.jpg')).not.toContain('1920w');
    });
  });

  describe('getSizes', () => {
    it('tells the browser the banner art is full width', () => {
      expect(CdnImageAdapter.getSizes('backdrop')).toBe('100vw');
    });
  });
});
