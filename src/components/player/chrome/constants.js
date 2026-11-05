// Shared constants for the player chrome.
//
// These used to live as module-level consts in NativePlayerView.jsx, which meant
// every leaf component that needed one had to reach back into the engine. They
// are presentation policy, so they belong to the chrome layer.
//
// Colours come from ./theme (the player's signal palette); this module carries
// only geometry and layout policy.


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