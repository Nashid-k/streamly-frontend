import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import StatusLine from "../components/player/v2/StatusLine";
import usePlayerStatus from "../components/player/v2/hooks/usePlayerStatus";
import usePlaybackStatus from "../components/player/v2/hooks/usePlaybackStatus";
import { S } from "../components/player/v2/playbackMachine";
import { STATUS_KIND } from "../components/player/v2/statusMachine";
import PlayerShell from "../components/player/v2/PlayerShell";

/* The visible half of task.md 2.9.
 *
 * `statusMachine.test.js` covers the decisions; this covers what a viewer and a
 * screen-reader user actually get. The two are separate on purpose: it is
 * entirely possible for a correct reducer to render an unusable line.
 */

const title = "Reacher";

describe("StatusLine", () => {
  it("renders nothing at all without a message", () => {
    const { container } = render(<StatusLine />);
    // Not merely invisible — absent. An empty status row still occupies the
    // chrome, which is the exact thing 2.9 exists to stop.
    expect(container.firstChild).toBeNull();
  });

  it("shows the message and marks its severity in the DOM", () => {
    const { container } = render(
      <StatusLine message="Video stalled — reconnecting." kind={STATUS_KIND.WARN} />,
    );
    const line = container.querySelector(".pv2-status");
    expect(line).toHaveTextContent("Video stalled — reconnecting.");
    expect(line).toHaveAttribute("data-kind", "warn");
  });

  it("uses role=status for progress and role=alert only for errors", () => {
    const { rerender, container } = render(
      <StatusLine message="Trying the next source" kind={STATUS_KIND.INFO} />,
    );
    expect(container.querySelector(".pv2-status")).toHaveAttribute("role", "status");

    rerender(<StatusLine message="All sources exhausted." kind={STATUS_KIND.ERROR} live="assertive" />);
    const errorLine = container.querySelector(".pv2-status");
    expect(errorLine).toHaveAttribute("role", "alert");
    // Errors must interrupt; everything else must wait its turn.
    expect(errorLine).toHaveAttribute("aria-live", "assertive");
  });

  it("is dismissible by keyboard-reachable button, and says what it does", () => {
    const onDismiss = vi.fn();
    render(<StatusLine message="All sources exhausted." onDismiss={onDismiss} />);

    const button = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(button);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("omits the button entirely when nothing can dismiss it", () => {
    render(<StatusLine message="Playback failed." />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("marks reduced motion so the CSS can opt out", () => {
    const { container } = render(<StatusLine message="m" reduceMotion />);
    expect(container.querySelector(".pv2-status")).toHaveAttribute("data-reduce-motion", "true");
  });
});

describe("usePlayerStatus", () => {
  it("pushes, shows, and dismisses", () => {
    const { result } = renderHook(() => usePlayerStatus());
    expect(result.current.show).toBe(false);

    act(() => result.current.push("Trying VidCore…"));
    expect(result.current.show).toBe(true);
    expect(result.current.message).toBe("Trying VidCore…");

    act(() => result.current.dismiss());
    expect(result.current.show).toBe(false);
  });

  it("clears itself after the ttl", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => usePlayerStatus({ defaultTtlMs: 1000 }));
      act(() => result.current.push("Trying VidCore…"));
      expect(result.current.show).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1001);
      });
      expect(result.current.show).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT schedule a timer for a persistent message", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => usePlayerStatus());
      act(() => result.current.push("All sources exhausted.", STATUS_KIND.ERROR, "e", 0));
      expect(result.current.show).toBe(true);

      // If a timer were scheduled, this is where a long-lived failure would
      // silently vanish while the viewer was not looking.
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(result.current.show).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("PlayerShell", () => {
  it("adds no status line on top of the loader's own live region", () => {
    render(<PlayerShell title={title} />);

    // The loader speaks for itself. The status line must stay out of the way, or
    // the same sentence is announced twice and the chrome gains a stray row.
    expect(screen.getByRole("status")).toHaveTextContent(/finding a playable source/i);
    expect(document.querySelector(".pv2-status")).toBeNull();
  });
});

describe("usePlaybackStatus — which states are worth saying out loud", () => {
  const mount = (state, rev, announcement) =>
    renderHook(() => usePlaybackStatus(state, rev, announcement));

  it("says nothing while loading, because the loader already says it", () => {
    for (const state of [S.RESOLVING, S.OPENING, S.BUFFERING]) {
      const { result, unmount } = mount(state, 1, "Loading.");
      expect(result.current.show, `${state} must stay silent`).toBe(false);
      unmount();
    }
  });

  it("says nothing at rest", () => {
    for (const state of [S.IDLE, S.PLAYING]) {
      const { result, unmount } = mount(state, 1, "");
      expect(result.current.show, `${state} must stay silent`).toBe(false);
      unmount();
    }
  });

  it("stays silent on `ended`, because the UpNextCard owns that moment", () => {
    // Phase 3 will render the end card. Two competing notices for one event is
    // how a player ends up feeling like it is arguing with itself.
    const { result } = mount(S.ENDED, 1, "Playback ended.");
    expect(result.current.show).toBe(false);
  });

  it("warns on a stall, and lets it clear itself", () => {
    const { result } = mount(S.STALLED, 3, "Video stalled. Reconnecting.");
    expect(result.current.show).toBe(true);
    expect(result.current.message).toBe("Video stalled. Reconnecting.");
    expect(result.current.kind).toBe(STATUS_KIND.WARN);
    // A stall resolves on its own; a permanent notice for a temporary state is
    // how players end up with a stale warning nobody can clear.
    expect(result.current.persistent).toBe(false);
  });

  it("makes an error assertive and permanent, and keeps the reason", () => {
    const { result } = mount(S.ERROR, 4, "Playback failed. Manifest unreachable.");
    expect(result.current.show).toBe(true);
    expect(result.current.message).toBe("Playback failed. Manifest unreachable.");
    expect(result.current.isError).toBe(true);
    expect(result.current.live).toBe("assertive");
    // Persistent: the viewer may still be reaching for the remote.
    expect(result.current.persistent).toBe(true);
  });

  it("re-announces a returning stall only when the wording actually changes", () => {
    const { result, rerender } = renderHook(
      ({ state, rev, text }) => usePlaybackStatus(state, rev, text),
      { initialProps: { state: S.STALLED, rev: 3, text: "Video stalled. Reconnecting." } },
    );
    expect(result.current.show).toBe(true);
    const seq = result.current.seq;

    // Same stall, re-rendered: no new notice, no re-announcement storm.
    rerender({ state: S.STALLED, rev: 4, text: "Video stalled. Reconnecting." });
    expect(result.current.seq).toBe(seq);

    // Different wording is a new fact and may speak again.
    rerender({ state: S.STALLED, rev: 5, text: "Still reconnecting…" });
    expect(result.current.seq).toBe(seq + 1);
  });
});
