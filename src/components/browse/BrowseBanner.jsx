import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Calendar, Check, Heart, Info, Play, Plus } from "lucide-react";
import slugify from "slugify";
import { DURATION, EASE_OUT, PRESS_SCALE } from "../../constants/motion";
import { CdnImageAdapter } from "../../api/cdnImageAdapter";
import { useAppAuth } from "../../context/auth";
import useDetailView from "../../hooks/useDetailView";
import HeroTitleLogo from "../HeroTitleLogo";
import RatingsCluster from "../RatingsCluster";
import { useI18n } from "../../i18n/index.jsx";
import { getBannerMemory, setBannerMemory } from "../../utils/bannerMemory";

/**
 * Compact hero banner for the browse pages (Movies / Series). The home page
 * owns a much larger inline hero; this component mirrors its visual language
 * and behavior contracts by REUSING the hero-* CSS and the standalone
 * HeroTitleLogo / RatingsCluster, at a shorter height (.hero-container--browse).
 *
 * Pool: the first titles of the page's own discover results (with backdrop art),
 * so the banner is always "corresponding" to what the page browses. When the
 * cross-route banner record shows the same media kind, its title leads the
 * pool as slide 0 — arriving from home never swaps the banner art or flashes
 * a skeleton (cinejoy parity).
 *
 * Contracts kept from the home banner: 10s dwell (synced with .dot-filler),
 * hover/focus/touch pause, hidden-tab guard, dots are real buttons with a
 * remounting progress fill, 45px horizontal swipe (1.5x vertical guard),
 * Play → /watch/:id/:slug, Info → details, My List toggle.
 */

const BROWSE_DWELL_MS = 10000;
const SWIPE_THRESHOLD_PX = 45;

