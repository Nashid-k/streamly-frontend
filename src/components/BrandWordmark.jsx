/* Streamly wordmark — public/brand/wordmark.svg, the designed mark (loop-and-
   play glyph + STREAMLY letterforms, white + brand green). The header, the
   language-switch curtain and the footer all render through this one component,
   so the brand swaps in exactly one place. Decorative (aria-hidden): the
   surrounding link/overlay already carries the accessible name. */
export default function BrandWordmark({ className = "" }) {
  return (
    <img
      src="/brand/wordmark.svg"
      alt=""
      aria-hidden="true"
      draggable="false"
      className={`brand-wordmark ${className}`.trim()}
    />
  );
}
