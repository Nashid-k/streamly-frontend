/**
 * CdnImageAdapter — optimized TMDB image URLs.
 *
 * Sizes: w92 blur-up placeholder, w154 search/compact thumbnails, w185 cast
 * avatars, w342 card posters, w500 medium detail views, w780/w1280/w1920 for the
 * full-width banner art (both banners are 100vw, so they pick from a ladder
 * instead of a single frame — see getSrcSet/getSizes "backdrop").
 */
export class CdnImageAdapter {
  // Use wsrv.nl for extreme image optimization (WebP/AVIF, global CDN cache)
  static USE_PROXY = true;
  static PROXY_BASE = "https://wsrv.nl/?url=https://image.tmdb.org/t/p/";

    /**
     * Transform a raw TMDB image path into an optimized URL.
     * @param {string} size - Size key (e.g. 'w500', 'original', 'w92')
     */
  static getUrl(path, size = "w500") {
    if (!path) return null;

    // Clean path — strip leading slash for proxy URL building
    const cleanPath = path.startsWith("/") ? path.substring(1) : path;

    // If it's already a full URL, check if we can optimize it
    if (path.startsWith("http")) {
      // API adapters may already return w500. Resize any TMDB rendition (not
      // only w1280) so the artwork-quality preference is actually honored.
      let targetUrl = path;
      if (path.includes("image.tmdb.org/t/p/") && size !== "original") {
        targetUrl = path.replace(/\/t\/p\/(?:w\d+|original)\//, `/t/p/${size}/`);
      }
      if (this.USE_PROXY && targetUrl.includes("image.tmdb.org")) {
        return `https://wsrv.nl/?url=${encodeURIComponent(targetUrl)}&output=webp&q=80&af=true`;
      }
      return targetUrl;
    }

    if (this.USE_PROXY) {
      // af=true → AVIF-first (auto-falls back to WebP for unsupported browsers)
      return `${this.PROXY_BASE}${size}/${cleanPath}&output=webp&q=80&af=true`;
    }

    return `https://image.tmdb.org/t/p/${size}/${cleanPath}`;
  }

    /** Tiny blur-up placeholder (<2KB) for the initial src before the real image. */
  static getTinyUrl(path) {
    return this.getUrl(path, "w92");
  }

    /** Small thumbnail for search dropdowns and compact displays. */
  static getSmallUrl(path) {
    return this.getUrl(path, "w154");
  }

    /** Medium URL for card posters; w342 is the quality/size sweet spot on grids. */
  static getMediumUrl(path) {
    return this.getUrl(path, "w342");
  }

    /** Avatar URL for cast photos; w185 suits 80px circular thumbnails. */
  static getAvatarUrl(path) {
    return this.getUrl(path, "w185");
  }

/** Large URL for detail-page hero backdrops. The hero art box is the FULL
      viewport width (its height is derived from it — see `.details-hero--fit`),
      so the old w780 was upscaled on every laptop: w1280 is the floor here, and
      `getSrcSet(path, "backdrop")` lets wide windows go higher still. */
  static getBackdropUrl(path) {
    return this.getUrl(path, "w1280");
  }

  /** srcSet string so the browser can pick the best size for the viewport.
      `backdrop` is the full-width banner ladder and has to reach past 1280 —
      capped at 780, a 1440p window upscales a 780px frame and the artwork goes
      soft, which is exactly what the watch hero was doing. */
  static getSrcSet(path, context = "card") {
    if (!path) return undefined;
    const ladder =
      context === "backdrop"
        ? ["w500", "w780", "w1280", "w1920"]
        : ["w154", "w342", "w500", "w780"];
    return ladder
      .map((size) => `${this.getUrl(path, size)} ${Number.parseInt(size.slice(1), 10)}w`)
      .join(", ");
  }

  /** `sizes` attribute for <img> so the browser can pick a srcSet entry before
      layout is known. @param {'card'|'backdrop'|'avatar'} context */
  static getSizes(context = "card") {
    const map = {
      card: "(max-width: 520px) 50vw, (max-width: 768px) 33vw, 200px",
      // The banner art box is 100vw at EVERY breakpoint, so this must be 100vw:
      // the old "780px" ceiling told the browser a 780px frame was enough.
      backdrop: "100vw",
      avatar: "80px",
    };
    return map[context] ?? map.card;
  }
}


