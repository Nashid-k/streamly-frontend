# Player motion consolidation — single scoped task

## Objective
Finish the player motion system that is already ~80% built: remove CSS
duration/easing drift, give the four motionless surfaces real motion, and close
the reduced-motion blind spots in the inline SVG arcs. No visual redesign — the
Netflix chrome, layout and springs stay exactly as they are.

## Why this and not a redesign
`src/constants/motion.js` already publishes 7 named spring roles, a duration
scale, one easing curve and 5 shared shapes; `motion.test.js` (22 tests) forbids
raw spring physics anywhere in `src/` and forces dialogs/HUDs onto shared
shapes. The player already runs 38 `AnimatePresence` + 17 `motion.*`. What is
missing is convergence, not invention.

## Scope (all four, one task)

### 1. Retire hardcoded durations in `src/styles/player.css`
27 duration literals across 14 transition/animation rules; only 3 uses of
`var(--duration-*)`. Map by intent, not blanket-replace:

| Literal | Count | Action |
|---|---|---|
| `0.18s var(--ease-out)` | 6 rules | keep duration; it is the JS `DURATION.FAST` twin, NOT a token (see note) |
| `0.18s ease` | 4 rules | `--ease-out` + `DURATION.FAST` |
| `0.2s` / `0.12s` / `0.15s` / `0.14s` / `0.1s` | 8 rules | nearest token, or add `--duration-instant: 120ms` if none fits |

Note: `DURATION.FAST = 0.18`s in JS vs `--duration-fast: 200ms` in CSS is
DELIBERATE and documented (motion.js:53-56) — micro-interactions are authored
at 0.18s. Do NOT "fix" this by rewriting 0.18s -> 200ms; that is a visual
change, not a cleanup. Standardise the *easings* (bare `ease` -> `--ease-out`)
and add tokens only for durations with no existing home.

### 2. Give the four motionless surfaces motion
`CollectionPickerDialog`, `AddTitlesDialog`, `CollectionNameDialog`,
`AccountMenu` — verified 0 framer imports, 0 `motion.*`, 0 transitions.
Adopt the existing `MODAL_PANEL` + `FADE` tokens and wrap in `AnimatePresence`,
matching what `ConfirmDialog` / `GlobalShortcuts` already do.

### 3. Close the inline-SVG reduced-motion gap
`ArcRing.jsx:17,29` and `LoadingArc.jsx:49` set `stroke-dashoffset` transitions
inline (0.25s / 1s). CSS `@media (prefers-reduced-motion)` cannot override
inline styles, so these three arcs ignore the viewer preference entirely.
`LoadingArc.jsx:19` also spins forever via framer. Route all four through
`useReducedMotion()` + `motionSafe()`.

### 4. Publish the PRESS scale token
`SPRING.PRESS` exists in JS but has no CSS counterpart, and 8 different
hover/press scales are unreconciled across `buttons.css`, `Button.jsx`,
`Chip.jsx`, `grids.css`, `hero.css`. Add `--press-scale` to `tokens.css` and
point the player surfaces at it. Leave the non-player files alone unless the
value is already identical (no behaviour change).

## Out of scope (explicitly NOT in this task)
- Visual restyle of transport bar, scrub bar, dialogs, HUDs (~89 tests pin them)
- Mobile sheet geometry: `.modal-container` `transform: none !important`
  (`responsive.css:234`) still kills framer's inline transform on phones. The
  real fix — move centring onto a wrapper — changes dialog geometry on every
  phone and cannot be verified without a browser. Stays open.
- `task.md:3646` player browser verification — needs a human with a browser
- `task.md:3683` AutoFlip — no such identifier exists anywhere in the tree;
  needs a pointer to the real feature, not an invented implementation

## Acceptance criteria
1. Count of `\b0\.[0-9]+s\b` in `src/styles/player.css` drops from 27, and
   every surviving literal is either intentional-and-commented or tokenised
2. No bare `ease` in `player.css` transitions (only `--ease-out` / token values)
3. All four surfaces import from `constants/motion` and render through
   `AnimatePresence`
4. `ArcRing` / `LoadingArc` collapse to a cut under `prefers-reduced-motion`
5. New `motion.test.js` cases fail against the old code and pass against the
   new: (a) no bare `ease` in `player.css`, (b) the four surfaces adopt
   `MODAL_PANEL`/`FADE`, (c) no un-guarded inline `stroke-dashoffset`
   transition
6. Gates: `npm run lint` 0 errors, `npm run test` 80 files all green,
   `npm run build` green
7. `task.md` records the sweep, the deliberate 0.18s/200ms split, and what was
   left out

## Risks
- Item 4 touches shared CSS; keep values identical unless a token already
  matches, so the change is provably behaviour-preserving
- Item 2 adds framer imports to 4 files: watch the `motion.test.js` rule that
  every file naming `SPRING.X` must import from `constants/motion`
- Existing flake to leave alone: `playerA11y.test.jsx > "hides the Skip Intro
  pill behind an open panel"` (bare `getByRole` racing `AnimatePresence`, fails
  only under parallel load, passes in isolation)