export default function BrowseBanner({ pool, loading = false, mediaType = null }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { isInList, toggleMyList } = useAppAuth();
  const { openDetails } = useDetailView();

  /* cinejoy parity — cross-route carry. The record's kind matching this
     page's mediaType is decided once per page: the carried title then leads
     the pool as slide 0 while this page's own results land behind it. A
     mismatch or no record keeps the original skeleton-then-pool behavior.
     The record is only read here; writes always come from the on-screen
     slide (below), so a carry can never race back into the decision. */
  const carried = useMemo(() => {
    if (!mediaType) return null;
    const m = getBannerMemory();
    if (!m || m.mediaType !== mediaType || m.id == null) return null;
    if (!m.backdropUrl && !m.posterUrl) return null;
    return m;
  }, [mediaType]);

  const effectivePool = useMemo(() => {
    if (!carried) return pool;
    const rest = pool.filter((m) => m && String(m.id) !== String(carried.id));
    return [carried, ...rest];
  }, [carried, pool]);

  const total = effectivePool.length;
  const [index, setIndex] = useState(0);
  const active = total > 0 ? effectivePool[index % total] : null;

  /* A new result set (filter change, mode switch) restarts from the first
     slide instead of leaving the index pointing past a shorter pool. */
  const poolIdentity = `${effectivePool[0]?.id || ""}:${total}`;
  const lastPoolIdentity = useRef(poolIdentity);
  useEffect(() => {
    if (lastPoolIdentity.current !== poolIdentity) {
      lastPoolIdentity.current = poolIdentity;
      setIndex(0);
    }
  }, [poolIdentity]);

  /* Live mirrors for the interval / swipe closures (same pattern as home). */
  const totalRef = useRef(total);
  useEffect(() => {
    totalRef.current = total;
  });
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  /* Publish the on-screen slide to the banner record so the next page's carry
     decision sees what the viewer is looking at (the home hero publishes its
     featured slides the same way). */
  useEffect(() => {
    if (!mediaType || !active) return;
    setBannerMemory({ ...active, mediaType });
  }, [active, mediaType]);

  const pausedRef = useRef(false);

  const hasMultiple = total > 1;
  useEffect(() => {
    if (reduceMotion || !hasMultiple) return undefined;
    const timer = setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      setIndex((prev) => (prev + 1) % totalRef.current);
    }, BROWSE_DWELL_MS);
    return () => clearInterval(timer);
  }, [reduceMotion, hasMultiple]);

  const goToSlide = useCallback((next) => {
    const tf = totalRef.current;
    if (tf <= 1) return;
    setIndex(((next % tf) + tf) % tf);
  }, []);

  /* Preload the next slide's art so a rotation never flashes empty. */
  const nextMovie = total > 1 ? effectivePool[(index + 1) % total] : null;
  useEffect(() => {
    const preloadUrl = nextMovie?.backdropUrl || nextMovie?.posterUrl || nextMovie?.poster;
    if (!preloadUrl) return;
    const img = new window.Image();
    img.src = CdnImageAdapter.getBackdropUrl(preloadUrl);
  }, [index, total, nextMovie]);

  const heroArtSrc =
    active?.backdropUrl || active?.posterUrl || active?.poster || null;
  const heroArtUrl = heroArtSrc ? CdnImageAdapter.getBackdropUrl(heroArtSrc) : null;

  const touchStartRef = useRef({ x: 0, y: 0 });
  const handleTouchStart = (e) => {
    pausedRef.current = true;
    if (!e.touches || e.touches.length === 0) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };
  const handleTouchEnd = (e) => {
    pausedRef.current = false;
    const start = touchStartRef.current;
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch || (start.x === 0 && start.y === 0)) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    touchStartRef.current = { x: 0, y: 0 };
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goToSlide(indexRef.current + (dx < 0 ? 1 : -1));
    }
  };

  /* Loading → reserved skeleton slot (no layout shift when the banner arrives),
     unless the carried record already covers the slot (kind match, cinejoy
     parity). Settled but nothing with backdrop art → no banner at all. */
  if (loading && !carried) {
    return (
      <div
        className="hero-container hero-container--browse skeleton-hero"
        aria-hidden="true"
      />
    );
  }
  if (!active) return null;

  const year = active.releaseYear || active.year;
  const description =
    active.description || active.longDescription || active.overview;

  return (
    <motion.div
      key="browse-hero"
      className="hero-container hero-container--browse"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION.MED, ease: EASE_OUT }}
      style={{ willChange: "opacity" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => openDetails(active)}
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
      onFocus={() => {
        pausedRef.current = true;
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        pausedRef.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && active) {
          event.preventDefault();
          openDetails(active);
        }
      }}
    >
      {/* Keyed crossfade — both frames stack so the outgoing slide fades
          beneath the incoming one (no blank gap, same as home). */}
      <AnimatePresence>
        <motion.img
          key={active.id}
          src={heroArtUrl}
          srcSet={CdnImageAdapter.getSrcSet(heroArtSrc, "backdrop")}
          sizes={CdnImageAdapter.getSizes("backdrop")}
          alt={active.title}
          className="hero-bg"
          fetchPriority="high"
          loading="eager"
          decoding="async"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.SLOW, ease: EASE_OUT }}
        />
      </AnimatePresence>

      <div className="hero-overlay hero-overlay--apple" />

      <AnimatePresence>
        <motion.div
          key={active.id + "-content"}
          className="hero-content hero-content--apple"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.MED, delay: 0.12, ease: EASE_OUT }}
          style={{ willChange: "transform, opacity" }}
        >
          <HeroTitleLogo movie={active} />

          <div className="hero-eyebrow">
            {active.genres?.slice(0, 2).map((g) => (
              <span key={g} className="hero-eyebrow-tag">
                {g}
              </span>
            ))}
          </div>

          <div className="hero-meta hero-meta--apple">
            {active.imdbRating > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  borderRight: "1px solid rgba(255,255,255,0.2)",
                  paddingRight: "16px",
                  marginRight: "4px",
                }}
              >
                <RatingsCluster movie={active} size="lg" itemClassName="hero-meta-item" />
              </div>
            )}
            {year && (
              <span className="hero-meta-item">
                <Calendar size={14} />
                {String(year).substring(0, 4)}
              </span>
            )}
            {active.genres?.[0] ? (
              <span className="hero-meta-item">
                <Heart size={14} fill="currentColor" />
                {active.genres[0]}
              </span>
            ) : (
              <span className="maturity-badge">{active.maturityRating || "TV-MA"}</span>
            )}
            {active.duration && !active.duration.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) && (
              <span className="hero-meta-item">{active.duration}</span>
            )}
          </div>

          {description && <p className="hero-desc hero-desc--apple">{description}</p>}

          <div className="hero-ctas">
            <motion.button
              className="hero-cta-play"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: PRESS_SCALE.CONTROL }}
              onClick={(e) => {
                e.stopPropagation();
                navigate(
                  `/watch/${active.id}/${slugify(active.title, { lower: true, strict: true })}`,
                );
              }}
            >
              <Play size={20} strokeWidth={2.5} fill="currentColor" stroke="none" />
              {t("home.hero.play")}
            </motion.button>

            <div className="hero-action-pill inline-flex items-center shrink-0 rounded-full bg-white/10 backdrop-blur-[20px] backdrop-saturate-150 border border-white/10 shadow-lg shadow-black/5">
              <motion.button
                className="hero-cta-secondary-icon"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: PRESS_SCALE.ICON }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMyList(active);
                }}
                aria-label={
                  isInList(active?.id) ? t("home.hero.removeMyList") : t("home.hero.addMyList")
                }
                title={
                  isInList(active?.id) ? t("home.hero.removeMyList") : t("home.hero.addMyList")
                }
              >
                {isInList(active?.id) ? (
                  <Check size={18} strokeWidth={2.5} />
                ) : (
                  <Plus size={18} strokeWidth={2.5} />
                )}
              </motion.button>
              <span className="hero-cta-separator" aria-hidden="true">
                |
              </span>
              <motion.button
                className="hero-cta-secondary-icon"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: PRESS_SCALE.ICON }}
                aria-label={t("home.hero.moreInfo")}
                title={t("home.hero.moreInfo")}
                onClick={(e) => {
                  e.stopPropagation();
                  openDetails(active);
                }}
              >
                <Info size={18} strokeWidth={2.5} />
              </motion.button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {hasMultiple && (
        <>
          <div
            className="hero-dots hero-dots--apple hero-nav"
            role="group"
            aria-label="Featured titles"
          >
            <div className="hero-dots__ticks">
              {effectivePool.map((movie, i) => {
                const isActive = i === index % total;
                return (
                  <button
                    type="button"
                    key={movie.id || i}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`Show ${movie.title}`}
                    className={`hero-dot${isActive ? " hero-dot--active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      goToSlide(i);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
                    }}
                  >
                    <span className="hero-dot__bar" aria-hidden="true">
                      {isActive && <span className="dot-filler" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="hero-live" aria-live="polite" aria-atomic="true">
            {`${active.title}, featured title ${(index % total) + 1} of ${total}`}
          </p>
        </>
      )}
    </motion.div>
  );
}
