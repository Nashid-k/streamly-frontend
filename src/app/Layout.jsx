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
import { NAV_ITEMS } from "../constants/navigation";
import {
  getRouteVariant,
  REDUCED_ROUTE_TRANSITION,
  REDUCED_ROUTE_VARIANTS,
  ROUTE_TRANSITIONS,
  ROUTE_VARIANTS,
} from "../constants/routeMotion";

/* Depth ladder for direction: the dock tabs and utility screens share one
   rail level; genre/category/collection screens sit a step deeper and the
   watch/person screens a step deeper still. */
const ROUTE_DEPTH_SLOT = (pathname) => {
  if (pathname === "/") return 0;
  if (/^\/(genre|category|collections|public-collection|explore\/collections)/.test(pathname)) return 2;
  if (/^\/watch\//.test(pathname) || /^\/person\//.test(pathname)) return 3;
  return 1;
};

/* Which way is "forward"? Back/forward (POP) re-enters from the left — you
   came back the way you left. A PUSH into deeper pages arrives from the
   right and into shallower pages from the left; a PUSH between sibling dock
   tabs rides the rail itself (the sign of the tab move). +1 = travelling
   right/forward. */
function routeDirection(prevPath, nextPath, navigationType) {
  if (!prevPath || prevPath === nextPath) return 1;
  if (navigationType === "POP") return -1;
  const from = ROUTE_DEPTH_SLOT(prevPath);
  const to = ROUTE_DEPTH_SLOT(nextPath);
  if (from !== to) return to > from ? 1 : -1;
  const fromTab = NAV_ITEMS.findIndex((item) => item.match(prevPath));
  const toTab = NAV_ITEMS.findIndex((item) => item.match(nextPath));
  if (fromTab < 0 || toTab < 0 || fromTab === toTab) return 1;
  return toTab > fromTab ? 1 : -1;
}

function Layout({ children }) {
  useScrollRestoration();
  const location = useLocation();
  const osReduced = useReducedMotion();
  const prefs = useOptionalPreferences();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const mainRef = useRef(null);
  /* Previous path is committed in an effect so THIS render still sees it —
     writing during render would erase it before direction is computed. */
  const prevPathRef = useRef(null);
  const navigationType = useNavigationType();
  // Reading (never writing) the previous-path ref during render is the
  // render-sees-what-was-committed trick: the effect below is its only writer,
  // so this read is deterministic and cannot tear.
  // eslint-disable-next-line react/refs
  const dir = routeDirection(prevPathRef.current, location.pathname, navigationType);

  useEffect(() => {
    prevPathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const main = mainRef.current;
    if (main?.contains(document.activeElement)) return;
    main?.focus({ preventScroll: true });
    // Pathname only: a query-string update is in-page state, so it must not
    // yank focus out of a live input (the search box) into the page shell.
  }, [location.pathname]);

  /* The transition key is the PATH, never the full URL. Keying on the query
     string remounted the whole page on every debounced `?q=` sync — the search
     box lost its caret after each keystroke (the input was destroyed, then the
     focus-main effect below claimed focus), typed characters that had not made
     it into the URL yet were dropped, the document jumped to the top and a
     full route transition played per letter. A query-string change is in-page
     state (live search, browse filters, settings tabs): the mounted page must
     survive it, so it animates nothing. */
  const routeKey = location.pathname;
  const variant = getRouteVariant(location.pathname);

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
     the scroll at commit. The `custom` directions both planes share come from
     `routeDirection`; AnimatePresence forwards it to the exiting page. */
  const variants = reduceMotion ? REDUCED_ROUTE_VARIANTS[variant] : ROUTE_VARIANTS[variant];
  const enterTransition = reduceMotion ? REDUCED_ROUTE_TRANSITION : ROUTE_TRANSITIONS[variant];

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header />
      <OfflineBanner />

      <main className="app-main" id="main-content" tabIndex={-1} ref={mainRef}>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={routeKey}
            custom={dir}
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
              transform: "translateZ(0)",
              willChange: reduceMotion ? "auto" : "transform, opacity",
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
