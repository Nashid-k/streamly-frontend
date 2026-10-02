import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerShell from "../components/player/v2/PlayerShell";
import useResumeOffer from "../components/player/v2/hooks/useResumeOffer";

/* The wiring half of task.md 5.1.
 *
 * `useResumeOffer` is correct in isolation, but that saves nothing if the shell
 * never hands it `watchedEntry` — which is exactly the shape of the bug this
 * fixes: the prop was declared on PlayerShell and read by nothing. This pins the
 * seam, and the render path that turns a non-null offer into the card.
 */
vi.mock("../components/player/v2/hooks/useResumeOffer", () => ({
  default: vi.fn(() => ({ offer: null, chooseResume: vi.fn(), chooseRestart: vi.fn() })),
  RESUME_WAIT_SECONDS: 8,
}));

/* The source ladder is irrelevant here and must not hit the network. */
vi.mock("../components/player/v2/hooks/usePlayerSource", () => ({
  default: () => ({ url: "", resolved: null, kind: "" }),
}));

beforeEach(() => {
  useResumeOffer.mockReset();
  useResumeOffer.mockReturnValue({
    offer: null,
    chooseResume: vi.fn(),
    chooseRestart: vi.fn(),
  });
});

describe("PlayerShell wires the resume offer (task.md 5.1)", () => {
  it("hands the entry, the media key and the seek seam to the hook", () => {
    render(<PlayerShell title="Reacher" id="tt1" watchedEntry={{ timestamp: 300 }} />);

    expect(useResumeOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        watchedEntry: { timestamp: 300 },
        mediaKey: "movie:tt1:1:1",
        enabled: true,
        seekTo: expect.any(Function),
        duration: 0,
      }),
    );
  });

  it("gives a party guest no offer and a party host one", () => {
    const { unmount } = render(
      <PlayerShell title="Reacher" id="tt1" watchedEntry={{ timestamp: 1 }} party={{ isHost: false }} />,
    );
    expect(useResumeOffer).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
    unmount();

    render(
      <PlayerShell title="Reacher" id="tt1" watchedEntry={{ timestamp: 1 }} party={{ isHost: true }} />,
    );
    expect(useResumeOffer).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
  });

  it("renders the card and routes both choices to the hook", () => {
    const chooseResume = vi.fn();
    const chooseRestart = vi.fn();
    useResumeOffer.mockReturnValue({ offer: { at: 300, left: 4 }, chooseResume, chooseRestart });

    render(<PlayerShell title="Reacher" />);
    expect(screen.getByText("You left off at 5:00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resume from 5:00" }));
    expect(chooseResume).toHaveBeenCalledWith(300);

    fireEvent.click(screen.getByRole("button", { name: "Play from the beginning" }));
    expect(chooseRestart).toHaveBeenCalledTimes(1);
  });
});
