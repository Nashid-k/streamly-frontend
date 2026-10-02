import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import usePlayerProgress from "../components/player/v2/hooks/usePlayerProgress";

/* PLAYER V2 progress persistence (task.md 5.25).
 *
 * v2 was handed `onProgressChange` by the details page and never called it, so
 * closing the player discarded the playhead and the title restarted from zero.
 * The hook's whole job is the OUTGOING half: remember the last frame-rate
 * position and write it once, on the path every close takes (unmount).
 *
 * The two ways this can silently regress are covered directly:
 *  - reading the element at cleanup time (already detached -> saves 0), so the
 *    value must come from the retained ref, and
 *  - an inline `onProgressChange` from the parent re-running the unmount effect
 *    on every render (flushing repeatedly), so the sink is ref'd.
 */

/** A playhead whose subscribers can be driven by hand, like the rAF channel. */
function makePlayhead(initial = 0) {
  const callbacks = new Set();
  return {
    subscribe(callback) {
      callbacks.add(callback);
      callback(initial);
      return () => callbacks.delete(callback);
    },
    deliver(seconds) {
      for (const callback of callbacks) callback(seconds);
    },
  };
}

let api;
function Probe(props) {
  api = usePlayerProgress(props);
  return null;
}

describe("usePlayerProgress (task.md 5.25)", () => {
  it("reports the last delivered second, floored, on flush", () => {
    const playhead = makePlayhead();
    const sink = vi.fn();
    render(<Probe subscribePlayhead={playhead.subscribe} onProgressChange={sink} />);

    act(() => playhead.deliver(142.9));
    act(() => api.flush());

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(142);
  });

  it("does not report below the save threshold", () => {
    const playhead = makePlayhead(4.5);
    const sink = vi.fn();
    render(<Probe subscribePlayhead={playhead.subscribe} onProgressChange={sink} />);

    act(() => api.flush());

    expect(sink).not.toHaveBeenCalled();
  });

  it("flushes the final position on unmount, the path every close takes", () => {
    const playhead = makePlayhead();
    const sink = vi.fn();
    const { unmount } = render(
      <Probe subscribePlayhead={playhead.subscribe} onProgressChange={sink} />,
    );

    act(() => playhead.deliver(600));
    unmount();

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(600);
  });

  it("uses the latest sink, so a parent that re-renders every frame is not stale", () => {
    const playhead = makePlayhead();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <Probe subscribePlayhead={playhead.subscribe} onProgressChange={first} />,
    );

    act(() => playhead.deliver(50));
    rerender(<Probe subscribePlayhead={playhead.subscribe} onProgressChange={second} />);
    act(() => api.flush());

    expect(second).toHaveBeenCalledWith(50);
    expect(first).not.toHaveBeenCalled();
  });

  it("survives a missing playhead subscription and a missing sink", () => {
    expect(() => render(<Probe />)).not.toThrow();
    expect(() => act(() => api.flush())).not.toThrow();
  });
});
