/* ── Motion tokens ─────────────────────────────────────────────────────────
   The player had SEVEN hand-typed springs (520/24, 500/28, 380/34, 380/30,
   380/28, 320/30, 320/26, 300/30, 300/25, 260/18) scattered across ~70 motion
   call sites, and the wider app had five more in components that were quietly
   re-deriving the same numbers. Two of those were near-identical pairs, so a
   viewer moving between the icon row and the settings sheet felt a difference
   that existed only as a typo.

   This file is the whole motion vocabulary. Anything that moves in the player
   picks a spring BY ROLE from `SPRING`, not a hand-tuned number. Retuning the
   player is then a change in one place instead of a sweep across the file, and
   a new surface cannot invent a sixth feel by accident.

   ── How the scale is derived ───────────────────────────────────────────────
   Springs are named for what they DO, and the numbers preserve what was
   already tuned in place:
     POP    — a small confirmation lands (checkmark, tick). Sharpest, because
              the element is tiny and the gesture is discrete.
     SNAPPY — a transient badge arrives and leaves on a timer (the seven HUDs).
              Unchanged from the single token they all already shared.
     LIFT   — a floating pill rides over the picture (Skip Intro, Skip Credits,
              Resume, Restart). Heavier than a HUD so it feels placed rather
              than flashed.
     SHEET  — a panel or a row of controls moves (side sheet, transport row).
              The slowest and softest; panels are large, so a fast spring reads
              as a snap.
     PRESS  — press/hover scale feedback. The loosest, because a scale is a
              direct-manipulation cue and must not overshoot the finger.

   POPOVER and TOAST exist because the app already had a real reason to feel
   different from the player, and flattening them would have been a downgrade:
   both carry a `mass` below 1, which makes them arrive faster and settle
   lighter. A menu has to feel like it is already open by the time you read it;
   a toast is an interruption and must not feel heavy. Those are different
   jobs, so they get their own roles rather than being rounded to a neighbour.

   The two values that were pure duplicates (icon row 300/30 vs sheet 320/30,
   plus 300/25 and 320/26) are folded into SHEET. That is the actual win here:
   not new numbers, but fewer *different* ones. */

/** Springs by role. Immutable-by-convention: spread, never mutate. */
export const SPRING = {
  POP: { type: "spring", stiffness: 520, damping: 24 },
  SNAPPY: { type: "spring", stiffness: 500, damping: 28 },
  LIFT: { type: "spring", stiffness: 380, damping: 30 },
  SHEET: { type: "spring", stiffness: 320, damping: 30 },
  PRESS: { type: "spring", stiffness: 260, damping: 18 },
  POPOVER: { type: "spring", stiffness: 500, damping: 34, mass: 0.9 },
  TOAST: { type: "spring", stiffness: 500, damping: 35, mass: 0.8 },
};

/* Non-spring timings. Springs cover anything with weight or gesture; these
   cover fades and opacity-only work, where a spring would overshoot past 1.
   FAST/NORMAL/SLOW here are the same scale CSS publishes as --duration-fast /
   --duration-normal / --duration-slow in tokens.css (fast is 0.18s in JS and
   200ms in CSS — the stylesheets author their micro-interactions at 0.2s, and
   the two must not drift further). Retune one and retune the other. */
export const DURATION = { FAST: 0.18, MED: 0.28, SLOW: 0.45 };

/* `useMotionTokens` is a hook, so it needs the import. Kept at the top of the
   file with the other module setup rather than added at the use site. */
import { useMemo } from "react";

/* The one easing curve for tweened motion. Matches the card curtain so the
   player and the cards decelerate identically. */
export const EASE_OUT = [0.16, 1, 0.3, 1];

/* Shared enter/exit shapes. Duplicated `initial`/`exit` objects drift: the same
   badge grew different exit values in two files. These are the canonical ones,
   so a HUD and a pill now read as siblings. */

/** A transient badge: the seven HUDs. Scale from below, never from the side. */
export const HUD_POP = {
  initial: { opacity: 0, scale: 0.86 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
  transition: SPRING.SNAPPY,
};

/** A floating pill over the picture. Enters from the edge it lives on so the
    eye is pulled toward the action rather than past it. */
export const PILL_IN = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 30 },
  transition: SPRING.LIFT,
};

/** A discrete confirmation (the settings checkmark). Overshoot is the point. */
export const CHECK_POP = {
  initial: { scale: 0.4, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: SPRING.POP,
};

/** Opacity-only fade, for things that must not move (scrims, veils). */
export const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DURATION.MED, ease: EASE_OUT },
};

/** A dialog or sheet panel. Six surfaces that all dim the page were arriving
    with four different travels (y 10/12/24, scale 0.88/0.94/0.97) on two
    different springs, so two dialogs in a row read as two products. One shape:
    a short 12px rise into a 6% scale-down, SHEET spring both ways. */
export const MODAL_PANEL = {
  initial: { opacity: 0, scale: 0.94, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 8 },
  transition: SPRING.SHEET,
};

/** Scroll-reveal for in-page sections and their headings. These drifted apart
    on the details page alone: some sections rose 20px, some only faded, some
    entered from the side, on two different durations and two different eases —
    so scrolling one page looked like scrolling three. One shape now: a 20px
    rise into place, one duration, one curve, one trigger. */
export const REVEAL = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: DURATION.SLOW, ease: EASE_OUT },
};

/** The reveal for the items inside a rail, where a short per-index stagger
    reads as one group arriving rather than a row of independent pops. */
export function revealAt(delay = 0) {
  return { ...REVEAL, transition: { ...REVEAL.transition, delay } };
}

/**
 * A transition that collapses to a cut when the viewer has asked for less
 * motion. `reduced` comes from framer-motion's `useReducedMotion`, which reads
 * the OS setting; the CSS half of this contract lives in player.css's
 * `prefers-reduced-motion` block, and the `<motion>` root carries
 * `reducedMotion="user"` so the tree obeys it by default too.
 */
export function motionSafe(reduced, transition) {
  return reduced ? { duration: 0 } : transition;
}

/**
 * The whole vocabulary, pre-checked against the viewer's motion preference.
 *
 * `motionSafe` was written for exactly this and then never called, so the
 * reduced-motion contract in the comment above it was aspirational. Wrapping each
 * token here means a call site writes `M.SHEET` instead of `SPRING.SHEET` and
 * cannot forget the check: the preference is resolved once, at the top of the
 * component, rather than at every transition.
 *
 * The shared shapes (HUD_POP, PILL_IN, CHECK_POP) are spread as whole objects
 * `{...PILL_IN}`, so they need the same treatment — hence returning them
 * rebuilt rather than as constants.
 */
export function useMotionTokens(reduced) {
  return useMemo(
    () => {
      const t = (transition) => motionSafe(reduced, transition);
      const withTransition = (shape) => ({ ...shape, transition: t(shape.transition) });
      return {
        SPRING: Object.fromEntries(
          Object.entries(SPRING).map(([role, transition]) => [role, t(transition)]),
        ),
        HUD_POP: withTransition(HUD_POP),
        PILL_IN: withTransition(PILL_IN),
        CHECK_POP: withTransition(CHECK_POP),
        FADE: withTransition(FADE),
        REVEAL: withTransition(REVEAL),
      };
    },
    [reduced],
  );
}
