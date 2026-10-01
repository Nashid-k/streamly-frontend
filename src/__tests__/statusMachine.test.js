import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATUS_TTL_MS,
  INITIAL_STATUS,
  STATUS_KIND,
  selectStatus,
  statusActions,
  statusReducer,
} from "../components/player/v2/statusMachine";

/* Status line state (task.md 2.9).
 *
 * The machine is React-free precisely so this file can be exhaustive. Every case
 * below corresponds to a way a status line either nags a viewer, disappears
 * before it was read, or announces the same sentence dozens of times — all of
 * which the old player could not do, because it could not do anything at all.
 */

const push = (state, message, kind, key, ttlMs) =>
  statusReducer(state, statusActions.push(message, kind, key, ttlMs));

describe("statusMachine — the three actions", () => {
  it("shows a pushed message", () => {
    const state = push(INITIAL_STATUS, "Trying VidSrc…", STATUS_KIND.INFO);
    expect(state.message).toBe("Trying VidSrc…");
    expect(state.kind).toBe(STATUS_KIND.INFO);
    expect(state.visible).toBe(true);
    expect(state.seq).toBe(1);
  });

  it("dismisses on request but keeps the wording, so a repeat cannot nag", () => {
    let state = push(INITIAL_STATUS, "Autoplay blocked — tap play.");
    state = statusReducer(state, statusActions.dismiss());

    expect(state.visible).toBe(false);
    expect(selectStatus(state).show).toBe(false);

    // The source re-emits the identical message. It must NOT reappear: the
    // viewer has already closed this sentence once.
    state = push(state, "Autoplay blocked — tap play.");
    expect(state.visible).toBe(false);
    expect(selectStatus(state).show).toBe(false);

    // Different wording is a genuinely new fact, and does come back.
    state = push(state, "Autoplay unblocked — playing.");
    expect(state.visible).toBe(true);
  });

  it("clears, and a blank push also clears rather than rendering nothing", () => {
    let state = push(INITIAL_STATUS, "All sources exhausted.");
    state = statusReducer(state, statusActions.clear());
    expect(state.message).toBeNull();
    expect(selectStatus(state).show).toBe(false);

    // An empty status line occupies the row and announces nothing — worse than
    // no line at all.
    state = push(state, "   ");
    expect(state.message).toBeNull();
    state = push(state, null);
    expect(state.message).toBeNull();
    state = push(state, undefined);
    expect(state.message).toBeNull();
  });

  it("ignores dismiss and clear when there is nothing showing", () => {
    expect(statusReducer(INITIAL_STATUS, statusActions.dismiss())).toEqual(INITIAL_STATUS);
    expect(statusReducer(INITIAL_STATUS, statusActions.clear())).toEqual(INITIAL_STATUS);
  });

  it("refuses an unknown action instead of guessing", () => {
    const state = push(INITIAL_STATUS, "kept");
    expect(statusReducer(state, { type: "explode" })).toBe(state);
    expect(statusReducer(state, {})).toBe(state);
  });
});

describe("statusMachine — repeats do not re-announce", () => {
  it("does not bump seq for the same wording, so the live region stays quiet", () => {
    let state = push(INITIAL_STATUS, "VidCore: probing one media byte…", STATUS_KIND.INFO, "probe");
    const { seq } = state;

    // Per-source progress fires repeatedly. If seq moved, the aria-live region
    // would re-announce the identical sentence every time.
    for (let i = 0; i < 10; i += 1) {
      state = push(state, "VidCore: probing one media byte…", STATUS_KIND.INFO, "probe");
    }

    expect(state.seq).toBe(seq);
    expect(state.visible).toBe(true);
  });

  it("treats different text under the same key as a new message", () => {
    let state = push(INITIAL_STATUS, "Retrying 1/2…", STATUS_KIND.INFO, "retry");
    const { seq } = state;
    state = push(state, "Retrying 2/2…", STATUS_KIND.INFO, "retry");
    expect(state.seq).toBe(seq + 1);
    expect(state.message).toBe("Retrying 2/2…");
  });

  it("normalises whitespace so a wrapped message is not a 'new' one", () => {
    let state = push(INITIAL_STATUS, "no   playable\n  URL", STATUS_KIND.INFO, "x");
    const { seq } = state;
    state = push(state, "no playable URL", STATUS_KIND.INFO, "x");
    expect(state.seq).toBe(seq);
    expect(state.message).toBe("no playable URL");
  });
});

describe("statusMachine — lifetime is per message", () => {
  it("defaults to a self-clearing ttl", () => {
    const state = push(INITIAL_STATUS, "Video stalled.");
    expect(state.ttlMs).toBe(DEFAULT_STATUS_TTL_MS);
    expect(selectStatus(state).persistent).toBe(false);
  });

  it("lets a failure stay put, and reports itself as persistent", () => {
    // "All sources exhausted" must survive ten seconds of the viewer not
    // looking at the screen. That is the whole reason ttl is per-message.
    const state = push(INITIAL_STATUS, "All sources exhausted.", STATUS_KIND.ERROR, "exhausted", 0);
    expect(state.ttlMs).toBe(0);
    expect(selectStatus(state).persistent).toBe(true);
  });

  it("falls back to the current ttl when given a non-number", () => {
    const state = push(INITIAL_STATUS, "x", STATUS_KIND.INFO, null, "nope");
    expect(state.ttlMs).toBe(DEFAULT_STATUS_TTL_MS);
  });

  it("resets the ttl after a clear, so the next message is not stuck", () => {
    let state = push(INITIAL_STATUS, "All sources exhausted.", STATUS_KIND.ERROR, "e", 0);
    state = statusReducer(state, statusActions.clear());
    expect(state.ttlMs).toBe(DEFAULT_STATUS_TTL_MS);
  });
});

describe("selectStatus — one answer for show / kind / politeness", () => {
  it("reports nothing when hidden", () => {
    const view = selectStatus(push(INITIAL_STATUS, "hidden then dismissed"));
    const hidden = selectStatus(statusReducer(
      { ...INITIAL_STATUS, message: "m", visible: false },
    ));
    expect(hidden.show).toBe(false);
    expect(hidden.message).toBeNull();
    expect(view.kind).toBe(STATUS_KIND.INFO);
  });

  it("is polite for info and warn, assertive only for errors", () => {
    const info = selectStatus(push(INITIAL_STATUS, "Trying next source", STATUS_KIND.INFO));
    const warn = selectStatus(push(INITIAL_STATUS, "Video stalled", STATUS_KIND.WARN));
    const error = selectStatus(push(INITIAL_STATUS, "Playback failed", STATUS_KIND.ERROR));

    // A "trying the next source" notice must not interrupt a screen-reader user
    // mid-sentence. Only a failure justifies that.
    expect(info.live).toBe("polite");
    expect(warn.live).toBe("polite");
    expect(error.live).toBe("assertive");
    expect(error.isError).toBe(true);
  });

  it("defaults an unknown kind to info rather than trusting it", () => {
    const state = push(INITIAL_STATUS, "m", "catastrophic");
    expect(state.kind).toBe(STATUS_KIND.INFO);
  });
});
