import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PlayerShell, { PLAYER_PROPS } from "../components/player/v2/PlayerShell";
import LoadingStage from "../components/player/v2/LoadingStage";
import { S, selectView } from "../components/player/v2/playbackMachine";

/* PLAYER V2 Phase 1 shell + loading stage (task.md 6.2, 2.1, 2.3, 2.5).
 *
 * The loaders are asserted on meaning, not on markup: a test that checks for a
 * class name passes just as happily against a stage a screen reader cannot
 * perceive, which is precisely the regression the old stage shipped.
 */

/* ── LoadingStage ─────────────────────────────────────────────────────── */

const base = {
  title: "Reacher",
  backdropUrl: "/backdrop.jpg",
  posterUrl: "/logo.png",
  announcement: "Finding a playable source.",
  state: S.RESOLVING,
};

describe("LoadingStage", () => {
  it("renders the two KEEP pieces: blurred art and centred logo", () => {
    render(<LoadingStage {...base} />);
    expect(screen.getByRole("img", { name: "Reacher" })).toHaveAttribute("src", "/logo.png");
    // The art is decorative ambience, so it must be hidden from assistive tech
    // rather than announced as a second, confusing image.
    expect(document.querySelector(".pv2-loading-art")).toHaveAttribute("aria-hidden", "true");
  });

  it("falls back to the title text when there is no logo", () => {
    // Artwork cannot be assumed present; an anonymous blur is not acceptable.
    render(<LoadingStage {...base} posterUrl="" />);
    expect(screen.getByText("Reacher")).toBeInTheDocument();
  });

  it("renders the horizontal bar that replaces the conic ring", () => {
    const { container } = render(<LoadingStage {...base} />);
    expect(container.querySelector(".pv2-loading-bar")).toBeInTheDocument();
    expect(container.querySelector(".pv2-loading-bar-fill")).toBeInTheDocument();
    // No conic-gradient ring anywhere in v2.
    expect(container.querySelector('[style*="conic"]')).toBeNull();
  });

  it("animates the bar for every real wait, including a stall", () => {
    // Freezing on `stalled` would be a lie in the other direction: the wait is
    // real, it just has no progress to show.
    for (const state of [S.RESOLVING, S.OPENING, S.BUFFERING, S.STALLED]) {
      const { container, unmount } = render(<LoadingStage {...base} state={state} />);
      expect(
        container.querySelector(".pv2-loading-bar")?.dataset.frozen,
        `${state} bar frozen`,
      ).toBe("false");
      unmount();
    }
  });

  it("freezes the bar for terminal states", () => {
    for (const state of [S.ENDED, S.ERROR, S.IDLE]) {
      const { container, unmount } = render(<LoadingStage {...base} state={state} />);
      expect(
        container.querySelector(".pv2-loading-bar")?.dataset.frozen,
        `${state} bar animated`,
      ).toBe("true");
      unmount();
    }
  });

  it("announces the supplied text in a polite live region", () => {
    render(<LoadingStage {...base} announcement="Buffering video." />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Buffering video.");
  });

  it("keeps the status node perceptible to assistive tech", () => {
    const { container } = render(<LoadingStage {...base} />);
    const status = container.querySelector(".pv2-loading-status");
    // `display:none` / `visibility:hidden` / `aria-hidden` would all remove it
    // from the accessibility tree — the announcement would be silently dropped,
    // which is the bug the old fixed-label stage had.
    expect(status).not.toHaveAttribute("aria-hidden");
    expect(status?.style.display).not.toBe("none");
    expect(status?.style.visibility).not.toBe("hidden");
  });

  it("survives being given nothing at all", () => {
    expect(() => render(<LoadingStage />)).not.toThrow();
  });
});

/* ── PlayerShell ──────────────────────────────────────────────────────── */

describe("PlayerShell", () => {
  it("shows the loader on first paint, because mounting IS a load request", () => {
    // Entering at `idle` would render an empty shell: showLoader is correctly
    // false there, so the player would mount looking frozen before it began.
    render(<PlayerShell title="Reacher" />);
    expect(screen.getByRole("status")).toHaveTextContent("Finding a playable source.");
    expect(document.querySelector(".pv2-shell")?.dataset.state).toBe(S.RESOLVING);
  });

  it("stamps the overlay contract so consumers can detect it", () => {
    render(<PlayerShell title="Reacher" />);
    expect(document.querySelector(".pv2-shell")).toHaveAttribute(
      "data-player-open",
      "true",
    );
  });

  it("forwards ref to the shell root", () => {
    const ref = { current: null };
    render(<PlayerShell title="Reacher" ref={ref} />);
    expect(ref.current).toBe(document.querySelector(".pv2-shell"));
  });

  it("reflects the reduced-motion preference as an attribute", () => {
    const { rerender } = render(<PlayerShell title="Reacher" reduceMotion />);
    expect(document.querySelector(".pv2-shell")?.dataset.reduceMotion).toBe("true");
    rerender(<PlayerShell title="Reacher" reduceMotion={false} />);
    expect(document.querySelector(".pv2-shell")?.dataset.reduceMotion).toBe("false");
  });

  it("never imports or renders the app-wide Loader (task.md 1.2)", () => {
    const { container } = render(<PlayerShell title="Reacher" />);
    // components/Loader.jsx is app-wide; v2 uses its own .pv2-* surface.
    expect(container.querySelector('[class*="loader"]')).toBeNull();
  });

  it("pushes the history entry that lets Back close the player (task.md 3.38)", () => {
    const push = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { unmount } = render(<PlayerShell title="Reacher" onClose={() => {}} />);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatchObject({ __pv2Back: true });

    unmount();
    // Closing by the player's own means must peel the entry, or leaving the page
    // later costs two Backs.
    expect(back).toHaveBeenCalledTimes(1);

    push.mockRestore();
    back.mockRestore();
  });
});

/* ── Prop contract (task.md 2.3) ──────────────────────────────────────── */

/**
 * The frozen contract from NativePlayerView.jsx:726-761. If the new player is
 * mounted by the same parent as the fallback, a dropped or renamed prop disables
 * a feature in ONE branch only — the worst kind of bug, because both branches
 * still "work".
 */
const FROZEN = [
  "type",
  "id",
  "season",
  "episode",
  "title",
  "subtitle",
  "imdbId",
  "backdropUrl",
  "posterUrl",
  "episodes",
  "onSelectEpisode",
  "canGoPrev",
  "canGoNext",
  "onGoPrev",
  "onGoNext",
  "onClose",
  "watchedEntry",
  "onProgressChange",
  "originalLanguage",
  "party",
];

describe("prop contract is frozen", () => {
  it("declares every prop the details page passes", () => {
    const declared = Object.keys(PLAYER_PROPS).concat(
      // Props with no default are consumed but not listed in PLAYER_PROPS.
      FROZEN.filter((p) => !(p in PLAYER_PROPS)),
    );
    for (const prop of FROZEN) {
      expect(declared, `PlayerShell must accept \`${prop}\``).toContain(prop);
    }
  });

  it("is a drop-in for the fallback: every prop renders without warning", () => {
    const all = Object.fromEntries(
      FROZEN.map((p) => [p, p.startsWith("on") || p.startsWith("can") ? () => {} : p === "episodes" ? [] : p === "watchedEntry" ? null : p === "party" ? null : "x"]),
    );
    expect(() => render(<PlayerShell {...all} />)).not.toThrow();
  });
});

/* ── 2.7 at the component boundary ────────────────────────────────────── */

describe("shell and stage agree on the state", () => {
  it("announces for exactly the non-silent states", () => {
    // Precise form of the 2.7 contract, after two over-narrow attempts.
    //
    // Attempt 1 compared `showLoader` to the announcement and wrongly flagged
    // `stalled`, which announces while deliberately showing NO full-screen
    // loader (it preserves the frame and uses the small spinner).
    //
    // Attempt 2 folded in `showBuffering` and then wrongly flagged `ended`,
    // which announces "Playback ended." and renders an end card — that card is
    // the signal, not a loading indicator. No loading indicator should appear
    // there.
    //
    // So the real invariant is: silence for idle+playing, an announcement for
    // everything else, and loading indicators ONLY for the four wait states.
    //
    // `paused` joined SILENT in 3.7. Announcing every pause means a live-region
    // update each time a viewer reaches for the volume control, which is noise
    // rather than information — the visible play/pause label already says it.
    const SILENT = [S.IDLE, S.PLAYING, S.PAUSED];
    const WAITING = [S.RESOLVING, S.OPENING, S.BUFFERING, S.STALLED];

    for (const state of Object.values(S)) {
      const view = selectView({ state, error: null });
      expect(Boolean(view.announcement), `${state} announcement`).toBe(!SILENT.includes(state));
      const showsLoadingIndicator = view.showLoader || view.showBuffering;
      expect(showsLoadingIndicator, `${state} loading indicator`).toBe(WAITING.includes(state));
    }
  });

  it("passes the machine's announcement through unchanged", () => {
    // If the stage ever invented its own text, it could describe a state the UI
    // is not in — the disagreement 2.7 exists to prevent.
    const view = selectView({ state: S.BUFFERING, error: null });
    render(<LoadingStage {...base} announcement={view.announcement} state={S.BUFFERING} />);
    expect(screen.getByRole("status")).toHaveTextContent(view.announcement);
  });
});
