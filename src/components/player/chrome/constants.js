// Shared constants for the player chrome.
//
// These used to live as module-level consts in NativePlayerView.jsx, which meant
// every leaf component that needed one had to reach back into the engine. They
// are presentation policy, so they belong to the chrome layer.
//
// Colours come from ./theme (the Apple TV+ palette); this module carries only
// geometry and layout policy.
import { SKIP_BAND } from "./theme";

// Touch-first devices (hover-less, coarse pointer) get bigger tap targets and a
// stacked settings panel; mouse/trackpad keeps the desktop chrome.
export const IS_TOUCH =
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(hover: none), (pointer: coarse)").matches;

export const BTN_SIZE = IS_TOUCH ? 44 : 40;

// The top of the picture: 16px on desktop, safe-area inset on touch devices.
export const SAFE_TOP = IS_TOUCH ? "calc(16px + env(safe-area-inset-top, 0px))" : "16px";
// The bottom of the picture: 24px on desktop, safe-area inset on touch devices.
export const SAFE_BOTTOM = IS_TOUCH ? "calc(20px + env(safe-area-inset-bottom, 0px))" : "24px";

// Measured skip windows drawn on the scrubber track. A single frozen style so
// the band colour has exactly one definition (it used to be repeated as a
// literal twice); position/width are spread in per band.
export const SCRUBBER_BAND_STYLE = {
  position: "absolute",
  top: 0,
  bottom: 0,
  background: SKIP_BAND,
  pointerEvents: "none",
};

// Centre-screen rewind/forward chevrons sit directly on the picture with no
// plate behind them, so a light shadow is the only thing keeping them readable
// over a white frame.
export const CENTER_GLYPH_SHADOW = { filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.8))" };