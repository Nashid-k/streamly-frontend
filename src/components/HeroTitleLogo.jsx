import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTitleLogo } from "../hooks/useTitleLogo";
import { hasLoadedMediaUrl, markMediaUrlLoaded } from "../utils/posterCache";

/* Hero banner title logo. Renders the movie's actual wordmark/logo image.
   The lookup (list-fed movies have no logoUrl → fetch TMDB /images once per id,
   cached by React Query) and the text fallback both live in `useTitleLogo`, so
   the hero, the details hero and the player's cold-open stage can never again
   disagree about what counts as this title's logo.

   While the lookup is in flight we reserve the logo's slot instead of painting
   the styled text title — that avoids the text→logo flash the old flow had
   (image, then text, then logo). The text title still shows as the honest
   fallback when TMDB has no logo for the title.

   The 2.0 hero swaps text → wordmark only after the lookup resolves AND the
   navigation is idle AND the hero token that was current when the lookup
   started is still mounted. A late lookup for a slide the viewer already left
   must never repaint that slide's title. When the logo URL was already loaded
   earlier in the session (e.g., returning Back to Home), both swap & opacity
   resolve synchronously before first paint so the wordmark never blinks. */
export const HeroTokenContext = createContext(null);

export default function HeroTitleLogo({ movie, fetchPriority = "auto" }) {
  const { logoUrl, onLogoError } = useTitleLogo(movie, "HeroTitleLogo");
  const token = useContext(HeroTokenContext);
  const cachedReady = hasLoadedMediaUrl(logoUrl);
  const [canSwap, setCanSwap] = useState(() => cachedReady);
  const [logoImgLoaded, setLogoImgLoaded] = useState(() => cachedReady);
  const tokenRef = useRef(token);
  const logoImgRef = useRef(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useLayoutEffect(() => {
    const img = logoImgRef.current;
    if (logoUrl && (hasLoadedMediaUrl(logoUrl) || (canSwap && img?.complete && img?.naturalWidth > 0))) {
      markMediaUrlLoaded(logoUrl);
      setLogoImgLoaded(true);
    } else {
      setLogoImgLoaded(false);
    }
  }, [logoUrl, canSwap]);

  useEffect(() => {
    if (!logoUrl) {
      setCanSwap(false);
      return undefined;
    }
    if (hasLoadedMediaUrl(logoUrl)) {
      setCanSwap(true);
      setLogoImgLoaded(true);
      return undefined;
    }

    setCanSwap(false);
    const captured = tokenRef.current;
    let active = true;
    const commit = () => {
      if (!active) return;
      if (captured && tokenRef.current !== captured) return;
      if (captured && typeof document !== "undefined") {
        const nodes = document.querySelectorAll("[data-hero-token]");
        if (nodes.length && !Array.from(nodes).some((n) => n.getAttribute("data-hero-token") === captured)) return;
      }
      setCanSwap(true);
    };

    // Mirror `onNavIdle` from the target: let the route frame settle before a
    // wordmark replaces the styled title. requestIdleCallback keeps the swap
    // out of the same frame as the hero reveal / View Transition.
    const idle =
      typeof window !== "undefined" && typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(commit, { timeout: 700 })
        : setTimeout(commit, 0);
    return () => {
      active = false;
      if (typeof window !== "undefined" && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idle);
      } else {
        clearTimeout(idle);
      }
    };
  }, [logoUrl]);

  if (logoUrl && canSwap) {
    return (
      <img
        ref={logoImgRef}
        src={logoUrl}
        alt={movie.title}
        className="hero-logo-img"
        loading="eager"
        decoding="async"
        fetchPriority={fetchPriority}
        onLoad={() => {
          markMediaUrlLoaded(logoUrl);
          setLogoImgLoaded(true);
        }}
        onError={onLogoError}
        style={{ opacity: logoImgLoaded ? 1 : 0 }}
      />
    );
  }

  return <h1 className="hero-title">{movie.title}</h1>;
}
