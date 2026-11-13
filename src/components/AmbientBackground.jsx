import { memo } from "react";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { useOptionalPreferences } from "../context/preferences";
import { MOTION_THEME_IDS } from "../constants/settings";

/* Fixed full-viewport ambient layer — mirrors the watch/details page:
   a heavily blurred, saturated backdrop + screen-blended top glow above the
   accent gradient stack. Hooks behind page content so every page gets the
   banner-at-the-time gradient wash. With `fallback` it renders the liquid
   gradient layer even when there is no backdrop image yet (e.g. an empty
   My List). Settings → Appearance → "Ambient liquid backdrop" turns off the
   drifting blobs (the decorative, animation-bearing layer) while the static
   gradient stack always stays. */
function AmbientBackground({ src, alt = "", fallback = false, children }) {
  const prefs = useOptionalPreferences();
  // A motion theme (Living Tides / Aurora Drift) owns the page stage with its
  // own living backdrop (MotionBackdrop) — the accent-green liquid blobs
  // would paint over it, so they yield while a motion theme is active.
  const liquid = prefs?.ambientBackground !== false && !MOTION_THEME_IDS.has(prefs?.theme);
  // Wrapping usage (Explore / Public collection pages) nests the page body as
  // `children`; self-closing usage passes none. Ignoring `children` rendered
  // those pages blank, so render them here — outside the aria-hidden backdrop
  // and lifted above its z-0 layer.
  const hasChildren = children !== undefined && children !== null;
  if (!src && !fallback && !hasChildren) return null;

  /* The two layers are pure color washes — resolution is invisible under a
     blur(50–80px). Render them from a w342 rendition so the GPU blurs a few
     hundred pixels instead of a full 4K frame (this runs on every page,
     behind the hero, forever). */
  const blurSrc = CdnImageAdapter.getUrl(src, "w342");

  const layer = (
    <div
      className="fixed inset-0 w-full h-full z-0 pointer-events-none ambient-sky"
      style={{ contain: "strict" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 w-full h-full">
        {src && (
          <img
            className="ambient-backdrop-img"
            alt={alt}
            loading="eager"
            decoding="async"
            src={blurSrc}
          />
        )}
        {src && <div className="ambient-top-glow hidden lg:block" aria-hidden="true" />}
        {/* Cinejoy-style liquid backdrop — a few blurred color blobs drifting
            slowly. Transform-only animation (GPU-cheap); disabled for
            prefers-reduced-motion via CSS, and for everyone via the
            `ambientBackground` preference. */}
        {liquid && (
          <div className="ambient-liquid" aria-hidden="true">
            <div className="ambient-liquid__blob ambient-liquid__blob--a" />
            <div className="ambient-liquid__blob ambient-liquid__blob--b" />
            <div className="ambient-liquid__blob ambient-liquid__blob--c" />
          </div>
        )}
        {/* Same gradient stack as the hero banner overlay — bottom fade + soft side vignettes */}
        <div className="absolute inset-0 z-0 pointer-events-none watch-hero-gradient" />
      </div>
    </div>
  );

  if (!hasChildren) return layer;

  return (
    <>
      {layer}
      <div className="relative z-10">{children}</div>
    </>
  );
}

export default memo(AmbientBackground);