# Player architecture — and the plan to make it redesignable

Status: **split in progress.** This file exists so every future extraction is a
mechanical move rather than an archaeology exercise, and so a from-scratch
redesign can eventually replace the view layer without touching the engine.

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

Current: **4,943 lines**.

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
    useSourceResolve.js     resolve → probe → attempt ordering, failover, token refresh
    useAudioSwitch.js       pickAudio / pickDub (in-manifest and sibling-manifest)
    useQualitySwitch.js     pickQuality / pickSourceQuality
    useSubtitles.js         track list, engine wiring, styling persistence
  hooks/                  ← reusable component behaviour
    usePlayerHud.js         ✅ done
    usePlaybackExtras.js    ✅ done
    useChromeVisibility.js  controls visible, poke, idle hide, cursor
    useStillWatching.js     idle prompt + auto-advance streak guard
    useHold2x.js            hold-to-2x + release restore
    usePlayerKeyboard.js    the desktop key map
    useScrubber.js          drag/keyboard seek + rollback
  shell/                  ← PRESENTATION ONLY. This is what a redesign replaces.
    PlayerShell.jsx         the surface + overlay composition
    PlayerTransport.jsx     scrubber + transport row
    PlayerMenus.jsx         servers / audio / quality / subtitles panels
  chrome/                 ← existing presentational primitives (keep)
    BottomChrome, CenterStack, ChromeTopBar, PlayerPanel, DialogRow,
    EpisodesRail, SkipPill, SubtitleOverlay, TapToUnmutePill, primitives
  nativePlayer{Hold,Gestures,Keys,Helpers}.js   ← pure decision tables (keep)
```

`chrome/` stays because it is already presentational and testable. The goal is
that `shell/` contains **no `useEffect` and no ref**, so swapping it out is a
layout exercise.

## Ordered slices (next first)

1. ~~`useChromeVisibility`~~ ✅ done
2. ~~`useStillWatching`~~ ✅ done — **merged into `usePlayerChrome`**, because
   `poke` re-arms both timers under one rate limit and a split would have
   invented a three-callback contract harder to follow than the code it
   replaced.
3. ~~`useHold2x`~~ ✅ done. The input layer (the timers that decide a press is
   long enough) stays in the player; the hook owns engaging, releasing, the
   rate latch and the safety net.
4. **`useScrubber`** — drag state, the preview pipeline, `seekRelative`,
   `seekTo`, the seek rollback on failure.
5. **`useSubtitles`** — `SubtitleFetcher` + `SubtitleEngine` wiring, track list,
   styling persistence (`SUB_SIZE_STORAGE_KEY`, `SUB_BG_STORAGE_KEY`).
6. **`useQualitySwitch` / `useAudioSwitch`** — the two `loadSource()` swap paths.
   Both currently live inside the resolve effect's closure; they need the
   resolve effect split first.
7. **`useSourceResolve`** — the last and hardest: the attempt loop, warm-resolve
   handover, relay fallback, fatal latch, reload carry. Split only after 6.

Only after all seven does `shell/` become swappable for a redesign.

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
