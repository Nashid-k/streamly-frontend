// src/api/publicCollections.js — anonymous public-collections client.
//
// Reads the same-origin /api/publicCollections endpoint that flattens PUBLIC
// collections from every user's cloud library. The surface is anonymous by
// contract: responses contain only name/publicId/itemCount (+ itemIds for a
// single lookup) and never an owner identity. Fails soft — an unavailable
// backend degrades to an empty listing, never a crash.

import { logDebug, logWarn } from '../utils/debugLogger';

function apiBase() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

// List every public collection across users: [{ name, publicId, itemCount }].
// Returns [] with a warn log when the endpoint is unreachable/unconfigured so
// the Explore page can degrade to the viewer's own local public collections.
export async function fetchPublicCollections({ signal } = {}) {
  try {
    const res = await fetch(`${apiBase()}/api/publicCollections`, { signal });
    if (!res.ok) {
      logWarn('publicCollections', `Listing public collections answered ${res.status} — treat as empty.`, {
        status: res.status,
      });
      return [];
    }
    const data = await res.json();
    const list = Array.isArray(data?.collections) ? data.collections : [];
    logDebug('publicCollections', `Fetched ${list.length} public collections.`, { count: list.length });
    return list;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    logWarn('publicCollections', 'Public collections endpoint unreachable — falling back to empty listing.', {
      message: error?.message,
    });
    return [];
  }
}

// Fetch one public collection by its opaque publicId: { name, publicId, itemIds }.
// Returns null (warn-logged) when missing/unreachable.
export async function fetchPublicCollection(publicId, { signal } = {}) {
  if (!publicId) return null;
  try {
    const res = await fetch(`${apiBase()}/api/publicCollections?publicId=${encodeURIComponent(publicId)}`, { signal });
    if (!res.ok) {
      logWarn('publicCollections', `Looking up public collection answered ${res.status} — treat as missing.`, {
        publicId,
        status: res.status,
      });
      return null;
    }
    const data = await res.json();
    return data?.collection || null;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    logWarn('publicCollections', `Public collection lookup unreachable for ${publicId}.`, {
      publicId,
      message: error?.message,
    });
    return null;
  }
}