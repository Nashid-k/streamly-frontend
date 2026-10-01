/**
 * The source failover ladder (task.md 6.3).
 *
 * ── What this module is, and what it deliberately is not ─────────────────────
 * The legacy player runs its ladder inside ~1,200 inline lines, interleaved with
 * resolve calls, probes, relay re-routes and React state. That shape is why the
 * ladder's behaviour is hard to reason about: the interesting decisions (which
 * server next, when a failure is terminal, when to stop) are buried between
 * network calls.
 *
 * So this module is the DECISIONS, and nothing else. It never touches the
 * network and never sees a promise. Each server is attempted by an injected
 * `attempt(source, ctx)` function supplied by the caller, which keeps the network
 * work out of the part worth testing exhaustively.
 *
 * ── The three outcomes, and why they are not two ────────────────────────────
 * `runSourceOnce` in the legacy player already distinguishes three results, and
 * collapsing them into "worked / failed" is what makes naive ladders give up too
 * early:
 *
 *   settled  this server has playable video. Stop.
 *   retry    transient — rate-limited, empty catalogue response, slow probe.
 *            This server is still worth another go.
 *   off      terminal — the provider simply does not carry this title. Retrying
 *            or re-trying later is pointless, so the ladder moves on permanently
 *            for this title.
 *
 * `off` is the one that matters. Without it, a title absent from Server 3 costs a
 * full retry budget on every attempt and the viewer waits noticeably longer for
 * an outcome that was decided in the first 100ms.
 *
 * ── Order comes from `PLAYER_SOURCES`, never from here ──────────────────────
 * That array is already the single source of truth for display numbering AND
 * rotation order (see `src/constants/sources.js`). Duplicating the order here
 * would recreate the exact bug that file's header describes: two surfaces
 * numbering the same provider differently.
 */

export const OUTCOME = Object.freeze({
  SETTLED: "settled",
  RETRY: "retry",
  OFF: "off",
});

export const LADDER_DONE = "done";
export const LADDER_EXHAUSTED = "exhausted";
export const LADDER_ABORTED = "aborted";

export function initialLadder({ sources = [], pinnedKey = null, retries = 1 } = {}) {
  return {
    sources,
    /** Index of the next server to attempt. Rotation is positional, so a failed
     *  server is not retried until the whole list has been walked once. */
    cursor: 0,
    retries,
    /** Remaining in-pass retries for the current server. */
    remaining: retries,
    pinnedKey,
    /** True once a pinned server has been tried, so auto-rotation may resume. */
    pinConsumed: false,
    /** Set when any server died on an upstream 429/quota rather than "no title".
     *  The two are indistinguishable to a viewer — both render as "no stream" —
     *  but only one is worth telling them about, because it clears on its own. */
    upstreamQuota: false,
    /** Why the run stopped, when it stopped. */
    reason: null,
    /** How many attempts were actually made, for logs and the status line. */
    attempts: 0,
  };
}

/** Normalise whatever an `attempt` returned into a known outcome. */
export function classifyOutcome(result) {
  if (result === true) return OUTCOME.SETTLED;
  if (result === OUTCOME.SETTLED) return OUTCOME.SETTLED;
  if (result === OUTCOME.OFF) return OUTCOME.OFF;
  // Everything else — `false`, undefined, a thrown-and-swallowed nothing — is
  // transient by default. Defaulting to "retry" is the safe direction: it costs
  // time, whereas defaulting to "off" would abandon a working server.
  return OUTCOME.RETRY;
}

/**
 * The server to attempt right now.
 *
 * A pinned key (a manual "Servers" pick) is honoured for exactly ONE pass, then
 * auto-rotation resumes. Honouring it forever would mean a viewer who once picked
 * a weak server could never get the ladder to move on; ignoring it entirely would
 * mean the menu does nothing.
 */
export function nextSource(state) {
  if (!state.sources.length) return null;
  if (state.pinnedKey && !state.pinConsumed) {
    const pinned = state.sources.find((s) => s.key === state.pinnedKey);
    if (pinned) return pinned;
  }
  return state.sources[state.cursor] || null;
}

/**
 * Advance the ladder after one attempt.
 *
 * @param {object} state current ladder state
 * @param {string} outcome one of OUTCOME
 * @param {{ quota?: boolean, pinConsumed?: boolean }} [detail]
 */
