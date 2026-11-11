/* Streamly brand lockup — the glyph from public/brand/wordmark.svg (the file
   shipped with the upstream CINEJOY letterforms baked in; those paths are gone
   now, so the SVG is the loop-and-play mark alone) plus "Streamly" as live
   type, which stays crisp at every size the curtain/header scale it to. The
   header, the language-switch curtain and the footer all render through this
   one component. Decorative (aria-hidden): the surrounding link/overlay
   already carries the accessible name. */
export default function BrandWordmark({ className = "" }) {
  return (
    <span className={`brand-wordmark ${className}`.trim()} aria-hidden="true">
      <img
        src="/brand/wordmark.svg"
        alt=""
        draggable="false"
        className="brand-wordmark__glyph"
      />
      <span className="brand-wordmark__text">Streamly</span>
    </span>
  );
}
