import { memo } from "react";

/* ── Global footer — Streamly-branded mirror of the Cinejoy footer bar ──
   Wordmark + divider + disclaimer + contact link, compact and glassy, with
   a generous bottom pad so the floating mobile nav pill never overlaps it. */
function Footer() {
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-start md:items-center gap-5 md:gap-8">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-white font-semibold tracking-tight">
            <svg viewBox="0 0 48 48" width="30" height="30" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="footer-brand-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="var(--accent-primary, #95ff50)" />
                  <stop offset="1" stopColor="var(--accent-secondary, #5ce21c)" />
                </linearGradient>
              </defs>
              <rect x="1.5" y="1.5" width="45" height="45" rx="14" fill="url(#footer-brand-grad)" />
              <path d="M20.5 16 L32.5 24 L20.5 32 Z" fill="var(--on-accent, #ffffff)" />
              <circle cx="13" cy="35" r="2.2" fill="var(--on-accent, #ffffff)" />
            </svg>
            <span className="text-sm">
              Stream<span className="app-brand-word-accent">ly</span>
            </span>
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