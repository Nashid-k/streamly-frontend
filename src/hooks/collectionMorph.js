// src/hooks/collectionMorph.js — storage v2 morph for collections, shared by
// the UI layer (useUserData) and the cloud-sync layer (AuthContext).
//
// Frozen contract (recorded in task.md): additive-only. Everything old still
// reads; only collections that are public gain a stable publicId so any
// PUBLIC list can be opened by ANYONE via /collections/:publicId.

export function makePublicId() {
  return `pub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function morphCollections(list) {
  return (list || []).map((c) => {
    const col = { ...c };
    col.visibility = col.visibility === 'public' ? 'public' : 'private';
    if (col.visibility === 'public' && !col.publicId) col.publicId = makePublicId();
    return col;
  });
}
