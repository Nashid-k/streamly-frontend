import '@testing-library/jest-dom';

/* ── Shared jsdom gaps ───────────────────────────────────────────────────
   jsdom implements neither matchMedia nor ResizeObserver, and both are read by
   plain page components (useIsTouch, useReducedMotion, Framer's layout
   measurement). Without a default every suite that mounts a page re-stubbed
   them by hand — and the ones that forgot failed with "window.matchMedia is
   not a function", which reads like a product bug rather than a missing shim.

   These defaults are deliberately inert: matchMedia reports "no match" for
   every query. Suites that need real query semantics (the player's IS_TOUCH
   path) still stub matchMedia themselves in their own beforeEach — vi.stubGlobal
   replaces this, and their afterEach restores it. */

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (typeof window !== 'undefined' && typeof window.ResizeObserver !== 'function') {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window !== 'undefined' && typeof window.scrollTo !== 'function') {
  window.scrollTo = () => {};
}
