import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SPRING, FADE, MODAL_PANEL, REVEAL, revealAt } from "../constants/motion";

/**
 * Shared reduced-motion-aware motion leaf for the heaviest non-chrome sites
 * (TitleDetails, Settings, dialogs, pickers, History, Ratings, BackToTop, Popover,
 * CastRail, ServerOrderList, SignInDialog, VerifyEmailPage, GlobalShortcuts).
 *
 * Those sites import the raw SPRING / FADE / MODAL_PANEL tokens from
 * constants/motion and spread them without branching on the motion preference,
 * so springs keep settling under reduced motion. This wrapper resolves the
 * preference once (at the top of the component) and hands back pre-checked
 * shapes, so a call site writes `L.Modal.panel` instead of `MODAL_PANEL` and
 * cannot forget the reduced-motion check.
 *
 * Under reduced motion every transition collapses to a cut
 * ({ duration: 0 }), matching the chrome contract in constants/motion and the
 * CSS `prefers-reduced-motion` block in player.css.
 */
export function MotionLeaf() {
  const reduceMotion = useReducedMotion();

  return useMemo(
    () => {
      const cut = { duration: 0 };
      const spring = (role) => (reduceMotion ? cut : SPRING[role]);
      return {
        reduced: reduceMotion,
        Fade: reduceMotion
          ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: cut }
          : { ...FADE, transition: FADE.transition },
        // The canonical scroll-reveal and its staggered sibling, pre-checked so
        // a section and its headings cannot each pick their own travel again.
        Reveal: reduceMotion
          ? { initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true }, transition: cut }
          : { ...REVEAL, transition: REVEAL.transition },
        RevealAt: (delay = 0) =>
          reduceMotion
            ? { initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true }, transition: cut }
            : revealAt(delay),
        Modal: {
          panel: reduceMotion
            ? {
                initial: { opacity: 0, scale: 1, y: 0 },
                animate: { opacity: 1, scale: 1, y: 0 },
                exit: { opacity: 0, scale: 1, y: 0 },
                transition: cut,
              }
            : { ...MODAL_PANEL, transition: MODAL_PANEL.transition },
          panelExit: reduceMotion
            ? { opacity: 0, scale: 1, y: 0, transition: cut }
            : { ...MODAL_PANEL.exit, transition: MODAL_PANEL.transition },
        },
        Spring: Object.fromEntries(
          Object.entries(SPRING).map(([role]) => [role, spring(role)]),
        ),
      };
    },
    [reduceMotion],
  );
}

/**
 * Tiny presentational wrapper for the most common case: a single motion element
 * that should fade in (and fade out on exit), collapsing to a cut under reduced
 * motion. Used for backdrop veils and small enter/exit shapes that do not need
 * the full MODAL_PANEL travel.
 */
export function MotionFade({ children, ...rest }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : FADE.transition}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
