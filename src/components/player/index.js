/* Player chrome leaves — the five HUD overlays the LEGACY player still renders.

   NOTE: this directory is on the Phase 6 DELETE list (task.md 1.3), superseded
   by ./v2. The previous version of this comment credited the chrome to a
   component name that does not exist anywhere in the repo — a leftover from an
   old rename. That dead name had spread into prd.md and four other files, so it
   was worth fixing here rather than leaving a wrong pointer in the tree for the
   rest of the rollout. Guarded by playerV2Structure.test.js.

   These five still have live render sites inside NativePlayerView.jsx, so they
   cannot be deleted ahead of that file — unused BY V2 is not the same as
   unused. Deleting them now would break the legacy fallback path.

   ArcRing, LoadingArc and NetflixBrightnessHUD were genuinely dead (zero render
   sites repo-wide, only reachable through this barrel) and have been removed.
   NetflixBrightnessHUD was already unreferenced by the legacy player, so the
   brightness overlay the legacy player imported has never actually rendered. */

export { default as NetflixVolumeHUD } from "./NetflixVolumeHUD";
export { default as NetflixAspectHUD } from "./NetflixAspectHUD";
export { default as NetflixSeekHUD } from "./NetflixSeekHUD";
export { default as NetflixPlayPauseHUD } from "./NetflixPlayPauseHUD";
export { default as NetflixHold2xHUD } from "./NetflixHold2xHUD";