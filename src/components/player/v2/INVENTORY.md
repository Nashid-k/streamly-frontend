# PLAYER V2 — verified KEEP / DELETE inventory

**Every line reference below was re-verified against the code**, not carried
over from the audit. Two claims did not survive that check and are corrected
here; they are marked **[CORRECTED]**. The rest were confirmed exactly.

This file exists so Phase 6 is mechanical. `task.md` 1.1/1.3 wanted these lists
as comments inside `PlayerShell`, but `PlayerShell` does not exist until 2.1 —
writing them into a stub would have meant either an empty component or a
placeholder that ships. `PlayerShell` should link here when it lands.

---

## KEEP — carry these deliberately, do not "simplify" them away

From the old loader (`NativePlayerView.jsx`):

| What | Where | Why it survives |
|---|---|---|
| Blurred `backdropUrl` art | `.np-loading-art`, `:345` | Gives the loader an identity; it is the app's signature loading moment. Reimplemented as `.pv2-loading-art`. |
| Centred `posterUrl` logo | `.np-loading-poster`, `:392` | Poster logo is a PNG with unpredictable edges; it is the only place the title art appears. Reimplemented as `.pv2-loading-logo`. |
| No-logo text fallback | `:405` | The logo cannot be assumed present. |
| `role="status"` + `aria-label="Loading video"` | `:3825-3827` | **Accessibility.** A loading surface with no live-region announcement is invisible to a screen reader — the exact reason the buffered wait felt like a hang. |

Capability (kept regardless of where it renders): every source/server option,
resume, prev/next episode across seasons, subtitle language + font/size/colour,
audio/dub + delay sync, quality selection, PiP, hold-2x, volume/brightness HUDs,
seek/buffer/preview scrubbing, and watch-party host authority.

---

## DELETE — Phase 6, in this order

### 1. `player/` legacy chrome (safe now — v2 lives in `player/v2/`)
- `ArcRing.jsx`, `LoadingArc.jsx`
- `NetflixAspectHUD.jsx`, `NetflixBrightnessHUD.jsx`,
  `NetflixHold2xHUD.jsx`, `NetflixPlayPauseHUD.jsx`,
  `NetflixSeekHUD.jsx`, `NetflixVolumeHUD.jsx`
- `index.js` (also the stale-name comment — see 1.8)

### 2. `src/styles/player.css` (981 lines)
Contains the orphaned `.void-*` family — **but deleting lines 2-58 is not
enough**: the same classes are also listed in the two reduced-motion blocks at
`:707-710` and `:732-734`. Removing only the definitions leaves four dead
selectors in the reduced-motion lists. Confirmed **zero** `.void-` usage in any
`.js`/`.jsx`, so the whole family is safe to remove once those two lists are
edited too.

### 3. `src/constants/playerUi.js`
- Spring vocabulary (hand-typed springs; the real motion tokens live in
  `motion.js`, and v2 uses `--ease-out`/`--duration-*`).
- `AR_GLYPH` — a hand-authored 6×2 coordinate grid for aspect-ratio boxes.
- `hudMetrics`.

### 4. `src/constants/motion.js` springs
v2 declares no spring. Retain the file itself only if the wider app still uses
it.

### 5. `src/components/NativePlayerView.jsx` + its flag branch
Only after 6.8 passes. The flag (`VITE_PLAYER_LEGACY`) and this file die in the
same commit, so no permanent dual-path code survives.

---

## DELETE — inside `NativePlayerView.jsx` (never reimplemented in v2)

**`FUN_FACTS`, `:285-295` [CORRECTED]** — the plan called this a "fun-fact
rotator". It is not facts. It is a 9-entry array of **fabricated loading
messages**: `"Reticulating splines..."`, `"Rolling film..."`,
`"Grabbing the popcorn..."`. Decorative filler that reports work the player is
not doing. Worse than cosmetic — a buffering wait paired with fake progress text
is the app lying about its own state. Delete outright.

**Fake "Original" audio row, `:5002-5007`** — confirmed. A `DialogRow` with
`key="original"`, a hardcoded `selected`, a title and a `sub`, and **no
`onClick`**. It is a read-only label dressed as a selectable control: it looks
like something you can click, and clicking it does nothing.

**Duplicate `@keyframes upNextCountdown`** — confirmed, and the mechanism is
worth writing down:
- `player.css:470` drains — `scaleX(1)` → `scaleX(0)`
- `NativePlayerView.jsx:1976` injects at runtime — `scaleX(0)` → `scaleX(1)`

The runtime-injected one is later in document order, so **it wins**. The Up Next
countdown bar therefore fills **up** while the label counts **down** — the two
animations contradict each other. Fixing it means deleting the runtime injection,
not editing the stylesheet.

---

## Brand colour

**`NETFLIX_RED = "#E50914"`, `NativePlayerView.jsx:95` [CORRECTED]** — the plan
claimed ~12 hardcoded red sites. There are **5** (`:182`, `:238`, `:4205`,
`:4217`, `:4664`) plus the definition. No definition exists in `player.css`;
all five are inline JS styles in the component.

**Important correction to "the player is lime":** `--accent-primary` is
**user-selectable** across lime / purple / blue / red / amber plus a custom value
(`settings-ui.css:5-72`). Lime is the *default*, not a fixed brand. v2 must
consume `var(--accent-primary)`, never a literal lime — otherwise the player
silently disagrees with a viewer who picked another theme. This is enforced by
`playerV2Style.test.js`.

---

## CONSTRAINT — `components/Loader.jsx`

`src/components/Loader.jsx` stays app-wide (`page` / `inline` / `button` /
`global`) and **untouched**. No file under `player/v2/` may import it; v2 has its
own `.pv2-loading-*` surface.

Verified current importers, which must not grow: `app/routes.jsx`, `App.jsx`,
`pages/TitleDetailsPage.jsx`. `NativePlayerView.jsx` imports
`api/nativeHlsLoader` (`createStreamlyLoader`) — a different module that happens
to contain the word "loader", not this component.