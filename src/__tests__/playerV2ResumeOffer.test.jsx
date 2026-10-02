import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResumeOffer from "../components/player/v2/ResumeOffer";
import useResumeOffer, {
  RESUME_WAIT_SECONDS,
} from "../components/player/v2/hooks/useResumeOffer";

/* Resume offer (task.md 5.1).
 *
 * Two claims, split deliberately. The card is presentational, so its contract is
 * asserted by rendering it with numbers. The timing contract — raise before
 * resolve, apply at metadata, respect the party/finished gates — is asserted by
 * driving the hook with a stand-in media node, because none of it is visible in
 * the markup.
 */

function makeVideo({ readyState = 0 } = {}) {
  const target = new EventTarget();
  target.readyState = readyState;
  return target;
}

const RECORDED_WAIT = 5;
const KEY = "movie:tt1:1:1";

describe("ResumeOffer card (task.md 5.1)", () => {
  it("names the saved position in the viewer's own timecode", () => {
    render(<ResumeOffer at={125} remaining={5} />);
    expect(screen.getByText("You left off at 2:05")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Resume from 2:05" })).toBeInTheDocument();
  });

  it("reports the countdown, and stops counting down at zero", () => {
    const { rerender } = render(<ResumeOffer at={125} remaining={RECORDED_WAIT} />);
    expect(screen.getByText(`Auto-resuming in ${RECORDED_WAIT}s`)).toBeInTheDocument();
    rerender(<ResumeOffer at={125} remaining={0} />);
    expect(screen.getByText("Resuming…")).toBeInTheDocument();
  });

  it("hands the saved second to Resume and nothing to Start over", () => {
    const onResume = vi.fn();
    const onRestart = vi.fn();
    render(<ResumeOffer at={125} remaining={5} onResume={onResume} onRestart={onRestart} />);

    fireEvent.click(screen.getByRole("button", { name: "Resume from 2:05" }));
    expect(onResume).toHaveBeenCalledWith(125);

    fireEvent.click(screen.getByRole("button", { name: "Play from the beginning" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("survives being given no handlers", () => {
    const { getByRole } = render(<ResumeOffer at={10} remaining={1} />);
    expect(() => fireEvent.click(getByRole("button", { name: /resume from/i }))).not.toThrow();
  });
});

describe("useResumeOffer (task.md 5.1)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("raises the offer on mount, before any element exists", () => {
    // The whole point of 5.1: the offer must not wait for the source ladder.
    const { result } = renderHook(() =>
      useResumeOffer({ watchedEntry: { timestamp: 300 }, mediaKey: KEY, seekTo: vi.fn() }),
    );
    expect(result.current.offer).toEqual({ at: 300, left: RESUME_WAIT_SECONDS });
  });

  it("offers nothing without a real resume point", () => {
    for (const watchedEntry of [null, { timestamp: 0 }, { timestamp: -4 }]) {
      const { result, unmount } = renderHook(() =>
        useResumeOffer({ watchedEntry, mediaKey: KEY, seekTo: vi.fn() }),
      );
      expect(result.current.offer, `entry ${JSON.stringify(watchedEntry)}`).toBeNull();
      unmount();
    }
  });

  it("does not offer to a party guest — the host owns the playhead", () => {
    const { result } = renderHook(() =>
      useResumeOffer({
        watchedEntry: { timestamp: 300 },
        mediaKey: KEY,
        enabled: false,
        seekTo: vi.fn(),
      }),
    );
    expect(result.current.offer).toBeNull();
  });

  it("seeks only once the element reports metadata", () => {
    const seekTo = vi.fn();
    const video = makeVideo({ readyState: 0 });
    const { result } = renderHook(() =>
      useResumeOffer({ watchedEntry: { timestamp: 300 }, videoNode: video, mediaKey: KEY, seekTo }),
    );

    act(() => result.current.chooseResume(300));
    // Choosing closes the card but must NOT write `currentTime` yet: before
    // HAVE_METADATA that assignment throws or is silently ignored.
    expect(result.current.offer).toBeNull();
    expect(seekTo).not.toHaveBeenCalled();

    video.readyState = 1;
    act(() => video.dispatchEvent(new Event("loadedmetadata")));
    expect(seekTo).toHaveBeenCalledWith(300);
  });

  it("seeks immediately when the element is already seekable", () => {
    const seekTo = vi.fn();
    const video = makeVideo({ readyState: 1 });
    const { result } = renderHook(() =>
      useResumeOffer({ watchedEntry: { timestamp: 300 }, videoNode: video, mediaKey: KEY, seekTo }),
    );

    act(() => result.current.chooseResume(300));
    expect(seekTo).toHaveBeenCalledWith(300);
  });

  it("dismisses without seeking when the viewer starts over", () => {
    const seekTo = vi.fn();
    const video = makeVideo({ readyState: 1 });
    const { result } = renderHook(() =>
      useResumeOffer({ watchedEntry: { timestamp: 300 }, videoNode: video, mediaKey: KEY, seekTo }),
    );

    act(() => result.current.chooseRestart());
    expect(result.current.offer).toBeNull();
    expect(seekTo).not.toHaveBeenCalled();

    act(() => video.dispatchEvent(new Event("loadedmetadata")));
    expect(seekTo).not.toHaveBeenCalled();
  });

  it("auto-resumes when the countdown runs out", () => {
    vi.useFakeTimers();
    const seekTo = vi.fn();
    const video = makeVideo({ readyState: 1 });
    const { result } = renderHook(() =>
      useResumeOffer({
        watchedEntry: { timestamp: 90 },
        videoNode: video,
        mediaKey: KEY,
        seekTo,
        waitSeconds: 2,
      }),
    );

    expect(result.current.offer).toEqual({ at: 90, left: 2 });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.offer).toEqual({ at: 90, left: 1 });
    act(() => vi.advanceTimersByTime(1000));

    expect(seekTo).toHaveBeenCalledWith(90);
    expect(result.current.offer).toBeNull();
  });

  it("drops a finished entry once the duration is known", () => {
    const video = makeVideo({ readyState: 1 });
    const base = { watchedEntry: { timestamp: 95 }, videoNode: video, mediaKey: KEY, seekTo: vi.fn() };
    const { result, rerender } = renderHook((props) => useResumeOffer(props), {
      initialProps: { ...base, duration: 0 },
    });
    expect(result.current.offer).not.toBeNull();

    // 95 is past 92% of a 100s runtime — resuming would land in the credits.
    rerender({ ...base, duration: 100 });
    expect(result.current.offer).toBeNull();
  });

  it("does not re-arm when the progress sink rewrites the entry mid-offer", () => {
    const video = makeVideo({ readyState: 0 });
    const base = { videoNode: video, mediaKey: KEY, seekTo: vi.fn() };
    const { result, rerender } = renderHook((props) => useResumeOffer(props), {
      initialProps: { ...base, watchedEntry: { timestamp: 50 } },
    });
    expect(result.current.offer).toEqual({ at: 50, left: RESUME_WAIT_SECONDS });

    // The sink reports the NEW playhead; the card must keep its original offer
    // rather than reset the countdown every second.
    rerender({ ...base, watchedEntry: { timestamp: 51 } });
    expect(result.current.offer).toEqual({ at: 50, left: RESUME_WAIT_SECONDS });
  });
});
