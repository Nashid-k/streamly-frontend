import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* PLAYER V2 subtitle pipeline (task.md 6.4's subtitle half).
 *
 * This hook is the one part of the player that talks to a REMOTE RESOURCE on
 * demand. Every viewer-driven action elsewhere in `usePlayerControls` resolves
 * immediately and cannot fail; here a language list can come back empty, a
 * download can fail, a body can parse to nothing. So the tests are about the
 * failure states, because that is where this kind of code is actually wrong:
 *
 *  - a SUPERSEDED pick must not clear or report against the current one
 *  - "Off" must clear the cues, not merely hide the text, or a later seek
 *    resurrects a line from a track the viewer turned off
 *  - a failed download must leave a VISIBLE reason. `note()` is a no-op stub, so
 *    without `error` a refused download is completely silent
 *  - a title change must not carry the previous title's last cue onto the new one
 */

vi.mock("../api/subtitleFetcher", () => ({
  SubtitleFetcher: {
    searchAvailableSubtitles: vi.fn(),
    downloadAndDecompress: vi.fn(),
  },
}));

import { SubtitleFetcher } from "../api/subtitleFetcher";
import { PreferencesContext } from "../context/preferences";
import usePlayerSubtitles from "../components/player/v2/hooks/usePlayerSubtitles";

const SRT = [
  "1",
  "00:00:01,000 --> 00:00:03,000",
  "First cue",
  "",
  "2",
  "00:00:05,000 --> 00:00:07,000",
  "Second cue",
].join("\n");

const ENGLISH = { language: "English", languageId: "en", downloadLink: "/en" };
const SPANISH = { language: "Spanish", languageId: "es", downloadLink: "/es" };
const TAMIL = { language: "Tamil", languageId: "ta", downloadLink: "/ta" };

function Probe(props) {
  const s = usePlayerSubtitles(props);
  return (
    <div>
      <span data-testid="cue">{s.cue ?? ""}</span>
      <span data-testid="langs">{s.languages.map((l) => l.language).join(",")}</span>
      <span data-testid="track">{s.track?.language ?? ""}</span>
      <span data-testid="error">{s.error ?? ""}</span>
      <span data-testid="loading">{String(s.loading)}</span>
      <button type="button" onClick={() => s.select(props.pick)}>pick</button>
    </div>
  );
}

const text = (c, id) => c.querySelector(`[data-testid=${id}]`).textContent;

function renderHook(props = {}) {
  const utils = render(<Probe {...props} />);
  return { ...utils, container: utils.container };
}

describe("usePlayerSubtitles", () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    SubtitleFetcher.searchAvailableSubtitles.mockReset();
    SubtitleFetcher.downloadAndDecompress.mockReset();
    SubtitleFetcher.searchAvailableSubtitles.mockResolvedValue([]);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe("the language list", () => {
    it("loads once per title", async () => {
      renderHook({ imdbId: "tt1", title: "A" });
      await waitFor(() => expect(SubtitleFetcher.searchAvailableSubtitles).toHaveBeenCalledTimes(1));
      expect(SubtitleFetcher.searchAvailableSubtitles).toHaveBeenCalledWith("tt1", "A");
    });

    it("populates a non-empty list instead of dropping it to a stale token", async () => {
      /* REGRESSION (found while building 5.12). The title-change effect bumps the
       * same `tokenRef` the list fetch snapshotted, and both effects run in one
       * commit — so by the time the promise resolved its token was stale and
       * `setLanguages` never ran. The pane was always empty, which is also why
       * the restore preference had nothing to restore. */
      SubtitleFetcher.searchAvailableSubtitles.mockResolvedValue([ENGLISH, TAMIL]);
      const { container } = renderHook({ imdbId: "tt1" });
      await waitFor(() => expect(text(container, "langs")).toBe("English,Tamil"));
    });

    it("falls back to a title search when there is no imdbId", async () => {
      // The legacy has no imdbId gate on purpose: a title whose external_ids
      // lookup failed still gets a list instead of a silently empty pane.
      renderHook({ imdbId: "", title: "Dune" });
      await waitFor(() =>
        expect(SubtitleFetcher.searchAvailableSubtitles).toHaveBeenCalledWith("", "Dune"),
      );
    });

    it("reports an empty list as an empty list, not an error", async () => {
      // Most titles have no subtitles. That is a state the pane renders, and it is
      // not a failure worth a red line.
      SubtitleFetcher.searchAvailableSubtitles.mockResolvedValue([]);
      const { container } = renderHook({ imdbId: "tt1" });
      await waitFor(() => expect(text(container, "langs")).toBe(""));
      expect(text(container, "error")).toBe("");
    });

    it("survives a rejected search", async () => {
      SubtitleFetcher.searchAvailableSubtitles.mockRejectedValue(new Error("offline"));
      const { container } = renderHook({ imdbId: "tt1" });
      await act(async () => {});
      expect(text(container, "langs")).toBe("");
    });
  });

  describe("selecting a track", () => {
    it("downloads, parses and shows the cue at the current time", async () => {
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(SRT);
      const { container } = renderHook({ imdbId: "tt1", currentTime: 1.5, pick: ENGLISH });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "cue")).toBe("First cue"));
      expect(text(container, "track")).toBe("English");
    });

    it("follows currentTime across cues", async () => {
      // Driven by the shell's existing clock rather than a `timeupdate` of its
      // own, which would lag a seek by up to a quarter second.
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(SRT);
      const { container, rerender } = renderHook({
        imdbId: "tt1",
        currentTime: 1.5,
        pick: ENGLISH,
      });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "cue")).toBe("First cue"));
      rerender(
        <Probe imdbId="tt1" currentTime={5.5} pick={ENGLISH} />,
      );
      await waitFor(() => expect(text(container, "cue")).toBe("Second cue"));
    });

    it("shows nothing between cues", async () => {
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(SRT);
      const { container, rerender } = renderHook({
        imdbId: "tt1",
        currentTime: 1.5,
        pick: ENGLISH,
      });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "cue")).toBe("First cue"));
      rerender(<Probe imdbId="tt1" currentTime={4} pick={ENGLISH} />);
      await waitFor(() => expect(text(container, "cue")).toBe(""));
    });

    it("falls back to VTT when the body is not SRT", async () => {
      const VTT = ["WEBVTT", "", "00:00:01.000 --> 00:00:03.000", "VTT cue"].join("\n");
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(VTT);
      const { container } = renderHook({ imdbId: "tt1", currentTime: 1.5, pick: ENGLISH });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "cue")).toBe("VTT cue"));
    });
  });

  describe("failure is never silent", () => {
    it("keeps a visible reason when the download fails", async () => {
      // `note()` is a no-op stub, so without `error` a refused download flips the
      // pick back to Off with nothing on screen at all.
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(null);
      const { container } = renderHook({ imdbId: "tt1", pick: ENGLISH });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "error")).not.toBe(""));
      expect(text(container, "track")).toBe("");
    });

    it("does not leave the track marked enabled with nothing to render", async () => {
      // The picker showing a language that never produces text is the specific
      // state this prevents.
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue("not a caption file at all");
      const { container } = renderHook({ imdbId: "tt1", pick: ENGLISH });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "error")).not.toBe(""));
      expect(text(container, "track")).toBe("");
      expect(text(container, "loading")).toBe("false");
    });

    it("survives a download that throws", async () => {
      SubtitleFetcher.downloadAndDecompress.mockRejectedValue(new Error("CORS"));
      const { container } = renderHook({ imdbId: "tt1", pick: ENGLISH });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "error")).not.toBe(""));
      expect(text(container, "loading")).toBe("false");
    });

    it("clears loading whatever happens", async () => {
      SubtitleFetcher.downloadAndDecompress.mockRejectedValue(new Error("x"));
      const { container } = renderHook({ imdbId: "tt1", pick: ENGLISH });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "loading")).toBe("false"));
    });
  });

  describe("Off is not merely hidden", () => {
    it("clears the cue so a later seek cannot resurrect it", async () => {
      // If "Off" only set `visible=false` the cues would still be loaded, and
      // seeking back into the same range would render a line from a track the
      // viewer turned off.
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(SRT);
      const { container, rerender } = renderHook({
        imdbId: "tt1",
        currentTime: 1.5,
        pick: ENGLISH,
      });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "cue")).toBe("First cue"));

      rerender(<Probe imdbId="tt1" currentTime={1.5} pick={null} />);
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "cue")).toBe(""));

      rerender(<Probe imdbId="tt1" currentTime={1.5} pick={null} />);
      expect(text(container, "cue")).toBe("");
    });

    it("clears a previous error", async () => {
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(null);
      const { container, rerender } = renderHook({ imdbId: "tt1", pick: ENGLISH });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "error")).not.toBe(""));

      rerender(<Probe imdbId="tt1" pick={null} />);
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "error")).toBe(""));
    });
  });

  describe("a superseded pick cannot clear or report against the current one", () => {
    it("ignores a slow earlier download that lands after a newer pick", async () => {
      // The token check. Without it, the slow Tamil download finishes after the
      // fast English one and overwrites it — and a failure from the OLD pick
      // reports itself against the current one.
      const deferred = [];
      SubtitleFetcher.downloadAndDecompress.mockImplementation(
        () => new Promise((resolve) => deferred.push(resolve)),
      );
      const { container, rerender } = renderHook({
        imdbId: "tt1",
        currentTime: 1.5,
        pick: TAMIL,
      });
      await act(async () => { container.querySelector("button").click(); });

      rerender(<Probe imdbId="tt1" currentTime={1.5} pick={ENGLISH} />);
      await act(async () => { container.querySelector("button").click(); });
      expect(deferred).toHaveLength(2);

      await act(async () => { deferred[1](SRT); });
      await waitFor(() => expect(text(container, "track")).toBe("English"));

      // The abandoned first pick resolves now. It must change nothing.
      await act(async () => { deferred[0](SRT); });
      expect(text(container, "track")).toBe("English");
      expect(text(container, "cue")).toBe("First cue");
    });

    it("does not let an abandoned failure report against the live pick", async () => {
      const deferred = [];
      SubtitleFetcher.downloadAndDecompress.mockImplementation(
        () => new Promise((resolve) => deferred.push(resolve)),
      );
      const { container, rerender } = renderHook({ imdbId: "tt1", pick: TAMIL });
      await act(async () => { container.querySelector("button").click(); });
      rerender(<Probe imdbId="tt1" pick={ENGLISH} />);
      await act(async () => { container.querySelector("button").click(); });

      await act(async () => { deferred[0](null); });
      expect(text(container, "error")).toBe("");
    });
  });

  describe("a title change drops everything", () => {
    it("does not carry the previous title's last cue onto the new one", async () => {
      // Without this, closing one title and opening the next shows the previous
      // title's final line over the new video until its own cues load.
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(SRT);
      const { container, rerender } = renderHook({
        imdbId: "tt1",
        title: "A",
        currentTime: 1.5,
        pick: ENGLISH,
      });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "cue")).toBe("First cue"));

      rerender(<Probe imdbId="tt2" title="B" currentTime={1.5} pick={ENGLISH} />);
      await waitFor(() => expect(text(container, "cue")).toBe(""));
      expect(text(container, "track")).toBe("");
    });
  });

  describe("5.12 auto-subtitle restore", () => {
    const PREFS = { autoSubtitles: true, defaultLanguage: "en" };
    const withPrefs = (props = {}, prefs = {}) =>
      render(
        <PreferencesContext.Provider value={{ ...PREFS, ...prefs }}>
          <Probe {...props} />
        </PreferencesContext.Provider>,
      );
    const rerenderWithPrefs = (utils, props = {}, prefs = {}) =>
      utils.rerender(
        <PreferencesContext.Provider value={{ ...PREFS, ...prefs }}>
          <Probe {...props} />
        </PreferencesContext.Provider>,
      );

    it("auto-selects the preferred language when the list arrives", async () => {
      SubtitleFetcher.searchAvailableSubtitles.mockResolvedValue([SPANISH, ENGLISH]);
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(SRT);
      const { container } = withPrefs({ imdbId: "tt1", currentTime: 1.5, pick: null });
      await waitFor(() => expect(text(container, "track")).toBe("English"));
      // The cue is resolved by a SEPARATE effect keyed on the selected track, so
      // it can land a render after the track label. Waiting on the label and then
      // reading the cue bare is a race that passes only when the load happens to
      // resolve within the same flush — seen failing under a loaded full run.
      await waitFor(() => expect(text(container, "cue")).toBe("First cue"));
    });

    it("honours defaultLanguage over the list order", async () => {
      SubtitleFetcher.searchAvailableSubtitles.mockResolvedValue([ENGLISH, SPANISH]);
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(SRT);
      const { container } = withPrefs(
        { imdbId: "tt1", currentTime: 1.5, pick: null },
        { defaultLanguage: "es" },
      );
      await waitFor(() => expect(text(container, "track")).toBe("Spanish"));
    });

    it("does nothing when autoSubtitles is off", async () => {
      SubtitleFetcher.searchAvailableSubtitles.mockResolvedValue([ENGLISH]);
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(SRT);
      const { container } = withPrefs(
        { imdbId: "tt1", pick: null },
        { autoSubtitles: false },
      );
      await waitFor(() => expect(text(container, "langs")).toBe("English"));
      expect(text(container, "track")).toBe("");
      expect(SubtitleFetcher.downloadAndDecompress).not.toHaveBeenCalled();
    });

    it("leaves subtitles off when the preferred language is absent", async () => {
      /* Not approximated to the first available track: a viewer who chose German
       * should not silently get Spanish. */
      SubtitleFetcher.searchAvailableSubtitles.mockResolvedValue([ENGLISH, SPANISH]);
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(SRT);
      const { container } = withPrefs(
        { imdbId: "tt1", pick: null },
        { defaultLanguage: "de" },
      );
      await waitFor(() => expect(text(container, "langs")).toBe("English,Spanish"));
      expect(text(container, "track")).toBe("");
      expect(SubtitleFetcher.downloadAndDecompress).not.toHaveBeenCalled();
    });

    it("does not fight a viewer who turns the restored track off", async () => {
      SubtitleFetcher.searchAvailableSubtitles.mockResolvedValue([ENGLISH]);
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(SRT);
      const utils = withPrefs({ imdbId: "tt1", currentTime: 1.5, pick: null });
      const { container } = utils;
      await waitFor(() => expect(text(container, "track")).toBe("English"));

      rerenderWithPrefs(utils, { imdbId: "tt1", currentTime: 1.5, pick: null });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "track")).toBe(""));

      /* A later render — a seek, say — must not run the preference again and
       * snap the track back on. */
      rerenderWithPrefs(utils, { imdbId: "tt1", currentTime: 5.5, pick: null });
      expect(text(container, "track")).toBe("");
    });

    it("restores again for a new title", async () => {
      SubtitleFetcher.searchAvailableSubtitles.mockResolvedValue([ENGLISH]);
      SubtitleFetcher.downloadAndDecompress.mockResolvedValue(SRT);
      const utils = withPrefs({ imdbId: "tt1", title: "A", pick: null });
      const { container } = utils;
      await waitFor(() => expect(text(container, "track")).toBe("English"));

      /* Turn it off on title A… */
      rerenderWithPrefs(utils, { imdbId: "tt1", title: "A", pick: null });
      await act(async () => { container.querySelector("button").click(); });
      await waitFor(() => expect(text(container, "track")).toBe(""));

      /* …then open title B: B's own list must restore the preference. */
      rerenderWithPrefs(utils, { imdbId: "tt2", title: "B", pick: null });
      await waitFor(() => expect(text(container, "track")).toBe("English"));
    });
  });
});