import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* PLAYER V2 boundary ingestion (task.md 3.16).
 *
 * 3.16's own rule — a mark on the timeline is a claim, so it may only ever come
 * from a MEASURED source — lives in `boundaryTicks.js`. What these tests hold is
 * the plumbing that decides WHICH source V2 can honestly claim: the SkipDB
 * dataset, keyed by IMDb id, and nothing it cannot measure for itself.
 *
 * They also pin the parts that would make the feature lie by accident: a title
 * change must not leave the previous title's marks on the bar, a late response
 * from an abandoned lookup must not paint, and a miss must stay invisible.
 */

vi.mock("../api/skipBoundarySource", () => ({
  fetchSkipBoundaries: vi.fn(),
}));

import { fetchSkipBoundaries } from "../api/skipBoundarySource";
import useSkipBoundaries from "../components/player/v2/hooks/useSkipBoundaries";

function Probe(props) {
  const boundaries = useSkipBoundaries(props);
  return <div data-testid="probe">{boundaries ? JSON.stringify(boundaries) : "none"}</div>;
}

const BOUNDS = { introEndSeconds: 42, creditsStartSeconds: 5400 };

function readProbe(container) {
  return JSON.parse(container.querySelector("[data-testid=probe]").textContent);
}

describe("useSkipBoundaries", () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchSkipBoundaries.mockReset();
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("stamps the source so the tick rule can recognise a measurement", async () => {
    // Without the stamp `boundaryTicks` refuses the record and draws nothing. An
    // unstamped record would be safe-by-accident rather than safe-by-rule, and the
    // two behave differently the moment the shape changes upstream.
    fetchSkipBoundaries.mockResolvedValue(BOUNDS);
    const { container } = render(<Probe imdbId="tt123" />);
    await waitFor(() => expect(container.querySelector("[data-testid=probe]").textContent).not.toBe("none"));
    expect(readProbe(container)).toEqual({ ...BOUNDS, source: "dataset" });
  });

  it("asks for no imdb id, no request", async () => {
    // A miss must be quiet: no fetch, no log, no state change.
    render(<Probe imdbId="" />);
    await act(async () => {});
    expect(fetchSkipBoundaries).not.toHaveBeenCalled();
  });

  it("passes season and episode for a series, and omits them for a film", async () => {
    // A film has no episode, and sending `episode=undefined` as a query parameter
    // asks the dataset a question about a movie.
    fetchSkipBoundaries.mockResolvedValue(BOUNDS);
    render(<Probe imdbId="tt1" type="tv" season={2} episode={7} />);
    await waitFor(() => expect(fetchSkipBoundaries).toHaveBeenCalled());
    expect(fetchSkipBoundaries.mock.calls[0][0]).toMatchObject({ season: 2, episode: 7 });

    fetchSkipBoundaries.mockClear();
    render(<Probe imdbId="tt2" type="movie" season={2} episode={7} />);
    await waitFor(() => expect(fetchSkipBoundaries).toHaveBeenCalled());
    expect(fetchSkipBoundaries.mock.calls[0][0]).toMatchObject({
      season: undefined,
      episode: undefined,
    });
  });

  it("never blocks playback on a slow lookup", async () => {
    // The promise is left pending for the whole test. If the hook awaited before
    // returning, the probe would still read "none" — and more importantly a real
    // player would have no scrubber until a boundary service answered.
    fetchSkipBoundaries.mockReturnValue(new Promise(() => {}));
    const { container } = render(<Probe imdbId="tt1" />);
    await act(async () => {});
    expect(container.querySelector("[data-testid=probe]").textContent).toBe("none");
  });

  it("drops the previous title's marks the moment the id changes", async () => {
    // Otherwise episode 1's credits tick sits on episode 2's bar for the length of
    // the lookup — a stale fact presented as a current one.
    fetchSkipBoundaries.mockResolvedValue(BOUNDS);
    const { container, rerender } = render(<Probe imdbId="tt1" />);
    await waitFor(() => expect(readProbe(container)).toMatchObject({ introEndSeconds: 42 }));

    fetchSkipBoundaries.mockReturnValue(new Promise(() => {}));
    rerender(<Probe imdbId="tt2" />);
    await waitFor(() =>
      expect(container.querySelector("[data-testid=probe]").textContent).toBe("none"),
    );
  });

  it("ignores an abandoned lookup that resolves after the title changed", async () => {
    // Where `alive` is actually observable. Aborting is advisory — a response can
    // already be in flight when it is called, and a raced request can still land.
    // Without the guard, episode 1's boundaries would be painted onto episode 2's
    // bar: a stale fact presented as a current one. The mock deliberately ignores
    // the abort signal so the guard is what stops it.
    const deferred = [];
    fetchSkipBoundaries.mockImplementation(() => new Promise((resolve) => deferred.push(resolve)));
    const { container, rerender } = render(<Probe imdbId="tt1" />);
    await act(async () => {});
    expect(deferred).toHaveLength(1);

    rerender(<Probe imdbId="tt2" />);
    await act(async () => {});
    expect(deferred).toHaveLength(2);

    await act(async () => { deferred[0]({ introEndSeconds: 42, creditsStartSeconds: 5400 }); });
    // Episode 1 answering into episode 2's player.
    expect(container.querySelector("[data-testid=probe]").textContent).toBe("none");

    // ...and the live one still works, so the guard is not simply suppressing all
    // arrivals.
    await act(async () => { deferred[1]({ introEndSeconds: 84, creditsStartSeconds: 5500 }); });
    expect(readProbe(container)).toMatchObject({ introEndSeconds: 84, source: "dataset" });
  });

  it("does not paint a response that arrives after unmount", async () => {
    // The `alive` guard. A late `setState` on an unmounted hook is a React warning
    // in development and a leak in production — asserted by the absence of a React
    // warning, since the DOM is gone by then and there is nothing left to read.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let resolve;
    fetchSkipBoundaries.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { unmount } = render(<Probe imdbId="tt1" />);
    await act(async () => {});
    unmount();
    await act(async () => { resolve(BOUNDS); });
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("aborts the request when the title changes", async () => {
    // Otherwise every episode visit leaves a request in flight against a service
    // that is rate limited — and the next episode's lookup queues behind it.
    // Collected rather than kept in one variable, because the replacement effect
    // fires a SECOND lookup whose fresh signal must not be mistaken for the
    // aborted one.
    const signals = [];
    fetchSkipBoundaries.mockImplementation(({ signal }) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    const { rerender } = render(<Probe imdbId="tt1" />);
    await act(async () => {});
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);
    rerender(<Probe imdbId="tt2" />);
    await waitFor(() => expect(signals[0].aborted).toBe(true));
    // The replacement request is live, not aborted — otherwise the new title never
    // gets marks at all.
    expect(signals).toHaveLength(2);
    expect(signals[1].aborted).toBe(false);
  });

  it("leaves the bar bare when the dataset has no entry for this title", async () => {
    // The common case: most titles have no SkipDB record. This is not an error and
    // must not surface one.
    fetchSkipBoundaries.mockResolvedValue(null);
    const { container } = render(<Probe imdbId="tt1" />);
    await act(async () => {});
    expect(container.querySelector("[data-testid=probe]").textContent).toBe("none");
  });

  it("survives a rejected lookup without taking the player with it", async () => {
    fetchSkipBoundaries.mockRejectedValue(new Error("network down"));
    const { container } = render(<Probe imdbId="tt1" />);
    await act(async () => {});
    expect(container.querySelector("[data-testid=probe]").textContent).toBe("none");
  });
});