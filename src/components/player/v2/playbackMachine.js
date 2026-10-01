/**
 * PLAYER V2 playback state machine — the single source of truth.
 *
 * ============================================================================
 * WHY THIS IS PURE (task.md 2.4 / 2.6 / 2.7)
 * The old player derived "is it loading?" from a pile of booleans that were set
 * in different places for different reasons: an initial-mount flag, a
 * `stalled` DOM event, a seek in progress, a `waiting` event. Those disagreed
 * with each other, which is why a buffering wait could look frozen — the frame
 * was preserved (so the loader correctly stayed hidden) while nothing indicated
 * anything was happening.
 *
 * One guarded enum fixes that class of bug rather than that instance: the
 * loader, the buffering indicator, and the screen-reader announcement are all
 * DERIVED from `state` (see `selectView`), so they cannot disagree by
 * construction. There is no second source of truth to fall out of sync.
 *
 * Kept as a pure reducer with no React import so it can be tested exhaustively
 * without a renderer — the transition table is the part most likely to rot, and
 * a table you can assert on is a table that stays honest.
 * ============================================================================
 */

/* ── States ───────────────────────────────────────────────────────────── */

export const S = Object.freeze({
  IDLE: "idle",
  RESOLVING: "resolving",
  OPENING: "opening",
  BUFFERING: "buffering",
  PLAYING: "playing",
  /** Added in 3.7. Absent until then, which is why the first Tier A transport
   *  had no honest way to label its own play button: it was inferring "playing"
   *  from `state === playing` while the element it drives was paused. */
  PAUSED: "paused",
  STALLED: "stalled",
  ENDED: "ended",
  ERROR: "error",
});

export const STATES = Object.values(S);

/* ── Events ───────────────────────────────────────────────────────────── */

export const E = Object.freeze({
  REQUEST: "REQUEST",
  SOURCE_READY: "SOURCE_READY",
  ATTACHED: "ATTACHED",
  FIRST_FRAME: "FIRST_FRAME",
  /** Buffer underrun mid-playback. Distinct from FIRST_BUFFERING on purpose:
       a stall must keep the last frame, a first buffer has no frame yet. */
  STALL: "STALL",
  RECOVER: "RECOVER",
  /* Dispatched by the transport (3.7) after it has actually called `play()` or
   * `pause()` on the element — NOT from the element's own `play`/`pause` events.
   *
   * That is a deliberate trade. `pause` also fires when the element is torn down
   * for a source switch, and several browsers fire `pause` after `ended`, so
   * listening for it would let a source swap knock the machine into `paused` and
   * strand a video that is loading fine. Since the element is created and
   * destroyed by this codebase and its only pause path is our own transport,
   * the transport is the honest source. The cost: something outside this tree
   * pausing the element would not be noticed. Recorded, not hidden. */
  PAUSE: "PAUSE",
  RESUME: "RESUME",
  END: "END",
  FAIL: "FAIL",
  RETRY: "RETRY",
  RESET: "RESET",
});

/**
 * The transition table.
 *
 * Note what is NOT here: there is no `idle -> playing` and no `buffering ->
 * ended`. A machine that permits shortcuts like those is a machine that will
 * eventually take them in production, and the result is a state that no UI was
 * written for. Illegal transitions are REFUSED (the reducer returns the current
 * state unchanged) rather than throwing, because a stray media event must never
 * be able to take the player down.
 *
 * `RESET` is listed for EVERY state because closing the player is always
 * legitimate. It used to be a special case ahead of the table lookup, which
 * meant `canTransition(state, RESET)` answered `false` while the reducer reset
 * anyway — the table and the reducer disagreeing, i.e. the exact drift this
 * table exists to prevent. Anything that consults `canTransition` before
 * dispatching (a legitimate thing to do) would have refused a valid reset.
 */
const TRANSITIONS = Object.freeze({
  [S.IDLE]: [E.REQUEST, E.RESET],
  [S.RESOLVING]: [E.SOURCE_READY, E.FAIL, E.RESET],
  [S.OPENING]: [E.ATTACHED, E.FAIL, E.RESET],
  // No STALL here, deliberately. `waiting` fires during the FIRST buffer too, but
  // a stall is defined as a mid-playback underrun that PRESERVES the last frame —
  // and in `buffering` there is no frame yet, so `showBuffering` would be
  // preserving nothing. Letting `buffering -> stalled` through produced exactly
  // the "frozen screen with a spinner over blackness" this rewrite exists to
  // remove. A `waiting` event during first buffering is already the correct
  // state, so the right response is to ignore it.
  [S.BUFFERING]: [E.FIRST_FRAME, E.FAIL, E.RESET, E.PAUSE],
  [S.PLAYING]: [E.STALL, E.END, E.FAIL, E.RESET, E.PAUSE],
  [S.PAUSED]: [E.RESUME, E.STALL, E.END, E.FAIL, E.RESET],
  /* `stalled -> resume` is not listed: a stall already preserves the last frame,
   * and RECOVER is how a stall returns to playing.
   *
   * `E.PAUSE` IS legal here, and it was a bug when it was not. `selectView`
   * reports `stalled` as playing, so the transport labels the button "Pause"
   * during a stall. Pressing it pauses the element and dispatches PAUSE — and if
   * the machine refused that, the element went paused while the button kept
   * saying "Pause", with nothing left to press. The element's state and the
   * label had silently diverged, which is precisely the class of bug this
   * machine exists to make impossible. */
  [S.STALLED]: [E.RECOVER, E.PAUSE, E.FAIL, E.RESET],
  [S.ENDED]: [E.REQUEST, E.RESET],
  [S.ERROR]: [E.RETRY, E.RESET],
});

