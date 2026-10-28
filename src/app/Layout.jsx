import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";
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

  useEffect(() => {
    const main = mainRef.current;
    if (main?.contains(document.activeElement)) return;
    main?.focus({ preventScroll: true });
  }, [location.pathname]);

  const variants = reduceMotion ? REDUCED_ROUTE_VARIANTS[variant] : ROUTE_VARIANTS[variant];
  const enterTransition = reduceMotion ? REDUCED_ROUTE_TRANSITION : ROUTE_TRANSITIONS[variant];
  const exitTransition = reduceMotion ? REDUCED_ROUTE_TRANSITION : ROUTE_EXIT_TRANSITIONS[variant];

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header />
      <OfflineBanner />

      <main className="app-main" id="main-content" tabIndex={-1} ref={mainRef}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={routeKey}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{
              enter: enterTransition,
              exit: exitTransition,
            }}
            style={{
              flex: 1,
              minHeight: "100%",
              overflowX: "hidden",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "translateZ(0)",
            }}
            onAnimationStart={() => {
              if (mainRef.current) {
                mainRef.current.dataset.routeAnimating = "true";
              }
            }}
            onAnimationComplete={() => {
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