// src/hooks/useWatchParty.js — Watch Party room state machine (client half).
//
// Owns everything the panel and the player need from a party:
//   • identity  — nickname + participantId, persisted in a NEW
//                 `streamly_watchparty` localStorage key (the frozen aios_* /
//                 setting-* keys stay untouched — vibecoder rule 4)
//   • lifecycle — create (host) / join (code) / leave, with ?party=CODE
//                 deep-link support read once on mount
//   • polling   — 2s state heartbeat while connected; chat arrives through the
//                 same poll with a cursor (sinceMsgId) so no transcript is
//                 re-downloaded and no duplicate fetch
//   • playback  — the HOST pushes (play/pause/position) via syncPartyPlayback;
//                 GUESTS receive and apply it through the returned
//                 remotePlayback { isPlaying, positionSec, rev, updatedAt } —
//                 the player does drift correction + edge-triggered
//                 play/pause, this hook never touches the <video> element.
//
// All failures surface: a failed poll logs via debugLogger and increments a
// visible consecutive-failure counter; after 3 misses the connection reads as
// LOST (never a silent frozen room).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PartyError,
  createParty,
  joinParty,
  leaveParty,
  pollPartyState,
  sendPartyChat,
  syncPartyPlayback,
} from "../api/watchParty";
import { logError, logInfo, logWarn } from "../utils/debugLogger";

const IDENTITY_KEY = "streamly_watchparty"; // NEW key — not part of the frozen aios_*/setting-* contract
/* Adaptive polling (PLAN.md P1.1): the 2s heartbeat is only needed while the
   host is PLAYING (guest drift correction targets ≤2.5s). Paused rooms get 5s
   (chat still flows), a hidden tab gets 15s (nothing on screen is watched
   live); returning to the tab re-arms immediately so catch-up is instant.
   Same server contract, ~60% fewer polls for a typical paused-heavy room. */
const POLL_MS_ACTIVE = 2000;
const POLL_MS_PAUSED = 5000;
const POLL_MS_HIDDEN = 15000;

function pollDelayMs(isPlaying) {
  if (typeof document !== "undefined" && document.hidden) return POLL_MS_HIDDEN;
  return isPlaying ? POLL_MS_ACTIVE : POLL_MS_PAUSED;
}
const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_CHAT_DISPLAY = 100; // newest N kept in memory for the panel list

function randomId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    }
  } catch {
    // fall through to Math.random
  }
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function readIdentity() {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      participantId: typeof parsed.participantId === "string" ? parsed.participantId : null,
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 24) : "Guest",
    };
  } catch {
    return null;
  }
}

function writeIdentity(identity) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // Storage may be blocked (private mode) — the party still works, it just
    // won't survive a reload. Never a silent data-path failure: logged.
    logWarn("watchParty", "Could not persist party identity (storage blocked?).");
  }
}

/**
 * @param {object} opts
 * @param {string} [opts.deepLinkCode] party code from ?party=, read once
 */