export function advanceLadder(state, outcome, detail = {}) {
  const quota = state.upstreamQuota || Boolean(detail.quota);

  if (outcome === OUTCOME.SETTLED) {
    return { ...state, reason: LADDER_DONE, attempts: state.attempts + 1, upstreamQuota: quota };
  }

  // This was the pinned server's one pass. Do NOT advance the cursor: the cursor
  // points at the ROTATION head, which the pin never moved, so incrementing it
  // here would skip whatever sits at that index. It would silently drop Server 1
  // from the walk — a bug this test caught, not one the design anticipated.
  const wasPinPass =
    state.pinnedKey != null && state.pinnedKey !== undefined && !state.pinConsumed;
  if (wasPinPass) {
    return {
      ...state,
      pinConsumed: true,
      remaining: state.retries,
      attempts: state.attempts + 1,
      upstreamQuota: quota,
    };
  }

  // A retryable failure on the SAME server spends the retry budget first. This is
  // why `remaining` lives here rather than being recomputed by the caller: the
  // budget must be spent per-server, not per-ladder-run.
  if (outcome === OUTCOME.RETRY && state.remaining > 0) {
    return { ...state, remaining: state.remaining - 1, attempts: state.attempts + 1, upstreamQuota: quota };
  }

  // Otherwise move to the next server with a fresh retry budget.
  const cursor = state.cursor + 1;
  const exhausted = cursor >= state.sources.length;

  return {
    ...state,
    cursor,
    remaining: state.retries,
    upstreamQuota: quota,
    attempts: state.attempts + 1,
    reason: exhausted ? LADDER_EXHAUSTED : null,
  };
}

/** True when the ladder has nothing left to try. */
export function isExhausted(state) {
  return state.reason === LADDER_EXHAUSTED || state.cursor >= state.sources.length;
}

/**
 * Run the ladder to completion.
 *
 * The ONLY place in this module that is not pure — and it is kept separate and
 * injectable precisely so everything above stays testable. `attempt` receives the
 * source and an abort signal and returns one of the OUTCOME values.
 *
 * @param {object} options
 * @param {() => boolean} [options.isAborted] polled between attempts, so an
 *   episode change or a closed player stops the ladder promptly instead of
 *   finishing a walk that nobody is waiting for.
 * @returns {Promise<{ source: object, ladder: object }>} the winning source, or
 *   `{ source: null }` when the ladder ran out.
 */
export async function runLadder({ state, attempt, isAborted = () => false, onAttempt } = {}) {
  let ladder = state;
  for (;;) {
    if (isAborted()) return { source: null, ladder: { ...ladder, reason: LADDER_ABORTED } };

    const source = nextSource(ladder);
    if (!source) return { source: null, ladder: { ...ladder, reason: LADDER_EXHAUSTED } };

    let envelope;
    try {
      envelope = await attempt(source, { ladder });
    } catch (error) {
      // An attempt that THROWS is transient by default, for the same reason
      // classifyOutcome defaults to retry: guessing "off" here would silently
      // drop a server that merely had a bad moment.
      envelope = { outcome: null, error };
    }

    // An attempt may return a bare outcome (`true` / `false` / `OUTCOME.OFF`) or
    // an envelope `{ outcome, ...payload }`. The envelope form is what lets a
    // caller carry the resolved manifest through the walk — without it the ladder
    // returns the winning SOURCE and throws away everything the attempt learned,
    // so the caller is left with a server and no URL.
    const result = envelope && typeof envelope === "object" && "outcome" in envelope
      ? envelope
      : { outcome: envelope };
    const outcome = classifyOutcome(result.outcome);

    if (onAttempt) onAttempt({ source, outcome, result, ladder });

    // A caller may flag this attempt as an upstream rate limit. It is threaded
    // through here rather than set directly on the ladder state because the flag
    // is sticky across rotations: one 429 on one server is enough to change what
    // the final banner is allowed to claim.
    const detail = { quota: Boolean(result?.quota) };

    if (outcome === OUTCOME.SETTLED) {
      ladder = advanceLadder(ladder, outcome, detail);
      return { source, result, ladder };
    }

    ladder = advanceLadder(ladder, outcome, detail);
    if (isExhausted(ladder)) return { source: null, result, ladder };
  }
}
