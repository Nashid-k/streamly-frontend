/* Streamly brand lockup — public/brand/streamly-logo-transparent.png, the
   designed mark (clapperboard-play glyph, swoosh ring and the outlined
   "Streamly" wordmark in one transparent PNG). The header, the language-switch
   curtain and the footer all render through this one component, so the brand
   swaps in exactly one place. Decorative (aria-hidden): the surrounding
   link/overlay already carries the accessible name. */
export default function BrandWordmark({ className = "" }) {
  return (
    <img
      src="/brand/streamly-logo-transparent.png"
      alt=""
      aria-hidden="true"
      draggable="false"
      className={`brand-wordmark ${className}`.trim()}
    />
  );
}