export function canTransition(from, event) {
  return (TRANSITIONS[from] ?? []).includes(event);
}

/* ── Initial + reducer ────────────────────────────────────────────────── */

export const initialPlayback = Object.freeze({
  state: S.IDLE,
  /** Populated only in `error`; cleared on every non-FAIL transition so a
      recovered player cannot keep rendering a stale failure. */
  error: null,
  /** Bumped on every ACCEPTED transition. Lets effects that must fire per
      real change (announce once, log once) avoid firing on refused ones. */
  rev: 0,
});

export function playbackReducer(prev, action) {
  const { type, error = null } = action ?? {};

  if (!canTransition(prev.state, type)) {
    // Refused. Keep `rev` unchanged so "did anything actually happen" is
    // answerable — a refused event is not a state change, and code reacting to
    // it would double-fire on media-event storms (Safari fires `waiting`
    // several times for one stall).
    return prev;
  }

  // `RETRY`/`REQUEST` re-arm a terminal state; every other accepted event
  // clears a previous error.
  const nextError = type === E.FAIL ? error : null;

  return { state: nextStateOf(prev.state, type), error: nextError, rev: prev.rev + 1 };
}

function nextStateOf(from, event) {
  switch (event) {
    case E.RESET:
      // Explicit, even though it looks redundant: `default` returns `from`, so
      // without this case a RESET from `ended`/`error` would keep the old state
      // and "closing the player" would silently fail.
      return S.IDLE;
    case E.REQUEST:
    case E.RETRY:
      return S.RESOLVING;
    case E.SOURCE_READY:
      return S.OPENING;
    case E.ATTACHED:
      return S.BUFFERING;
    case E.FIRST_FRAME:
    case E.RECOVER:
    /* RESUME also returns to PLAYING, because the transport only dispatches it
     * after a real `play()` that the element will follow up with a `playing`
     * event anyway. Treating it as PLAYING immediately is what stops the play
     * button flickering back to "Play" for a frame on resume. */
    case E.RESUME:
      return S.PLAYING;
    case E.PAUSE:
      return S.PAUSED;
    case E.STALL:
      return S.STALLED;
    case E.END:
      return S.ENDED;
    case E.FAIL:
      return S.ERROR;
    default:
      return from;
  }
}

/* ── Derived view (task.md 2.7) ───────────────────────────────────────── */

/**
 * Every consumer-visible fact, computed from the one state.
 *
 * `showLoader` (the full-screen LoadingStage) and `showBuffering` (the small
 * spinner over a preserved frame) are deliberately SEPARATE booleans. The old
 * player conflated them, which is exactly why a mid-playback stall looked
 * frozen: preserving the frame suppressed the loader, and there was no second
 * indicator to fall back to.
 *
 * `announcement` is derived too, so the spoken text can never describe a state
 * the UI is not actually in.
 */
export function selectView(playback) {
  const { state, error } = playback;

  return {
    state,
    /* `stalled` counts as playing on purpose. A stall preserves the last frame,
     * so from the viewer's side the video did not stop — and 3.9 keys Tier B off
     * this flag, where flipping the whole chrome to "paused" during a network
     * hiccup would be a jarring false signal. */
    isPlaying: state === S.PLAYING || state === S.STALLED,
    isPaused: state === S.PAUSED,
    isBusy: state === S.RESOLVING || state === S.OPENING || state === S.BUFFERING,

    // No frame exists yet in these states, so there is nothing to preserve.
    showLoader: state === S.RESOLVING || state === S.OPENING || state === S.BUFFERING,

    // A frame DOES exist — keep it and spin over it. Never both, or the
    // loader's opacity transition hides the very frame it exists to protect.
    showBuffering: state === S.STALLED,

    showEnded: state === S.ENDED,
    showError: state === S.ERROR,

    announcement: describeState(state, error),
  };
}

/**
 * Screen-reader text per state. Empty strings mean "say nothing" — announcing
 * every PLAYING transition would make the player unusable with a screen reader,
 * so silence on the happy path is the correct behaviour, not an oversight.
 */
export function describeState(state, error) {
  switch (state) {
    case S.IDLE:
      return "";
    case S.RESOLVING:
      return "Finding a playable source.";
    case S.OPENING:
      return "Opening video.";
    case S.BUFFERING:
      return "Buffering video.";
    case S.PLAYING:
      return "";
    /* Silence on pause, like silence on play. Announcing "Paused" would fire a
     * live-region update on every pause, including the ones a viewer makes while
     * reaching for the volume control. */
    case S.PAUSED:
      return "";
    case S.STALLED:
      return "Video stalled. Reconnecting.";
    case S.ENDED:
      return "Playback ended.";
    case S.ERROR:
      return error?.message ? `Playback failed. ${error.message}` : "Playback failed.";
    default:
      return "";
  }
}
