import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Calendar, Check, Heart, Info, Play, Plus } from "lucide-react";
import slugify from "slugify";
import { DURATION_2, EASE_2, PRESS_SCALE } from "../../constants/motion";
import { CdnImageAdapter } from "../../api/cdnImageAdapter";
import { useAppAuth } from "../../context/auth";
import useDetailView from "../../hooks/useDetailView";
import HeroTitleLogo, { HeroTokenContext } from "../HeroTitleLogo";
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
 * Contracts kept from the home banner: 9s dwell (synced with .dot-filler and
 * dotlive), hover/focus/touch pause, hidden-tab guard, dots are real buttons
 * with a remounting progress fill, 45px horizontal swipe (1.5x vertical
 * guard), Play → /watch/:id/:slug, Info → details, My List toggle.
 */

const BROWSE_DWELL_MS = 9000;
const HERO_LIMIT = 5;
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
    const base = carried
      ? [carried, ...pool.filter((m) => m && String(m.id) !== String(carried.id))]
      : pool;
    return (Array.isArray(base) ? base : []).slice(0, HERO_LIMIT);
  }, [carried, pool]);

  const total = effectivePool.length;
  const [index, setIndex] = useState(0);
  const active = total > 0 ? effectivePool[index % total] : null;
  const description =
    active?.description || active?.longDescription || active?.overview || null;
  const hasMultiple = total > 1;

  const heroScope = mediaType || "browse";
  const heroIndex = total > 0 ? index % total : 0;
  const heroToken = active ? `hero:${heroScope}:${heroIndex}:${active.id}` : null;

  const descWrapRef = useRef(null);
  const descRef = useRef(null);
  const [descOverflow, setDescOverflow] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  useEffect(() => {
    setDescExpanded(false);
  }, [active?.id]);
  useEffect(() => {
    const wrap = descWrapRef.current;
    const el = descRef.current;
    if (!wrap || !el) {
      setDescOverflow(false);
      return undefined;
    }
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 27;
      const full = el.scrollHeight;
      wrap.style.setProperty("--hdmax", `${full}px`);
      setDescOverflow(full > lineHeight * 3 + 2);
    };
    const raf = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(raf);
  }, [description, active?.id]);

  const [swapping, setSwapping] = useState(false);
  const firstSlideRef = useRef(true);
  useEffect(() => {
    if (reduceMotion || firstSlideRef.current) {
      firstSlideRef.current = false;
      return undefined;
    }
    setSwapping(true);
    const raf = window.requestAnimationFrame(() => setSwapping(false));
    return () => window.cancelAnimationFrame(raf);
  }, [index, reduceMotion]);

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

  /* Live mirrors for the rotation / swipe closures (same pattern as home). */
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
  const heroTimerRef = useRef(null);
  const armHeroRotation = useCallback(() => {
    if (heroTimerRef.current) clearTimeout(heroTimerRef.current);
    heroTimerRef.current = null;
    if (reduceMotion || totalRef.current <= 1) return;
    heroTimerRef.current = setTimeout(() => {
      heroTimerRef.current = null;
      if (pausedRef.current || document.hidden) {
        armHeroRotation();
        return;
      }
      setIndex((prev) => (prev + 1) % totalRef.current);
    }, BROWSE_DWELL_MS);
  }, [reduceMotion]);

  const goToSlide = useCallback(
    (next) => {
      const tf = totalRef.current;
      if (tf <= 1) return;
      setIndex(((next % tf) + tf) % tf);
      armHeroRotation();
    },
    [armHeroRotation],
  );

  useEffect(() => {
    armHeroRotation();
    return () => {
      if (heroTimerRef.current) clearTimeout(heroTimerRef.current);
      heroTimerRef.current = null;
    };
  }, [armHeroRotation, index, total]);

  /* Preload every slide in the rotation once, not just the next one. */
  const preloadedArtRef = useRef(new Set());
  useEffect(() => {
    effectivePool.forEach((movie) => {
      const src = movie?.backdropUrl || movie?.posterUrl || movie?.poster;
      if (!src || preloadedArtRef.current.has(src)) return;
      preloadedArtRef.current.add(src);
      const img = new window.Image();
      img.fetchPriority = "low";
      img.src = CdnImageAdapter.getBackdropUrl(src);
    });
  }, [effectivePool]);

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
        className="hero sk-hero hero-container hero-container--browse skeleton-hero"
        data-sk-scene={mediaType === "tv" ? "series" : "movies"}
        aria-hidden="true"
      >
        <div className="hbd sk sk-hbd" />
        <div className="hx hero-content">
          <div className="hh sk sk-ht" />
          <div className="hm sk sk-hm" />
          <div className="hdw">
            <p className="hd sk-hd">
              <span className="sk sk-line" />
              <span className="sk sk-line" />
              <span className="sk sk-line short" />
            </p>
          </div>
          <div className="btns hero-ctas">
            <span className="sk sk-btn" />
            <span className="sk sk-btn sm" />
            <span className="sk sk-btn sm" />
          </div>
        </div>
        <div className="dots glass sk-dots">
          {Array.from({ length: HERO_LIMIT }, (_, i) => (
            <button key={i} type="button" tabIndex={-1} disabled>
              <span className={`sk sk-dot${i ? " dot-idle" : ""}`} />
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (!active) return null;

  const year = active.releaseYear || active.year;

  return (
    <motion.div
      key="browse-hero"
      className={`hero hero-container hero-container--browse${swapping ? " sw" : ""}`}
      data-hero-token={heroToken || undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION_2.REVEAL, ease: EASE_2.UI }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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
    >
      {/* Canonical 2.0 backdrop: scene wash + mask + 32s Ken Burns, keyed by
          the hero token so a late logo lookup cannot swap the wrong title. */}
      <div
        className="hbd"
        data-vt={heroToken || undefined}
        style={{
          "--a": 212,
          "--b": 265,
          "--hero-art": heroArtUrl ? `url("${heroArtUrl}")` : "none",
        }}
        aria-hidden="true"
      />

      {/* Full-width img.hero-bg stays for selector parity with the home and
          details heroes; the 2.0 art above owns the visible paint here. */}
      <AnimatePresence>
        <motion.img
          key={active.id}
          src={heroArtUrl}
          srcSet={CdnImageAdapter.getSrcSet(heroArtSrc, "backdrop")}
          sizes={CdnImageAdapter.getSizes("backdrop")}
          alt={active.title}
          className="hero-bg"
          fetchPriority={index === 0 ? "high" : "auto"}
          loading="eager"
          decoding="async"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION_2.REVEAL, ease: EASE_2.UI }}
        />
      </AnimatePresence>

      <div className="hero-overlay hero-overlay--apple" />

      <AnimatePresence>
        <motion.div
          key={active.id + "-content"}
          className="hx hero-content hero-content--apple"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION_2.REVEAL, delay: 0.12, ease: EASE_2.UI }}
        >
          <HeroTokenContext.Provider value={heroToken}>
          <div className="hh">
          <HeroTitleLogo movie={active} fetchPriority={index === 0 ? "high" : "auto"} />
          </div>

          <div className="hero-eyebrow">
            {active.genres?.slice(0, 2).map((g) => (
              <span key={g} className="hero-eyebrow-tag">
                {g}
              </span>
            ))}
          </div>

          <div className="hm hero-meta hero-meta--apple">
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

          {description && (
            <div ref={descWrapRef} className={`hdw${descExpanded ? " exp" : ""}`}>
              <p ref={descRef} id="browse-hero-desc" className="hd hero-desc hero-desc--apple">
                {description}
              </p>
              <button
                type="button"
                className="rm"
                aria-expanded={descExpanded}
                aria-controls="browse-hero-desc"
                hidden={!descOverflow}
                onClick={(event) => {
                  event.stopPropagation();
                  setDescExpanded((prev) => !prev);
                }}
              >
                {descExpanded ? "Read less" : "Read more"}
              </button>
            </div>
          )}

          <div className="btns hero-ctas">
            <motion.button
              className="hero-cta-play"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: PRESS_SCALE.CONTROL }}
              onClick={(e) => {
                e.stopPropagation();
                navigate(
                  `/watch/${active.id}/${slugify(active.title, { lower: true, strict: true })}`,
                  { state: { movie: active, autoPlay: true } },
                );
              }}
            >
              <Play size={20} strokeWidth={2.5} fill="currentColor" stroke="none" />
              {t("home.hero.play")}
            </motion.button>

            <div className="hero-action-pill inline-flex items-stretch shrink-0 rounded-full border border-white/10 shadow-lg shadow-black/5">
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
          </HeroTokenContext.Provider>
        </motion.div>
      </AnimatePresence>

      {hasMultiple && (
        <>
          <div
            className="dots glass hero-dots hero-dots--apple hero-nav"
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
