# Player architecture — and how the view layer was made redesignable

Status: **split complete; from-scratch redesign landed (2026-11-04).** This file
exists so every future extraction is a mechanical move rather than an
archaeology exercise, and so a from-scratch redesign can replace the view layer
without touching the engine.

## Where we are

`src/components/NativePlayerView.jsx` started at **5,275 lines** in one
component. Measured inventory at the start of the split:

| Thing | Count |
|---|---|
| `useState` | 65 |
| `useRef` | 84 |
| `useEffect` | 41 |
| handler closures | 47 |
| JSX render body | ~880 lines |

That is not a styling problem — a redesign cannot land on it, because the
presentation and the stream lifecycle share one closure.

### Progress

| Slice | Moved to | Lines removed |
|---|---|---|
| HUD state + auto-dismiss | `player/hooks/usePlayerHud.js` | ~15 |
| Sleep timer, loop, PiP, fullscreen | `player/hooks/usePlaybackExtras.js` | ~120 |
| Chrome autohide + still watching (slices 1+2 merged) | `player/hooks/usePlayerChrome.js` | ~130 |
| Hold-to-2x, rate latch, safety net (slice 3) | `player/hooks/useHold2x.js` | ~75 |
| Scrubber, seeking, frame preview (slice 4) | `player/hooks/useScrubber.js` | ~230 |
| Subtitles: list, pick, cues, styling (slice 5) | `player/hooks/useSubtitles.js` | ~160 |
| Quality switching: rung, source ladder, Auto (6a) | `player/engine/useQualitySwitch.js` | ~250 |
| Audio switching: in-manifest + sibling dubs (6b) | `player/engine/useAudioSwitch.js` | ~270 |
| Source resolving: attempt loop, warm handover, relay fallback, fatal latch, reload carry (7) | `player/engine/useSourceResolve.js` | ~854 |
| Menu bodies: settings, servers, subtitles, audio, video, speed, aspect, substyle, source quality, sleep (8) | `player/shell/PlayerMenus.jsx` | ~396 |
| Transport binding: scrubber + transport row (9) | `player/shell/PlayerTransport.jsx` | ~0 (seam; inline handlers became callbacks) |
| Surface + overlay composition: `<video>`, chrome layers, panel, HUDs, fatal banner (10) | `player/shell/PlayerShell.jsx` | ~385 (JSX) |
| Desktop key map: space tap-vs-hold, arrows, volume, aspect, mute, fullscreen, episode nav, Escape, Tab-reveal (11) | `player/hooks/usePlayerKeyboard.js` | ~88 |
| Video-element event mirror: play/pause/end/timeupdate/buffering/subtitles (12) | `player/hooks/useMediaElementEvents.js` | ~88 |

Current: **2,325 lines** (engine untouched by the redesign).

## Design language — “Signal” (2026-11-04)

The view layer was then rebuilt from scratch with no reference to the previous
player design. The design system lives in `player/chrome/theme.js` and the
player-scoped CSS tokens in `styles/player.css` (`.np-root`), so a future
redesign replaces those two files plus the chrome components — never the engine.

- **Accent:** Streamly's own signal green `#95ff50` (the app's brand accent),
  replacing the third-party red the old chrome borrowed. Played progress,
  selected rows, active glyphs, primary buttons and focus all resolve to it;
  `ACCENT_FG` (`#07120a`) is the dark glyph colour used on an accent fill.
- **Surfaces:** cool ink glass (`GLASS_*`, `DECK_*`) with a 26px deck radius,
  22px cards, 24px sheet. Menus, chips, tooltips and HUDs share one material.
- **Layout:** the transport is one floating **control deck** — a scrubber across
  its top edge, one control row beneath (`.np-deck`); the top bar is a floating
  glass **title chip** (`.np-title-chip`) instead of a full-width gradient band.
  Everything else is anchored to the deck: panel `bottom: 142/150`, skip pill,
  resume/up-next cards, subtitles and the fatal banner all clear its height.
- **Primary actions:** the deck play/pause, the touch centre play and the replay
  button are accent-filled discs with dark glyphs; Resume / Play now / Try again
  / Continue Watching are accent pills.
