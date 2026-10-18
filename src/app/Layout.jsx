import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { DURATION, EASE_OUT } from "../constants/motion";
import BackToTop from "../components/BackToTop";
import Footer from "../components/Footer";
import OfflineBanner from "../components/OfflineBanner";
import Header from "./Header";
import MobileBottomNav from "./MobileBottomNav";
import { useScrollRestoration } from "../hooks/useScrollRestoration";

function Layout({ children }) {
  useScrollRestoration();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const mainRef = useRef(null);

  /* Move focus to the main landmark on route change so keyboard and screen
     reader users land in the new page instead of being left on the nav link
     they just activated. `preventScroll` keeps the scroll-restoration logic in
     charge of position. */
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header />
      <OfflineBanner />

      {/* Main Content Area with Page Transitions.
          Enter-fade + subtle rise, no AnimatePresence exit: the exit animation
          kept the old page mounted for 180 ms while useScrollRestoration fired
          window.scrollTo(0, 0), so the outgoing page visibly jumped to top
          before fading out. Without an exit the old page unmounts instantly
          (the scroll reset is invisible) and the new page fades in with a
          gentle upward settle. */}
      <main className="app-main" id="main-content" tabIndex={-1} ref={mainRef}>
        <motion.div
          key={location.pathname}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: DURATION.MED, ease: EASE_OUT }
          }
          style={{ flex: 1 }}
        >
          {children}
        </motion.div>
      </main>

      {/* Back to top */}
      <BackToTop />

      {/* Global footer — Streamly wordmark, disclaimer, contact */}
      <Footer />

      {/* Mobile Bottom Navigation — Cinejoy-style floating icon pill */}
      <MobileBottomNav />
    </div>
  );
}

export default Layout;