export function useWatchParty({ deepLinkCode = "" } = {}) {
  const [identity, setIdentity] = useState(() => readIdentity());
  const [room, setRoom] = useState(null); // public room shape from the server
  const [status, setStatus] = useState("idle"); // idle|creating|joining|connected|lost|left|error
  const [error, setError] = useState(null); // PartyError message for the panel
  const [chat, setChat] = useState([]); // ascending by id
  const [remotePlayback, setRemotePlayback] = useState(null);

  const identityRef = useRef(identity);
  identityRef.current = identity;
  const roomRef = useRef(room);
  roomRef.current = room;
  const lastMsgIdRef = useRef(0);
  const pollAbortRef = useRef(false);
  const pollTimerRef = useRef(null);
  const failureCountRef = useRef(0);
  const deepLinkConsumedRef = useRef(false);

  // Host vs guest is derived from the authoritative hostId, not stored —
  // a stale flag could survive a rejoin into someone else's room.
  const isHost = Boolean(room && identity && room.hostId === identity.participantId);

  const ensureIdentity = useCallback(() => {
    let next = identityRef.current;
    if (!next?.participantId) {
      next = { participantId: randomId(), name: `Guest-${randomId().slice(-4)}` };
      setIdentity(next);
      writeIdentity(next);
    }
    return next;
  }, []);

  const attachRoom = useCallback((nextRoom) => {
    setRoom(nextRoom);
    setStatus("connected");
    setError(null);
  }, []);

  const fail = useCallback((scopeMessage, err) => {
    const message = err?.message || scopeMessage;
    setError(message);
    setStatus(err instanceof PartyError && err.status === 404 ? "left" : "error");
    logError("watchParty", scopeMessage, err);
  }, []);

  const create = useCallback(
    async ({ name, title }) => {
      const me = ensureIdentity();
      setStatus("creating");
      setError(null);
      try {
        const res = await createParty({ participantId: me.participantId, name: name || me.name, title });
        attachRoom(res.room);
        lastMsgIdRef.current = 0;
        setChat([]);
        setRemotePlayback(res.room?.playback || null);
        logInfo("watchParty", `Party created (host).`, { code: res.room?.code });
        return res.room;
      } catch (err) {
        fail("Creating the party failed.", err);
        return null;
      }
    },
    [ensureIdentity, attachRoom, fail],
  );

  const join = useCallback(
    async ({ code, name }) => {
      const me = ensureIdentity();
      setStatus("joining");
      setError(null);
      try {
        const res = await joinParty({ code, participantId: me.participantId, name: name || me.name });
        attachRoom(res.room);
        // Catch up on the transcript so the panel doesn't start empty for a
        // mid-party joiner.
        lastMsgIdRef.current = 0;
        setChat([]);
        setRemotePlayback(res.room?.playback || null);
        logInfo("watchParty", `Joined party.`, { code: res.room?.code });
        return res.room;
      } catch (err) {
        fail("Joining the party failed.", err);
        return null;
      }
    },
    [ensureIdentity, attachRoom, fail],
  );

  const leave = useCallback(
    async ({ silent } = {}) => {
      const current = roomRef.current;
      const me = identityRef.current;
      pollAbortRef.current = true;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (current?.code && me?.participantId) {
        await leaveParty({ code: current.code, participantId: me.participantId });
      }
      setRoom(null);
      setChat([]);
      setRemotePlayback(null);
      lastMsgIdRef.current = 0;
      setStatus("left");
      if (!silent) logInfo("watchParty", "Left the party.");
    },
    [],
  );

  const sendChat = useCallback(
    async (text) => {
      const current = roomRef.current;
      const me = identityRef.current;
      const trimmed = typeof text === "string" ? text.trim().slice(0, 280) : "";
      if (!current?.code || !me?.participantId || !trimmed) return false;
      try {
        await sendPartyChat({ code: current.code, participantId: me.participantId, text: trimmed });
        // The poll picks the message up within ~2s; nothing else to do.
        return true;
      } catch (err) {
        logError("watchParty", "Sending chat failed.", err);
        setError(err?.message || "Sending the message failed.");
        return false;
      }
    },
    [],
  );

  // HOST: push playback. Fire-and-forget from the player's perspective — the
  // next poll reflects it, and a failed push is logged, not fatal. The
  // episode/title ride the sync so guests follow the host across episodes.
  const broadcastPlayback = useCallback(
    ({ isPlaying, positionSec, rev, title }) => {
      const current = roomRef.current;
      const me = identityRef.current;
      if (!current?.code || !me?.participantId || !isHost) return false;
      syncPartyPlayback({
        code: current.code,
        participantId: me.participantId,
        playback: { isPlaying, positionSec, rev },
        title,
      }).catch((err) => {
        logWarn("watchParty", "Playback sync failed (will retry on next change).", {
          message: err?.message,
        });
      });
      return true;
    },
    [isHost],
  );

  const renameSelf = useCallback(
    (name) => {
      const me = identityRef.current;
      const current = roomRef.current;
      const clean = typeof name === "string" ? name.trim().slice(0, 24) : "";
      if (!me || !clean) return false;
      const next = { ...me, name: clean };
      setIdentity(next);
      writeIdentity(next);
      // Re-join with the new name if connected — join refreshes the seat.
      if (current?.code) {
        joinParty({ code: current.code, participantId: me.participantId, name: clean }).catch((err) => {
          logWarn("watchParty", "Rename while connected failed.", { message: err?.message });
        });
      }
      return true;
    },
    [],
  );

  // Poll loop: one at a time (no overlap), timer re-armed only when still
  // connected. 3 consecutive failures → status "lost" (polling stops; the
  // panel shows reconnect + the room stays joinable via the code).
  useEffect(() => {
    if (status !== "connected") return undefined;
    pollAbortRef.current = false;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || pollAbortRef.current) return;
      const current = roomRef.current;
      const me = identityRef.current;
      if (!current?.code || !me?.participantId) return;
      try {
        const res = await pollPartyState({
          code: current.code,
          participantId: me.participantId,
          sinceMsgId: lastMsgIdRef.current,
        });
        if (cancelled || pollAbortRef.current) return;
        failureCountRef.current = 0;
        if (res?.room) {
          setRoom(res.room);
          setRemotePlayback(res.room.playback || null);
          const fresh = Array.isArray(res.room.messages) ? res.room.messages : [];
          if (fresh.length > 0) {
            const last = fresh[fresh.length - 1];
            lastMsgIdRef.current = Math.max(lastMsgIdRef.current, last.id);
            setChat((prev) => {
              const seen = new Set(prev.map((m) => m.id));
              const merged = [...prev, ...fresh.filter((m) => !seen.has(m.id))];
              merged.sort((a, b) => a.id - b.id);
              return merged.slice(-MAX_CHAT_DISPLAY);
            });
          }
        }
        pollTimerRef.current = setTimeout(tick, pollDelayMs(res?.room?.playback?.isPlaying));
      } catch (err) {
        if (cancelled || pollAbortRef.current) return;
        // A 404 means the room is GONE (host left / TTL) — retrying three
        // times would just stretch a dead room's death by 6 seconds. End now.
        if (err instanceof PartyError && err.status === 404) {
          setStatus("left");
          setError(err?.message || "Party closed — the host left or the room expired.");
          logError("watchParty", "Party room no longer exists.", err);
          return;
        }
        failureCountRef.current += 1;
        logWarn("watchParty", `State poll failed (${failureCountRef.current}/${MAX_CONSECUTIVE_FAILURES}).`, {
          message: err?.message,
        });
        if (failureCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
          setStatus("lost");
          setError(err?.message || "Lost connection to the party.");
          logError("watchParty", "Party connection lost after repeated poll failures.", err);
          return;
        }
        pollTimerRef.current = setTimeout(tick, pollDelayMs(roomRef.current?.playback?.isPlaying));
      }
    };

    pollTimerRef.current = setTimeout(tick, pollDelayMs(roomRef.current?.playback?.isPlaying));

    /* Visibility flips re-arm the loop OUTSIDE the fixed cadence: tab back in
       → poll immediately (catch-up), tab hidden → the next scheduled tick
       picks the 15s delay. The `cancelled` flag makes a stale fire harmless. */
    const onVisibility = () => {
      if (document.hidden) return;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(tick, 0);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      pollAbortRef.current = true;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status]);

  // ?party=CODE deep link: consumed once on mount, only while idle.
  useEffect(() => {
    if (deepLinkConsumedRef.current || !deepLinkCode) return;
    if (status !== "idle") return;
    deepLinkConsumedRef.current = true;
    join({ code: deepLinkCode.toUpperCase() }).then((joined) => {
      if (!joined) {
        // The join failed (bad/expired code) — surface it, stay on the panel.
        logWarn("watchParty", "Deep-link join failed; showing the panel error state.");
      }
    });
  }, [deepLinkCode, status, join]);

  // Tab closing / navigating away: best-effort explicit leave so the roster
  // updates within seconds instead of waiting out the 90s prune.
  useEffect(() => {
    const onUnload = () => {
      const current = roomRef.current;
      const me = identityRef.current;
      if (current?.code && me?.participantId) {
        try {
          // keepalive so the request survives page unload.
          navigator.sendBeacon?.(
            `${window.location.origin}/api/watchParty`,
            new Blob(
              [JSON.stringify({ action: "leave", code: current.code, participantId: me.participantId })],
              { type: "text/plain" },
            ),
          );
        } catch {
          // best-effort only
        }
      }
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  const roomSummary = useMemo(
    () =>
      room
        ? {
            code: room.code,
            hostId: room.hostId,
            title: room.title,
            participants: room.participants || [],
            playback: room.playback || null,
          }
        : null,
    [room],
  );

  return {
    // state
    identity,
    room: roomSummary,
    isHost,
    status, // idle|creating|joining|connected|lost|left|error
    error,
    chat,
    remotePlayback,
    // actions
    create,
    join,
    leave,
    sendChat,
    renameSelf,
    broadcastPlayback,
  };
}

export default useWatchParty;
