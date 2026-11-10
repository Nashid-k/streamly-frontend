/* Streamly wordmark.
   The header and the language-switch curtain previously rendered
   public/brand/cinejoy-logo.svg — the upstream site's mark — while the link was
   labelled "Cinejoy home". There is no Streamly logo asset in the repo, so the
   brand is set as live text instead of shipping a competitor's artwork: one
   place to change when a designed mark lands, and no image request on the
   critical path. Decorative (aria-hidden): the surrounding link/overlay already
   carries the accessible name. */
export default function BrandWordmark({ className = "" }) {
  return (
    <span className={`brand-wordmark ${className}`.trim()} aria-hidden="true">
      Streamly<span className="brand-wordmark__accent">.</span>
    </span>
  );
}
