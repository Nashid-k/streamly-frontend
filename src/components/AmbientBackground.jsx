import { memo } from "react";
import { CdnImageAdapter } from "../api/cdnImageAdapter";

/* Fixed full-viewport ambient layer — mirrors the watch/details page:
   a heavily blurred, saturated backdrop + screen-blended top glow above the
   accent gradient stack. Hooks behind page content so every page gets the
   banner-at-the-time gradient wash. With `fallback` it renders the liquid
   gradient layer even when there is no backdrop image yet (e.g. an empty
   My List). */
function AmbientBackground({ src, alt = "", fallback = false }) {
  if (!src && !fallback) return null;

  /* The two layers are pure color washes — resolution is invisible under a
     blur(50–80px). Render them from a w342 rendition so the GPU blurs a few
     hundred pixels instead of a full 4K frame (this runs on every page,
     behind the hero, forever). */
  const blurSrc = CdnImageAdapter.getUrl(src, "w342");

  return (
    <div
      className="fixed inset-0 w-full h-full z-0 pointer-events-none ambient-sky"
      style={{ contain: "strict" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 w-full h-full">
        {src && (
          <img
            className="w-full h-full object-cover scale-[1.2] blur-[80px] saturate-100 opacity-50"
            alt={alt}
            loading="eager"
            decoding="async"
            src={blurSrc}
          />
        )}
        {src && (
          <div className="absolute top-0 left-0 w-full h-[40vh] mix-blend-screen opacity-20 hidden lg:block">
            <img
              className="w-full h-full object-cover scale-[1.2] blur-[50px] saturate-100"
              alt={alt}
              loading="eager"
              decoding="async"
              style={{
                maskImage: "linear-gradient(to bottom, black 0%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 0%, transparent 100%)",
              }}
              src={blurSrc}
            />
          </div>
        )}
        {/* Cinejoy-style liquid backdrop — a few blurred color blobs drifting
            slowly. Transform-only animation (GPU-cheap); disabled for
            prefers-reduced-motion via CSS. */}
        <div className="ambient-liquid" aria-hidden="true">
          <div className="ambient-liquid__blob ambient-liquid__blob--a" />
          <div className="ambient-liquid__blob ambient-liquid__blob--b" />
          <div className="ambient-liquid__blob ambient-liquid__blob--c" />
        </div>
        {/* Same gradient stack as the hero banner overlay — bottom fade + soft side vignettes */}
        <div className="absolute inset-0 z-0 pointer-events-none watch-hero-gradient" />
      </div>
    </div>
  );
}

export default memo(AmbientBackground);