/* Cross-route banner record (cinejoy parity).
 *
 * Observed on cinejoy.pk (live playwright run, Temp/opencode/cinejoy-rt):
 * navigating home → movies while the banner shows a movie keeps that exact
 * banner on screen (same backdrop + logo, no skeleton) while the rest of the
 * page skeletons in; a kind mismatch swaps the banner over a skeleton; a
 * revisit restores instantly with zero refetch. Their pages share one
 * "what is on the big picture right now" record.
 *
 * This module is that record for Streamly: the home hero and the browse
 * banners publish their active slide whenever it changes; a browse banner
 * reads it on mount to decide carry-vs-skeleton. Module scope on purpose —
 * no storage APIs, so no localStorage contract is touched.
 *
 * Entry shape: a snapshot of the on-screen normalized title (the frozen
 * normalizeResult fields) with a resolved `mediaType` ("movie" | "tv"). */

let memory = null;

export function getBannerMemory() {
  return memory;
}

export function setBannerMemory(entry) {
  if (!entry || entry.id == null || !entry.mediaType) return;
  memory = entry;
}

export function clearBannerMemory() {
  memory = null;
}
