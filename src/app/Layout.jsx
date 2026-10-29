import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation, useNavigationType } from "react-router-dom";
import BackToTop from "../components/BackToTop";
import Footer from "../components/Footer";
import OfflineBanner from "../components/OfflineBanner";
import Header from "./Header";
import MobileBottomNav from "./MobileBottomNav";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
import { useOptionalPreferences } from "../context/preferences";
import {
  getRouteVariant,
  REDUCED_ROUTE_TRANSITION,
  REDUCED_ROUTE_VARIANTS,
  ROUTE_EXIT_TRANSITIONS,
  ROUTE_TRANSITIONS,
  ROUTE_VARIANTS,
} from "../constants/routeMotion";

function Layout({ children }) {
  useScrollRestoration();
  const location = useLocation();
  const osReduced = useReducedMotion();
  const prefs = useOptionalPreferences();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const mainRef = useRef(null);
  const routeKey = location.pathname + location.search;
  const variant = getRouteVariant(location.pathname);
  const navigationType = useNavigationType();

  // Back/Forward (POP) gets a directional slide that matches native OS nav metaphor.
  // Utility pages (/search, /settings, fade-only) are direction-neutral — a
  // sliding settings panel feels wrong, so they keep their own fade variant.
  const effectiveVariant =
    navigationType === "POP" && variant !== "fade-only"
      ? "slide-right"
      : navigationType === "PUSH" && variant === "slide-right"
        ? "slide-left"
        : variant;

  useEffect(() => {
    const main = mainRef.current;
    if (main?.contains(document.activeElement)) return;
    main?.focus({ preventScroll: true });
  }, [location.pathname, location.search]);

  /* `mode="popLayout"` is load-bearing for scroll correctness, not a taste
     choice. With `sync` both pages stay in normal flow for the whole
     transition — the tall page being left keeps the document stretched, the
     pending page sits BELOW it in scroll coordinates, and the exit animation
     races `useScrollRestoration`'s scroll-to-top: the viewer sees the new page
     arrive at the bottom and travel up as the old page collapses. `popLayout`
     lifts the exiting page out of flow (its pixels stay put while it fades
     under the entering page), so the document is the entering page alone from
     commit onwards and the scroll reset lands invisibly on it. `wait` was
     also rejected: it delays the enter behind the full exit and still clamps
     the scroll at commit. */
  const variants = reduceMotion
    ? REDUCED_ROUTE_VARIANTS[effectiveVariant]
    : {
        ...ROUTE_VARIANTS[effectiveVariant],
        exit: {
          ...ROUTE_VARIANTS[effectiveVariant].exit,
          transition: ROUTE_EXIT_TRANSITIONS[effectiveVariant],
        },
      };
  const enterTransition = reduceMotion ? REDUCED_ROUTE_TRANSITION : ROUTE_TRANSITIONS[effectiveVariant];

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header />
      <OfflineBanner />

      <main className="app-main" id="main-content" tabIndex={-1} ref={mainRef}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={routeKey}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={enterTransition}
            style={{
              flex: 1,
              minHeight: "100%",
              overflowX: "clip",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "translate3d(0,0,0)",
            }}
            onAnimationStart={() => {
              if (typeof window !== 'undefined') {
                window.__streamlyRouteAnimating = true;
              }
              if (mainRef.current) {
                mainRef.current.dataset.routeAnimating = "true";
              }
            }}
            onAnimationComplete={() => {
              if (typeof window !== 'undefined') {
                window.__streamlyRouteAnimating = false;
              }
              if (mainRef.current) {
                delete mainRef.current.dataset.routeAnimating;
              }
            }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <BackToTop />
      <Footer />
      <MobileBottomNav />
    </div>
  );
}

export default Layout;