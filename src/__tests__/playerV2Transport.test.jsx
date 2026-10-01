import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TransportBar from "../components/player/v2/TransportBar";
import Scrubber from "../components/player/v2/Scrubber";
import { formatTimecode, progressFraction } from "../components/player/v2/timecode";
import { DEFAULT_TIER, TIER_A_CONTROLS, SHEET_OPENERS, isSheetOpener } from "../components/player/v2/tiers";

/* PLAYER V2 Tier A transport (task.md 3.7).
 *
 * The interesting assertions here are the ones about what the transport PROMISES
 * — order, accessible names, the slider key model — because those are the claims
 * a screen reader makes out loud and a viewer relies on by muscle memory. They
 * are cheap to assert now and invisible to review later.
 */

describe("formatTimecode", () => {
  it("formats minutes and seconds", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(5)).toBe("0:05");
    expect(formatTimecode(65)).toBe("1:05");
    expect(formatTimecode(599)).toBe("9:59");
  });

  it("adds an hours field only when it is needed", () => {
    // 61:00 is wrong the moment a title runs past an hour, and the mistake is
    // invisible on every short title anyone tests with.
    expect(formatTimecode(3599)).toBe("59:59");
    expect(formatTimecode(3600)).toBe("1:00:00");
    expect(formatTimecode(3661)).toBe("1:01:01");
    expect(formatTimecode(36000)).toBe("10:00:00");
  });

  it("floors rather than rounds", () => {
    // A clock that rounds up shows 4:00 at 3:59.8 and disagrees with the video.
    expect(formatTimecode(359.9)).toBe("5:59");
  });

  it("clamps every impossible value to zero", () => {
    // These are the states the transport renders DURING loading, so they are not
    // hypothetical: `duration` is NaN until metadata arrives.
    [NaN, Infinity, -Infinity, -5, undefined, null, "abc", {}].forEach((bad) => {
      expect(formatTimecode(bad), `input: ${String(bad)}`).toBe("0:00");
    });
  });
});

describe("progressFraction", () => {
  it("returns a usable fraction", () => {
    expect(progressFraction(0, 100)).toBe(0);
    expect(progressFraction(50, 100)).toBe(0.5);
    expect(progressFraction(100, 100)).toBe(1);
  });

  it("never returns NaN or an out-of-range value", () => {
    // A fill of NaN% collapses to nothing, which looks identical to a player
    // stuck at zero — and the duration is unknown for the whole load window.
    expect(progressFraction(10, NaN)).toBe(0);
    expect(progressFraction(10, 0)).toBe(0);
    expect(progressFraction(NaN, 100)).toBe(0);
    expect(progressFraction(500, 100)).toBe(1);
    expect(progressFraction(-5, 100)).toBe(0);
  });
});

describe("the Tier A control spine", () => {
  it("is exactly the documented order", () => {
    expect(TIER_A_CONTROLS).toEqual([
      "play",
      "timecode",
      "scrubber",
      "volume",
      "captions",
      "settings",
      "fullscreen",
    ]);
  });

  it("is frozen, so a component cannot reorder it in place", () => {
    expect(Object.isFrozen(TIER_A_CONTROLS)).toBe(true);
  });

  it("makes A the default tier", () => {
    expect(DEFAULT_TIER).toBe("A");
  });

  it("identifies the sheet openers and nothing else", () => {
    // Tier A contributes two of these (task.md 3.7); 3.9 adds the four Tier B
    // openers. The set is shared because it is a property of the CONTROLS, not of
    // the tier they appear in — `episodes` is a sheet opener whether or not it is
    // currently rendered.
// 3.12 appends `volume`. The order is the list's history: Tier A's two, then
    // 3.9's four, then the volume sheet entry. R4.1 appends `audio` last rather than
    // beside `captions`, so the history stays readable and this exact-match
    // assertion keeps catching a control that was reordered by accident.
    expect(SHEET_OPENERS).toEqual([
      "captions",
      "settings",
      "speed",
      "episodes",
      "users",
      "server",
      "volume",
      "audio",
    ]);
    TIER_A_CONTROLS.forEach((id) => {
      // `volume` is the 3.12 exception: a mute toggle at desktop, the sheet entry
      // in zones mode. Its opener status is a property of the CONTROL, so it is
      // derived here even though row mode still renders it as a toggle.
      const expected = id === "captions" || id === "settings" || id === "volume";
      expect(isSheetOpener(id), id).toBe(expected);
    });
  });

  it("keeps Tier A's own openers a subset of the whole set", () => {
    // Guards the assertion above from being satisfied by a list that dropped
    // captions or settings while gaining the new ones.
    ["captions", "settings"].forEach((id) => expect(SHEET_OPENERS).toContain(id));
    // Play, scrubber and fullscreen are immediate actions at both tiers.
    TIER_A_CONTROLS.forEach((id) => {
      if (["captions", "settings", "volume"].includes(id)) return;
      expect(isSheetOpener(id), id).toBe(false);
    });
  });
});

