import { memo } from "react";

/* Fixed full-viewport ambient layer — mirrors the watch/details page:
   a heavily blurred, saturated backdrop + screen-blended top glow above the
   accent gradient stack. Hooks behind page content so every page gets the
   banner-at-the-time gradient wash. */
function AmbientBackground({ src, alt = "" }) {
  if (!src) return null;

  return (
    <div
      className="fixed inset-0 w-full h-full z-0 pointer-events-none bg-[#050505]"
      style={{ contain: "strict", willChange: "transform" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 w-full h-full">
        <img
          className="w-full h-full object-cover scale-[1.25] blur-[90px] saturate-100 opacity-50"
          alt={alt}
          loading="eager"
          decoding="async"
          src={src}
        />
        <div className="absolute top-0 left-0 w-full h-[40vh] mix-blend-screen opacity-25 hidden lg:block">
          <img
            className="w-full h-full object-cover scale-[1.25] blur-[55px] saturate-100"
            alt={alt}
            loading="eager"
            decoding="async"
            style={{
              maskImage: "linear-gradient(to bottom, black 0%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 0%, transparent 100%)",
            }}
            src={src}
          />
        </div>
        {/* Same gradient stack as the hero banner overlay — bottom fade + soft side vignettes */}
        <div className="absolute inset-0 z-0 pointer-events-none watch-hero-gradient" />
      </div>
    </div>
  );
}

export default memo(AmbientBackground);