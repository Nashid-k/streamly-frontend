import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import usePlayerProgress from "../components/player/v2/hooks/usePlayerProgress";
import PlayerShell from "../components/player/v2/PlayerShell";

/* The wiring half of task.md 5.25.
 *
 * `usePlayerProgress` is correct in isolation and PlayerShell accepts
 * `onProgressChange`, but neither of those facts saves a position on its own:
 * if the shell forgets to pass the parent's sink through, the prop is declared,
 * the hook is tested, and the feature is still dead. This pins the seam the
 * audit flagged — v2 held the sink and never used it.
 */
vi.mock("../components/player/v2/hooks/usePlayerProgress", () => ({
  default: vi.fn(() => ({ flush: vi.fn(), latestTime: () => 0 })),
}));

describe("PlayerShell wires the progress sink (task.md 5.25)", () => {
  it("hands the parent's onProgressChange and the playhead to usePlayerProgress", () => {
    const sink = vi.fn();
    render(<PlayerShell title="Reacher" onProgressChange={sink} />);

    expect(usePlayerProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        onProgressChange: sink,
        subscribePlayhead: expect.any(Function),
      }),
    );
  });
});
