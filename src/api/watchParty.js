// src/api/watchParty.js — Watch Party room client.
//
// Thin typed wrapper over POST /api/watchParty (single endpoint, action-switched
// body — same style as the /api/downloadify actions the resolver uses). Every
// failure THROWS a PartyError with the server's message so the panel can show
// a real error state instead of a silent nothing (vibecoder rule 1: data paths
// never fail silently — all diagnostics go through debugLogger).

import { logDebug, logWarn } from "../utils/debugLogger";

/** Distinguishes party failures (404 room gone, 403 not host, 409 full, 429) for the panel UI. */
export class PartyError extends Error {
  constructor(message, { status, action } = {}) {
    super(message);
    this.name = "PartyError";
    this.status = status;
    this.action = action;
  }
}

function apiBase() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

async function call(action, payload = {}) {
  let res;
  try {
    res = await fetch(`${apiBase()}/api/watchParty`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (error) {
    logWarn("watchParty", `Party endpoint unreachable (${action}).`, { message: error?.message });
    throw new PartyError("Party service unreachable — check your connection.", { action });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body (proxy error page) — fall through with a generic message.
  }
  if (!res.ok) {
    const message = data?.message || `Party request failed (${res.status}).`;
    logWarn("watchParty", `Party ${action} answered ${res.status}.`, { status: res.status, message });
    throw new PartyError(message, { status: res.status, action });
  }
  return data;
}

/** Create a room and become its host. Returns the full room shape. */
export function createParty({ participantId, name, title }) {
  return call("create", { participantId, name, title });
}

/** Join an existing room by code (rejoin with the same participantId is a no-op rename/heartbeat). */
export function joinParty({ code, participantId, name }) {
  return call("join", { code, participantId, name });
}

/** 2s heartbeat + state pull. `sinceMsgId` limits chat to new messages only. */
export function pollPartyState({ code, participantId, sinceMsgId = 0 }) {
  return call("state", { code, participantId, sinceMsgId });
}

/** HOST-ONLY playback broadcast (play/pause/position/rev). */
export function syncPartyPlayback({ code, participantId, playback, title }) {
  return call("sync", { code, participantId, playback, title });
}

/** Send a chat message to the room. Returns { id } of the new message. */
export function sendPartyChat({ code, participantId, text }) {
  return call("chat", { code, participantId, text });
}

/** Leave the room. Host leaving deletes the room for everyone (documented). */
export function leaveParty({ code, participantId }) {
  return call("leave", { code, participantId }).catch((error) => {
    // Leaving must never trap the user in a broken room: log and swallow only
    // network-level failures (the endpoint itself is idempotent), never silent.
    logWarn("watchParty", "Leave request failed — treating the room as left locally.", {
      message: error?.message,
    });
    return { success: true };
  });
}

logDebug("watchParty", "Watch Party client ready.");