/** Reads the rendered transport's control order back out of the DOM.
 *  Deliberately derived from what is RENDERED, so it fails if an id in the
 *  spine has no case in the renderer — a control silently dropped would leave
 *  both the spine and a naive "does it contain Play" test green. */
function renderedOrder(container) {
  const bar = container.querySelector(".pv2-transport");
  return Array.from(bar.children)
    /* Skip the controls that belong to the other tier. Since 3.10 the transport
     * always renders the full superset and marks the rest `data-presence="absent"`,
     * so a Tier A row's CHILDREN include the Tier B controls. Reading them here
     * would make this ordering assertion describe neither tier correctly. */
    .filter((child) => child.getAttribute("data-presence") !== "absent")
    .map((child) => {
      if (child.classList.contains("pv2-scrubber")) return "scrubber";
      if (child.classList.contains("pv2-timecode")) return "timecode";
      const label = child.getAttribute("aria-label") || "";
      if (label === "Pause" || label === "Play") return "play";
      if (label === "Mute" || label === "Unmute") return "volume";
      if (label === "Subtitles") return "captions";
      if (label === "Settings") return "settings";
      if (label.toLowerCase().includes("fullscreen")) return "fullscreen";
      return `unknown:${label || child.className}`;
    });
}

describe("TransportBar renders Tier A in order", () => {
  it("matches the spine exactly", () => {
    const { container } = render(<TransportBar />);
    expect(renderedOrder(container)).toEqual(TIER_A_CONTROLS);
  });

  it("names the play button for the ACTION it will perform", () => {
    // The most common transport a11y bug: a button labelled "Play" while the
    // video is paused, so the label describes the state instead of the press.
    const { rerender } = render(<TransportBar isPlaying={false} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();

    rerender(<TransportBar isPlaying isPaused={false} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

    // Playing AND paused at once must read as "Play" — the paused fact wins,
    // because that is the one the viewer can act on.
    rerender(<TransportBar isPlaying isPaused />);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("names the volume button by result, not by its current icon", () => {
    const { rerender } = render(<TransportBar muted={false} />);
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy();
    rerender(<TransportBar muted />);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy();
  });

  it("hides every icon from assistive tech", () => {
    // An icon plus an aria-label reads the name TWICE. lucide renders an svg
    // with its own title/role, so this has to be asserted, not assumed.
    const { container } = render(<TransportBar />);
    const svgs = container.querySelectorAll(".pv2-icon-btn svg");
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => {
      expect(svg.closest("[aria-hidden='true']")).toBeTruthy();
    });
  });

  it("marks only the sheet openers with aria-haspopup", () => {
    render(<TransportBar />);
    expect(screen.getByRole("button", { name: "Subtitles" }).getAttribute("aria-haspopup")).toBe(
      "dialog",
    );
    expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-haspopup")).toBe(
      "dialog",
    );
    // An immediate action must not claim to open a dialog that never appears.
    ["Play", "Mute", "Fullscreen"].forEach((name) => {
      expect(screen.getByRole("button", { name }).getAttribute("aria-haspopup")).toBeNull();
    });
  });

  it("reports which panel a sheet opener asked for", () => {
    const onOpenSheet = vi.fn();
    render(<TransportBar onOpenSheet={onOpenSheet} />);
    fireEvent.click(screen.getByRole("button", { name: "Subtitles" }));
    expect(onOpenSheet).toHaveBeenCalledWith("captions");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSheet).toHaveBeenCalledWith("settings");
  });

  it("explains an unavailable fullscreen rather than hiding it", () => {
    // A vanishing control is undiscoverable and shifts the row. A visible,
    // disabled control with a reason teaches the viewer what it was.
    render(<TransportBar canFullscreen={false} />);
    const button = screen.getByRole("button", { name: "Fullscreen" });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toMatch(/not available/i);

    const { unmount } = render(<TransportBar canFullscreen />);
    unmount();
  });

  it("flips the fullscreen label with the actual state", () => {
    render(<TransportBar canFullscreen fullscreen />);
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeTruthy();
  });
});

describe("Scrubber keeps the keyboard promise role=slider makes", () => {
  const setup = (props = {}) => {
    const onSeek = vi.fn();
    render(
      <Scrubber currentTime={100} duration={200} onSeek={onSeek} {...props} />,
    );
    return { onSeek, slider: screen.getByRole("slider") };
  };

  it("exposes a numeric range, never NaN", () => {
    const { slider } = setup();
    expect(slider.getAttribute("aria-valuemin")).toBe("0");
    expect(slider.getAttribute("aria-valuemax")).toBe("200");
    expect(slider.getAttribute("aria-valuenow")).toBe("100");
    expect(slider.getAttribute("aria-valuetext")).toBe("1:40 of 3:20");
  });

  it("reports a zero range while the duration is unknown", () => {
    // Not a disabled control: hard-disabling during the load window would drop
    // it out of the tab order exactly when a viewer reaches for it.
    const { slider } = setup({ duration: NaN });
    expect(slider.getAttribute("aria-valuemax")).toBe("0");
    expect(slider.getAttribute("aria-valuetext")).toBe("1:40 of 0:00");
    expect(slider.getAttribute("aria-disabled")).toBeNull();
    expect(slider.tabIndex).toBe(0);
  });

  it("steps, pages and jumps to the ends", () => {
    const { onSeek, slider } = setup();
    const press = (key) => fireEvent.keyDown(slider, { key });

    press("ArrowRight");
    expect(onSeek).toHaveBeenLastCalledWith(105);
    press("ArrowLeft");
    expect(onSeek).toHaveBeenLastCalledWith(95);
    press("PageUp");
    expect(onSeek).toHaveBeenLastCalledWith(130);
    press("PageDown");
    expect(onSeek).toHaveBeenLastCalledWith(70);
    press("Home");
    expect(onSeek).toHaveBeenLastCalledWith(0);
    press("End");
    expect(onSeek).toHaveBeenLastCalledWith(200);
  });

  it("clamps every seek into the media range", () => {
    const { onSeek, slider } = setup({ currentTime: 5 });
    fireEvent.keyDown(slider, { key: "Home" });
    expect(onSeek).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(onSeek).toHaveBeenLastCalledWith(0);
  });

  it("claims only the keys it owns", () => {
    // Space and Enter must fall through, or a viewer using the arrow keys to
    // move the playhead toggles playback on every press.
    const { onSeek, slider } = setup();
    const space = fireEvent.keyDown(slider, { key: " " });
    expect(onSeek).not.toHaveBeenCalled();
    expect(space).toBe(true); // not defaultPrevented

    const arrow = fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onSeek).toHaveBeenCalled();
    expect(arrow).toBe(false); // defaultPrevented
  });

  it("ignores the right mouse button", () => {
    // Without this the context menu doubles as a scrubber control.
    const { onSeek, slider } = setup();
    fireEvent.pointerDown(slider, { button: 2, clientX: 150 });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("maps a pointer position against the TRACK, not the window", () => {
    const onSeek = vi.fn();
    render(<Scrubber currentTime={0} duration={100} onSeek={onSeek} />);
    const slider = screen.getByRole("slider");
    slider.getBoundingClientRect = () => ({ left: 20, width: 200, top: 0, height: 10 });

    fireEvent.pointerDown(slider, { button: 0, clientX: 120 });
    expect(onSeek).toHaveBeenLastCalledWith(50);
  });

  it("refuses to seek while disabled", () => {
    const { onSeek, slider } = setup({ disabled: true });
    expect(slider.tabIndex).toBe(-1);
    expect(slider.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.pointerDown(slider, { button: 0, clientX: 150 });
    expect(onSeek).not.toHaveBeenCalled();
  });
});

describe("TransportBar passes the scrubber through", () => {
  it("forwards time and seek without swallowing them", () => {
    const onSeek = vi.fn();
    render(<TransportBar currentTime={30} duration={90} onSeek={onSeek} />);
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-valuenow")).toBe("30");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onSeek).toHaveBeenCalledWith(35);

    // And the timecode shows the same numbers the slider does.
    const bar = document.querySelector(".pv2-transport__time");
    expect(bar.textContent).toContain("0:30");
    expect(bar.textContent).toContain("1:30");
  });
});
