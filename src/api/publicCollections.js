// src/api/publicCollections.js — anonymous public-collections client.
//
// Reads the same-origin /api/publicCollections endpoint that flattens PUBLIC
// collections from every user's cloud library. The surface is anonymous by
// contract: only name/publicId/itemCount (+ itemIds for a single lookup).
// Errors THROW as ExploreError instead of collapsing into `[]`: the old
// fails-soft behavior made a broken backend indistinguishable from "nobody
// published anything", which is how "my public collection is invisible to others"
// hid for weeks.

import { logDebug, logWarn } from '../utils/debugLogger';

/** Distinguishes backend failures from "empty result" for the Explore UI. */
export class ExploreError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'ExploreError';
    this.status = status;
  }
}

function apiBase() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

// List every public collection across users: [{ name, publicId, itemCount }].
// Throws on backend failure so Explore shows a real error + retry instead of a
// lying empty state.
export async function fetchPublicCollections({ signal } = {}) {
  try {
    const res = await fetch(`${apiBase()}/api/publicCollections`, { signal });
    if (!res.ok) {
      logWarn('publicCollections', `Listing public collections answered ${res.status}.`, {
        status: res.status,
      });
      throw new ExploreError(`Public collections endpoint answered ${res.status}.`, { status: res.status });
    }
    const data = await res.json();
    const list = Array.isArray(data?.collections) ? data.collections : [];
    logDebug('publicCollections', `Fetched ${list.length} public collections.`, { count: list.length });
    return list;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (error instanceof ExploreError) throw error;
    logWarn('publicCollections', 'Public collections endpoint unreachable.', {
      message: error?.message,
    });
    throw new ExploreError(error?.message || 'Network error', {});
  }
}

// Fetch one collection by its opaque publicId: { name, publicId, itemIds }.
// null for a genuinely missing collection; throws when the backend fails, so a
// shared link can tell "gone" from "broken" and offer a retry.
export async function fetchPublicCollection(publicId, { signal } = {}) {
  if (!publicId) return null;
  try {
    const res = await fetch(`${apiBase()}/api/publicCollections?publicId=${encodeURIComponent(publicId)}`, { signal });
    if (!res.ok) {
      logWarn('publicCollections', `Looking up public collection answered ${res.status}.`, {
        publicId,
        status: res.status,
      });
      throw new ExploreError(`Public collection lookup answered ${res.status}.`, { status: res.status });
    }
    const data = await res.json();
    return data?.collection || null;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (error instanceof ExploreError) throw error;
    logWarn('publicCollections', `Public collection lookup unreachable for ${publicId}.`, {
      publicId,
      message: error?.message,
    });
    throw new ExploreError(error?.message || 'Network error', { publicId });
  }
}