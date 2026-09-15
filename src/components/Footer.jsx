import { memo } from "react";

/* ── Global footer — Cinejoy-style bar: green brand logo + wordmark,
   divider, disclaimer, and contact link. Compact and glassy, with a
   generous bottom pad so the floating mobile nav pill never overlaps it. */
function Footer() {
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-start md:items-center gap-5 md:gap-8">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-3 text-white font-semibold tracking-tight">
            <img
              src="/favicon.svg"
              alt="Cinejoy logo"
              width={28}
              height={28}
              className="w-7 h-7 object-contain drop-shadow-[0_0_10px_rgba(149,255,80,0.35)]"
              draggable={false}
            />
            <span className="text-sm">Cinejoy</span>
          </span>
          <span className="w-px h-8 bg-white/10" aria-hidden="true" />
        </div>

        <p className="text-xs text-white/40 max-w-lg leading-relaxed">
          Streamly is a demo streaming experience. We do not host, stream, or
          store any content ourselves — all titles, artwork, and metadata come
          from TMDB and are used for illustration only.
        </p>

        <a
          className="text-xs text-white/30 hover:text-white/60 underline underline-offset-2 transition-colors md:ml-auto"
          href="mailto:contact@streamly.app"
        >
          contact@streamly.app
        </a>
      </div>
    </footer>
  );
}

export default memo(Footer);