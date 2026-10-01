/**
 * PLAYER V2 status line state.
 *
 * ── Why this is separate from `playbackMachine` ──────────────────────────────
 * The playback machine answers "what is the player doing?". The status line
 * answers "what just happened, in words the viewer can act on?". Those are
 * different questions with different lifetimes:
 *
 *   playback state  — exactly one at a time, always present, drives the loader
 *   status         — at most one at a time, usually absent, persists after the
 *                    state has moved on
 *
 * Merging them would force a choice between two wrong behaviours: either the
 * loader would vanish the instant playback started, taking "Autoplay blocked"
 * with it, or a transient "Probing…" would keep the loader on screen. This
 * rewrite is called out in task.md for silently dropping exactly these messages,
 * so it is worth being deliberate about which one a message belongs to.
 *
 * ── React-free on purpose ────────────────────────────────────────────────────
 * Same rule as `playbackMachine.js`: no React import, so the transitions are
 * testable exhaustively without a renderer. This is the part most likely to rot.
 */

import { logWarn } from "../../../utils/debugLogger";

const STATUS_SCOPE = "PlayerStatus";

/** Default lifetime for a status that does not bring its own. */
export const DEFAULT_STATUS_TTL_MS = 9000;

export const STATUS_KIND = {
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
};

const KINDS = new Set(Object.values(STATUS_KIND));

export const INITIAL_STATUS = {
  /** null when there is nothing to show. */
  message: null,
  kind: null,
  /** Identity of the current message, used to suppress repeats. */
  key: null,
  /** Bumped on every real change, so effects can react to "a new status". */
  seq: 0,
  /** False once the viewer dismisses it, until the wording actually changes. */
  visible: false,
  /**
   * How long this message stays up, in ms. `<= 0` means persistent until the
   * viewer dismisses it or something supersedes it. Per-message rather than
   * per-hook because the two kinds need opposite lifetimes: "video stalled" is
   * noise once it clears itself, while "all sources exhausted" must still be on
   * screen ten seconds later, when the viewer looks up from the remote.
   */
  ttlMs: DEFAULT_STATUS_TTL_MS,
};

function normalizeMessage(raw) {
  if (raw == null) return "";
  return String(raw).replace(/\s+/g, " ").trim();
}

/**
 * Push a status.
 *
 * Three behaviours here are load-bearing, and each one exists because of a way
 * this naively spams or nags a viewer:
 *
 *  1. A BLANK message clears rather than rendering. An empty status line is
 *     worse than no status line — it occupies the row and announces nothing.
 *  2. Re-pushing the SAME wording while it is already showing is a no-op, with
 *     no `seq` bump. The 49 legacy messages include per-source progress that
 *     fires repeatedly ("Trying X…", segment retries); without this the live
 *     region would re-announce the same sentence many times a second.
 *  3. Re-pushing the SAME wording after the viewer DISMISSED it stays hidden. A
 *     message the viewer has explicitly closed must not reappear on its own,
 *     even if the source retries and re-emits it verbatim.
 */
function push(state, { message, kind, key, ttlMs }) {
  const text = normalizeMessage(message);
  if (!text) {
    if (state.message === null) return state;
    return {
      ...state,
      message: null,
      kind: null,
      key: null,
      visible: false,
      seq: state.seq + 1,
      ttlMs: DEFAULT_STATUS_TTL_MS,
    };
  }

  const nextKind = KINDS.has(kind) ? kind : STATUS_KIND.INFO;
  const identity = key == null ? text : `${key}::${text}`;
  const nextTtl = Number.isFinite(ttlMs) ? ttlMs : state.ttlMs;

  if (identity === state.key && text === state.message) {
    // Same wording again. Leave `visible` alone so a dismissal survives.
    return { ...state, kind: nextKind, visible: state.visible, ttlMs: nextTtl };
  }

  return {
    message: text,
    kind: nextKind,
    key: identity,
    seq: state.seq + 1,
    visible: true,
    ttlMs: nextTtl,
  };
}

/** Viewer closed it. The message is retained so a repeat cannot nag. */
function dismiss(state) {
  if (!state.visible) return state;
  return { ...state, visible: false };
}

/** Programmatic clear, e.g. the next event supersedes this one. */
function clear(state) {
  if (state.message === null && !state.visible) return state;
  return {
    ...state,
    message: null,
    kind: null,
    key: null,
    visible: false,
    seq: state.seq + 1,
    ttlMs: DEFAULT_STATUS_TTL_MS,
  };
}

export function statusReducer(state = INITIAL_STATUS, action = {}) {
  switch (action.type) {
    case "push":
      return push(state, action);
    case "dismiss":
      return dismiss(state);
    case "clear":
      return clear(state);
    default:
      // An unknown action is a bug in a caller, not a viewer-facing failure, but
      // swallowing it silently is exactly the habit this rewrite is removing.
      if (action?.type) logWarn(STATUS_SCOPE, `ignored unknown status action "${action.type}"`);
      return state;
  }
}

/**
 * Derived view, same shape philosophy as `selectView` in `playbackMachine`:
 * components read this and never touch the raw state, so "is it showable" and
 * "what kind is it" cannot be answered two different ways.
 */
export function selectStatus(state = INITIAL_STATUS) {
  const show = Boolean(state.message) && state.visible;
  return {
    show,
    message: show ? state.message : null,
    kind: show ? state.kind : STATUS_KIND.INFO,
    // Errors stay assertive; everything else is polite. A "next source" notice
    // interrupting whatever the viewer is doing with a screen reader is worse
    // than it arriving a moment late.
    live: show && state.kind === STATUS_KIND.ERROR ? "assertive" : "polite",
    isError: show && state.kind === STATUS_KIND.ERROR,
    persistent: show && state.ttlMs <= 0,
    ttlMs: state.ttlMs,
    seq: state.seq,
  };
}

/** Action creators, so callers never hand-build action objects. */
export const statusActions = {
  push: (message, kind = STATUS_KIND.INFO, key = null, ttlMs = undefined) => ({
    type: "push",
    message,
    kind,
    key,
    ttlMs,
  }),
  dismiss: () => ({ type: "dismiss" }),
  clear: () => ({ type: "clear" }),
};
