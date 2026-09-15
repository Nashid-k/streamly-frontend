import { memo } from "react";

/* ── Global footer — matches Cinejoy's: the real brand wordmark
   (/brand/wordmark.svg), a hairline divider, and a Discord glyph whose
   fill fades white → #a1a1aa, then disclaimer + contact link. */
function DiscordIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      role="img"
      focusable="false"
    >
      <defs>
        <linearGradient id="footer-discord-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#a1a1aa" />
        </linearGradient>
      </defs>
      <path
        fill="url(#footer-discord-grad)"
        d="M20.32 4.37A19.79 19.79 0 0 0 15.45 2.9a.07.07 0 0 0-.08.03c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.5 0 12.3 12.3 0 0 0-.62-1.25.08.08 0 0 0-.08-.03A19.74 19.74 0 0 0 3.7 4.37a.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.97-1.29 1.36-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1 0-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.92 1.79 8.16 1.79 12.04 0a.07.07 0 0 1 .08.01c.12.1.24.2.37.29a.08.08 0 0 1 0 .13c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.11c.4.7.9 1.36 1.36 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6.01-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z"
      />
    </svg>
  );
}

function Footer() {
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-start md:items-center gap-5 md:gap-8">
        <div className="flex items-center gap-4">
          <img
            src="/brand/wordmark.svg"
            alt="Cinejoy"
            className="h-6 w-auto object-contain select-none"
            draggable={false}
          />
          <span className="w-px h-8 bg-white/10" aria-hidden="true" />
          <a
            href="https://discord.gg/cinejoy"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join our Discord"
            className="text-white/60 hover:text-white transition-colors"
          >
            <DiscordIcon />
          </a>
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
