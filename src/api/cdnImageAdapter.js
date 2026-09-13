/**
 * CdnImageAdapter — Optimized TMDB image loading
 *
 * Size strategy (matching Netflix/Disney+ patterns):
 *   w92  — Tiny blur-up placeholder (< 2KB, loads instantly)
 *   w154 — Search dropdown thumbnails
 *   w342 — Card posters (MovieCard grid)
 *   w500 — Medium detail views
 *   w780 — Backdrop hero (details page)
 *   w1280 — Full backdrop (only when explicitly needed)
 */
export class CdnImageAdapter {
  // Toggle this to use a proxy like Cloudflare, Cloudinary, etc.
  static USE_PROXY = false;
  static PROXY_BASE = "https://your-cloudfront-url.net/";

  /**
   * Transforms a raw TMDB image path into an optimized URL.
   * @param {string} path - TMDB path (e.g., /mBaXZMacxFzji9moQh2Tgw75a34.jpg)
   * @param {string} size - Size string (e.g., 'w500', 'original', 'w92')
   */
  static getUrl(path, size = "w500") {
    if (!path) return null;

    // If it's already a full URL, check if we can optimize it
    if (path.startsWith("http")) {
      if (this.USE_PROXY && path.includes("image.tmdb.org")) {
        return path.replace("https://image.tmdb.org/t/p/", this.PROXY_BASE);
      }
      // API adapters may already return w500. Resize any TMDB rendition (not
      // only w1280) so the artwork-quality preference is actually honored.
      if (path.includes("image.tmdb.org/t/p/") && size !== "original") {
        return path.replace(/\/t\/p\/(?:w\d+|original)\//, `/t/p/${size}/`);
      }
      return path;
    }

    // Clean path
    const cleanPath = path.startsWith("/") ? path.substring(1) : path;

    if (this.USE_PROXY) {
      return `${this.PROXY_BASE}${size}/${cleanPath}`;
    }

    return `https://image.tmdb.org/t/p/${size}/${cleanPath}`;
  }

  /**
   * Tiny blur-up placeholder (< 2KB). Loads instantly.
   * Use as the initial src, then swap to the real image.
   */
  static getTinyUrl(path) {
    return this.getUrl(path, "w92");
  }

  /**
   * Small thumbnail for search dropdowns and compact displays.
   */
  static getSmallUrl(path) {
    return this.getUrl(path, "w154");
  }

  /**
   * Medium URL for card posters (MovieCard grid).
   * w342 is the sweet spot for quality vs size on card grids.
   */
  static getMediumUrl(path) {
    return this.getUrl(path, "w342");
  }

  /**
   * Large URL for detail page hero backdrops.
   * w780 is enough for most screens — w1280 only for 4K.
   */
  static getBackdropUrl(path) {
    return this.getUrl(path, "w780");
  }

  /**
   * Returns srcSet string for responsive images.
   * Browsers pick the best size for the viewport.
   */
  static getSrcSet(path) {
    if (!path) return undefined;
    return [
      `${this.getUrl(path, "w342")} 342w`,
      `${this.getUrl(path, "w500")} 500w`,
      `${this.getUrl(path, "w780")} 780w`,
    ].join(", ");
  }
}
