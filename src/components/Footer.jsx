import { memo } from "react";

/* ── Global footer — matches Cinejoy's: the real brand wordmark
   (/brand/wordmark.svg), then disclaimer + contact link. */
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
        </div>

        <p className="text-xs text-white/40 max-w-lg leading-relaxed">
          Streamly is a demo streaming experience — it does not host, stream,
          or store any content itself. All titles, artwork, and metadata are
          sourced from TMDB and used for illustration only; every title and
          work remains the property of its respective owners.
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
