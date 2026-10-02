import { render, screen, act } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

/* R4.7 — PROBE. This file is expected to FAIL against the current code.
 *
 * The defect was read out of effect ordering and had no test behind it:
 * `useHlsSource.js:142` (the mirror that publishes `hlsRef.current` to the
 * caller's `engineRef`) is declared BEFORE the creation effect at `:150`. React
 * runs destroys then creates in declaration order, so both on mount and on every
 * `url` change the mirror copies a `hlsRef.current` that is still null — the
 * creation effect sets it afterwards. `useAudioTracks` reads `engineRef?.current`
 * DURING RENDER (`useAudioTracks.js:103`) and uses that same read as its effect
 * dependency (`:101`), so a value published in an effect is invisible to it.
 *
 * The panel therefore binds to nothing and stays on "no engine" until something
 * unrelated re-renders the shell. This harness reproduces only the composition
 * that matters — a ref handed to `useHlsSource`, the same ref handed to
 * `useAudioTracks`, and the element held as STATE exactly as `PlayerShell` does
 * — so the failure below is the wiring's, not a harness artefact.
 */

vi.mock("hls.js", () => {
  class FakeHls {
    static Events = {
      ERROR: "hlsError",
      AUDIO_TRACKS_UPDATED: "hlsAudioTracksUpdated",
      AUDIO_TRACK_SWITCHED: "hlsAudioTrackSwitched",
    };
    static isSupported() {
      return true;
    }
    constructor() {
      this.audioTracks = [
        { id: 0, name: "English", lang: "en", default: true },
        { id: 1, name: "Tamil", lang: "ta", default: false },
      ];
      this.audioTrack = 0;
      this.listeners = new Map();
      this.destroyed = false;
      this.loadedUrl = null;
    }
    on(event, fn) {
      const list = this.listeners.get(event) ?? [];
      list.push(fn);
      this.listeners.set(event, list);
    }
    off(event, fn) {
      this.listeners.set(event, (this.listeners.get(event) ?? []).filter((f) => f !== fn));
    }
    loadSource(url) {
      this.loadedUrl = url;
    }
    attachMedia() {}
    destroy() {
      this.destroyed = true;
    }
    /** How many listeners are attached right now — the leak check. */
    count() {
      let total = 0;
      for (const list of this.listeners.values()) total += list.length;
      return total;
    }
  }
  return { default: FakeHls };
});

const { default: useHlsSource } = await import("../components/player/v2/hooks/useHlsSource");
const { default: useAudioTracks } = await import("../components/player/v2/hooks/useAudioTracks");

const URL_A = "https://cdn.test/first.m3u8";
const URL_B = "https://cdn.test/second.m3u8";

/** Mirrors PlayerShell.jsx:160-161 and its `node`-as-state element (:129-158). */
function Harness({ url }) {
  const [node, setNode] = useState(null);
  const [engine, setEngine] = useState(null);
  useHlsSource({ node, url, onEngine: setEngine });
  const { audio } = useAudioTracks(engine);

  return (
    <>
      <video data-testid="el" ref={setNode} />
      <output data-testid="kind">{audio.kind}</output>
      <output data-testid="count">{String(audio.tracks.length)}</output>
      <output data-testid="tracks">{audio.tracks.map((t) => t.label).join(",")}</output>
    </>
  );
}

describe("R4.7 probe — the panel must bind to the live engine", () => {
  it("binds on the FIRST mount, not only after an unrelated re-render", () => {
    render(<Harness url={URL_A} />);

    // The engine exists by now: `useHlsSource` created it in its creation effect.
    // The question is whether the panel can SEE it, which it can only do if the
    // mirror published it before the panel rendered. With the engine bound this
    // is `tracks` and two rows; with the bug it is `single` and zero rows,
    // because `engineRef.current` was still null during render.
    expect(screen.getByTestId("kind").textContent).toBe("tracks");
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getByTestId("tracks").textContent).toBe("English,Tamil");
  });

  it("re-binds to the NEW engine when the url changes", () => {
    const { rerender } = render(<Harness url={URL_A} />);
    expect(screen.getByTestId("kind").textContent).toBe("tracks");

    rerender(<Harness url={URL_B} />);

    // `key={url}` on PlayerVideo remounts the child, so the shell itself never
    // re-renders and nothing re-runs the mirror. The panel must still be on the
    // engine that is loading URL_B — not bound to the destroyed one.
    expect(screen.getByTestId("kind").textContent).toBe("tracks");
    expect(screen.getByTestId("count").textContent).toBe("2");
  });
});