- **Cold open:** the resolve stage paints the title art over an ink field with a
  low accent pool behind it, and both loaders — the first-load sweep and the
  later-wait Tailspin ring — carry the signal colour.
- **Motion:** every interaction has a fluid answer — deck/chip border bloom,
  play-disc hover glow and press scale, icon-button disc + glyph scale, scrubber
  line/dot bloom, row cursor-tracked accent glow, skip-pill lift, card springs,
  tooltip pop, HUD pops. All of it collapses to a cut under
  `prefers-reduced-motion` (CSS block + `useMotionTokens`).
- **Tests:** presentation pins were updated where they named a visual value
  (`netflixPlayPauseHud` now asserts the theme accent fill); behaviour, roles,
  labels and the frozen contracts are untouched.

## The rule for this refactor

**Behaviour is frozen.** Every slice is a pure move: same timers, same event
listeners, same order of operations, same log messages. No slice is allowed to
"improve" an algorithm on the way out — that is how a refactor acquires bugs the
tests were not written for. Improvements get their own commit, after the move
is green.

Each slice must keep `npm run lint`, `npm run test` and `npm run build` green
before the next one starts.

## Target layout

```
src/components/player/
  engine/                 ← no JSX. The stream lifecycle.
    useSourceResolve.js     ✅ resolve → probe → attempt ordering, failover, token refresh
    useAudioSwitch.js       pickAudio / pickDub (in-manifest and sibling-manifest)
    useQualitySwitch.js     pickQuality / pickSourceQuality
    useSubtitles.js         track list, engine wiring, styling persistence
  hooks/                  ← reusable component behaviour
    usePlayerHud.js         ✅ done
    usePlaybackExtras.js    ✅ done
    useChromeVisibility.js  controls visible, poke, idle hide, cursor
    useStillWatching.js     idle prompt + auto-advance streak guard
    useHold2x.js            hold-to-2x + release restore
    usePlayerKeyboard.js    ✅ done — the desktop key map
    useScrubber.js          drag/keyboard seek + rollback
  shell/                  ← PRESENTATION ONLY. This is what a redesign replaces.
    PlayerShell.jsx         ✅ done — the surface + overlay composition
    PlayerTransport.jsx     ✅ done — scrubber + transport row binding
    PlayerMenus.jsx         ✅ done — servers / audio / quality / subtitles / settings pages
  chrome/                 ← existing presentational primitives (keep)
    BottomChrome, CenterStack, ChromeTopBar, PlayerPanel, DialogRow,
    EpisodesRail, SkipPill, SubtitleOverlay, TapToUnmutePill, primitives
  nativePlayer{Hold,Gestures,Keys,Helpers}.js   ← pure decision tables (keep)
```

`chrome/` stays because it is already presentational and testable. The goal is
that `shell/` contains **no `useEffect` and no ref of its own**, so swapping it
out is a layout exercise. It receives `videoRef` / `screenRef` / `scrubRef` /
`panelRef` to *attach* (the engine owns them) but never reads `.current`; every
ref-touching handler is a callback defined in the player.

## Ordered slices (next first)

1. ~~`useChromeVisibility`~~ ✅ done
2. ~~`useStillWatching`~~ ✅ done — **merged into `usePlayerChrome`**, because
   `poke` re-arms both timers under one rate limit and a split would have
   invented a three-callback contract harder to follow than the code it
   replaced.
3. ~~`useHold2x`~~ ✅ done. The input layer (the timers that decide a press is
   long enough) stays in the player; the hook owns engaging, releasing, the
   rate latch and the safety net.
4. ~~`useScrubber`~~ ✅ done. Drag arbitration, the once-per-frame hover, the
   queued-delta seek, `seekTo` / `safeSeek` / `seekRelative` and the preview
   decoder. The "suppress the preview while fetching" effect stays in the
   player: it reads the player's own buffer state.
5. ~~`useSubtitles`~~ ✅ done — track list, pick with a token race guard, the
   visible failure line, and the styling persistence.
6. **`useQualitySwitch`** ✅ done (`engine/useQualitySwitch.js`).
   **`useAudioSwitch`** ✅ done (`engine/useAudioSwitch.js`). Neither swap path
   needed the resolve effect split first: they reach the commit through
   `pickQualityRef`, which is a ref precisely so they can.
