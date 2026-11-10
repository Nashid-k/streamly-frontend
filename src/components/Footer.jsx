import { memo } from "react";
import { useI18n } from "../i18n/index.jsx";
import BrandWordmark from "../components/BrandWordmark";

/* ── Global footer — matches Cinejoy's: a branded wordmark (now the live-text
   Streamly mark rather than /brand/wordmark.svg, which was still the upstream
   logo), then disclaimer + contact link. */
function Footer() {
  const { t } = useI18n();
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-start md:items-center gap-5 md:gap-8">
        <div className="flex items-center gap-4">
          <BrandWordmark className="footer-brand" />
        </div>

        <p className="text-xs text-white/40 max-w-lg leading-relaxed">
          {t("footer.tagline")}
        </p>

        <a
          className="text-xs text-white/30 hover:text-white/60 underline underline-offset-2 transition-colors md:ml-auto"
          href="mailto:contact@streamly.app"
        >
          contact@streamly.app
        </a>

        <button
          type="button"
          className="text-xs text-white/30 hover:text-white/60 underline underline-offset-2 transition-colors"
          onClick={() => window.dispatchEvent(new Event("streamly:open-shortcuts"))}
        >
          {t("footer.shortcuts")}
        </button>
      </div>
    </footer>
  );
}

export default memo(Footer);
