// src/components/LiquidGlassDefs.jsx — global SVG displacement filter for the
// liquid-glass refraction surfaces (settings nav, glass cards, popovers, login
// panel). Mounted once in App so every `filter: url(#streamly-lg-dist)` layer
// can reference it. The SVG itself is visually hidden and paints nothing.
export default function LiquidGlassDefs() {
  return (
    <svg className="liquid-glass-defs" aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        <filter
          id="streamly-lg-dist"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.012"
            numOctaves="2"
            seed="92"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="2" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale="34"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