7. **`useSourceResolve`** ✅ done (`engine/useSourceResolve.js`) — the last and
   hardest: the attempt loop, warm-resolve handover, relay fallback, fatal latch,
   reload carry. Unlike 6a/6b this one owns the **load effect itself**: the run
   token, the `AbortController`, the media element teardown and the reload carry
   moved with the resolve. The moved body is byte-identical to the inline
   version (one intended substitution: `mergeBoundaries(...)` became
   `mergeBoundariesRef.current(...)`, because that `useCallback` is declared
   later in the player).

8. **`PlayerMenus`** ✅ done (`shell/PlayerMenus.jsx`). The ten menu pages moved
   as one presentational component; the player passes state and callbacks, and
   `PlayerPanel` still owns the sheet frame. The speed row's element write moved
   into an `onPickPlaybackRate` prop, so the shell never touches `videoRef`.

9. **`PlayerTransport`** ✅ done (`shell/PlayerTransport.jsx`). The
   `BottomChrome` call is now a named seam. The inline handlers that touched
   `skipSecondsRef`, `desktopHoldTimerRef`, `desktopHoldFiredRef`, the setters
   and `showHud` moved into named player callbacks, so the transport receives
   plain functions and owns no ref. This slice is a seam, not a line win: the
   block it moves is the same size as the call that replaces it.

10. **`PlayerShell`** ✅ done (`shell/PlayerShell.jsx`). The whole render tree
    moved: the frame, the `<video>` props, the dim, subtitle overlay, top bar,
    skip pills, centre stack, transport, cards, panel, episodes rail, HUD stack,
    still-watching prompt and fatal banner. The player's return is now a single
    `<PlayerShell>` with the 152-name contract. Every handler that read
    `suppressClickRef`, `skipSecondsRef`, `togglePlayRef`, `commitResumeRef`,
    `onCloseRef` or `videoRef.current` was lifted into a named player callback,
    and `useReducedMotion` moved into the shell, so the shell reads no ref and
    owns no effect. `PlayerMenus` and `PlayerTransport` are now composed by the
    shell, not by the player.

11. **`usePlayerKeyboard`** ✅ done (`hooks/usePlayerKeyboard.js`). The desktop
    key effect moved out of the player into the hook. The effect still binds
    once per panel flip (`[panel]`) and the decision tables
    (`keyboardAction` / `resolveSpaceRelease`) still live in
    `nativePlayerKeys` / `nativePlayerHold`, so the move is behaviour-preserving.
    The source-text pin in `nativePlayerHold.test.js` was updated to follow the
    new call site (same pattern as the `useHold2x` slice).

12. **`useMediaElementEvents`** ✅ done (`hooks/useMediaElementEvents.js`). The
    video-element event -> state mirror moved out of the player.

13. **From-scratch visual redesign** ✅ done. Presentation only, across
    `player/chrome/*`, `player/shell/*`, the HUD leaves,
    `NetflixStillWatching.jsx`, `theme.js` and `styles/player.css`. The engine,
    timers, listeners, log lines, roles and accessible names are unchanged.

The engine slices, the whole `shell/` layer, the desktop key hook and the
media-element mirror are now done, and the shell has been redesigned on top of
them. What remains in `NativePlayerView.jsx` is state, refs and effects that are
not yet hooks - the next splits are new hooks, not more JSX.

## Contracts that must NOT change during the split

These are frozen by `architecture.md` and are asserted by tests; a refactor
that touches them is out of scope:

- `normalizeResult` field names
- React Query keys, localStorage keys, route paths
- `PLAYER_SOURCES` / `AUTO_SOURCE` shapes and the `server` values the resolver
  echoes
- the `[Streamly][scope]` log format from `src/utils/debugLogger.js`

## Verification per slice

```bash
npm run lint
npm test -- --run src/__tests__/player*.test.* src/__tests__/nativePlayer*.test.*
npm run build
```

The player suite is the contract for the move; if a slice needs a test edited,
the slice changed behaviour and must be re-examined before it is committed.
