// Bounded session cache of image URLs that have finished decoding in the browser.
// Lets remounting cards (Back C->B->A) and details surfaces (B->C) paint at
// opacity: 1 on frame 0 so Chromium View Transitions morph crisp artwork instead
// of flashing fallback gradients while <img> mount listeners fire.

const MAX_CACHE_ENTRIES = 500;
const loadedUrls = new Set();

export function hasLoadedMediaUrl(url) {
  return Boolean(url && loadedUrls.has(url));
}

export function markMediaUrlLoaded(url) {
  if (!url) return;
  if (loadedUrls.size >= MAX_CACHE_ENTRIES) {
    loadedUrls.clear();
  }
  loadedUrls.add(url);
}
