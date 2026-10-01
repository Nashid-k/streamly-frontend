/* Player chrome leaves — Netflix-style HUD overlays + decorative arcs,
   extracted from NativePlayerView so the big player stays lean.

   NOTE: this whole directory is on the Phase 6 DELETE list (task.md 1.3),
   superseded by ./v2. The previous version of this comment credited the chrome
   to a component name that does not exist anywhere in the repo — a leftover
   from an old rename. That dead name had spread into prd.md and four other
   files, so it was worth fixing here rather than leaving a wrong pointer in the
   tree for the rest of the rollout. Guarded by playerV2Structure.test.js. */

export { default as ArcRing } from "./ArcRing";
export { default as LoadingArc } from "./LoadingArc";
export { default as NetflixVolumeHUD } from "./NetflixVolumeHUD";
export { default as NetflixBrightnessHUD } from "./NetflixBrightnessHUD";
export { default as NetflixAspectHUD } from "./NetflixAspectHUD";
export { default as NetflixSeekHUD } from "./NetflixSeekHUD";
export { default as NetflixPlayPauseHUD } from "./NetflixPlayPauseHUD";
export { default as NetflixHold2xHUD } from "./NetflixHold2xHUD";