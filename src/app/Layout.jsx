import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";
import LiquidGlassDefs from "../components/LiquidGlassDefs";
import BackToTop from "../components/BackToTop";
import Footer from "../components/Footer";
import Header from "./Header";
import MobileBottomNav from "./MobileBottomNav";
import { useScrollRestoration } from "../hooks/useScrollRestoration";

function Layout({ children }) {
  useScrollRestoration();
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  return (
    <div className="app-container">
      <LiquidGlassDefs />
      <Header />

      {/* Main Content Area with Page Transitions */}
      <main className="app-main" id="main-content" tabIndex={-1}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
            style={{ flex: 1 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
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