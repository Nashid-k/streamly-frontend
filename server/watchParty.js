// server/watchParty.js — pure helpers for the Watch Party endpoint.
//
// Kept OUT of api/ on purpose: every .js file under api/ deploys as its own
// publicly-invokable Vercel function and counts against the Hobby budget
// (src/__tests__/apiModules.test.js enforces ≤ 12 + no nesting). Pure here
// means: no Mongo, no req/res — every function is unit-testable directly and
// the endpoint file stays thin routing only, matching server/publicCollections.js.
//
// Contract enforced by these helpers (see architecture.md §2 "Watch Party"):
//   • 6-char unambiguous party codes (no 0/O/1/I)
//   • host-only playback control; messages are display-safe strings
//   • rooms TTL out after PARTY_TTL_MS idle — storage is reclaimed without a cron

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no 0/O/1/I
export const CODE_LENGTH = 6;
export const MAX_PARTY_NAME_CHARS = 24;
export const MAX_MESSAGE_CHARS = 280;
export const MAX_PARTICIPANTS = 25;
export const MAX_MESSAGES = 200;
export const PARTY_TTL_MS = 24 * 60 * 60 * 1000; // idle rooms are GC'd by the next state poll

// Characters that must never appear in a generated code: 0/O and 1/I are
// visually ambiguous in a sans-serif chat message ("Join O0I1" is unreadable).
export function generatePartyCode(rand = Math.random) {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return out;
}

function asTrimmedString(value, maxChars) {
  if (typeof value !== "string") return "";
  return value.slice(0, maxChars).trim();
}

export function sanitizeName(raw) {
  const name = asTrimmedString(raw, MAX_PARTY_NAME_CHARS);
  return name || "Guest";
}

// Chat is rendered as text in React (no dangerouslySetInnerHTML anywhere in
// the app), so HTML strings stay inert — the cap is the defence against bloat.
export function sanitizeMessage(raw) {
  const text = asTrimmedString(raw, MAX_MESSAGE_CHARS);
  return text || null;
}

// Normalize a participant entry so a hostile join payload cannot smuggle
// functions/nested objects into the shared room document.
export function sanitizeParticipant(raw, { isHost = false } = {}) {
  const pid = asTrimmedString(raw?.participantId, 64);
  if (!pid) return null;
  const now = Date.now();
  return {
    participantId: pid,
    name: sanitizeName(raw?.name),
    isHost: Boolean(isHost),
    joinedAt: Number.isFinite(raw?.joinedAt) ? raw.joinedAt : now,
    lastSeenAt: now,
  };
}

// Whitelist the playback state a client may push. Only the host's writes are
// ever accepted (api/watchParty.js enforces that); this only bounds the shape.
export function sanitizePlayback(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {
    isPlaying: Boolean(raw.isPlaying),
    positionSec: Math.max(0, Math.floor(Number(raw.positionSec) || 0)),
    updatedAt: Date.now(),
    // Monotonic token so a guest can order two syncs that arrive out of order.
    rev: Number.isFinite(raw.rev) ? Math.floor(raw.rev) : 0,
  };
  return out;
}

// Whitelist the title a room is watching. Ids are the normalizeResult domain
// contract ("movie-<n>" / "tv-<n>") — capped, string, never an object.
export function sanitizeTitle(raw) {
  if (!raw || typeof raw !== "object") return null;
  const titleId = asTrimmedString(raw.titleId, 120);
  if (!titleId) return null;
  return {
    titleId,
    title: sanitizeName(raw.title) === "Guest" ? "Untitled" : sanitizeName(raw.title),
    kind: raw.kind === "tv" ? "tv" : "movie",
    season: Number.isFinite(raw.season) ? Math.floor(raw.season) : null,
    episode: Number.isFinite(raw.episode) ? Math.floor(raw.episode) : null,
  };
}

// True when a room document is old enough to drop. State polls call this so
// idle rooms are reclaimed by traffic instead of a cron job.
export function isRoomExpired(room, now = Date.now()) {
  if (!room) return true;
  const last = Number(room.updatedAt) || Number(room.createdAt) || 0;
  return now - last > PARTY_TTL_MS;
}

// Sort participants oldest-first (host lands first — they joined the room
// into existence). Stable, pure, used by the response builder.
export function sortParticipants(list) {
  return [...(list || [])].sort((a, b) => (a?.joinedAt || 0) - (b?.joinedAt || 0));
}

export function publicRoomShape(room) {
  if (!room) return null;
  return {
    code: room.code,
    hostId: room.hostId,
    title: room.title || null,
    playback: room.playback || { isPlaying: false, positionSec: 0, updatedAt: 0, rev: 0 },
    participants: sortParticipants(room.participants || []),
    messages: (room.messages || []).slice(-MAX_MESSAGES),
    createdAt: room.createdAt || null,
    updatedAt: room.updatedAt || null,
  };
}
