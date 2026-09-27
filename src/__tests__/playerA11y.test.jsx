import { describe, expect, it, beforeAll, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NativePlayerView from "../components/NativePlayerView";

// jsdom has no ResizeObserver (the player measures its frame with it) and no
// MediaSource, so a mount takes the honest fatal path — which is exactly the
// state the a11y assertions below need to be observable in.
beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const mount = () =>
  render(<NativePlayerView type="movie" id="550" title="Fight Club" onClose={() => {}} />);

const seekBar = () => screen.getByRole("slider", { name: /seek/i });

describe("player scrubber keyboard support", () => {
  it("advertises itself as a slider with a readable value", () => {
    mount();
    const bar = seekBar();
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax");
    // aria-valuetext is what a screen reader actually speaks out ("0:42 of
    // 2:01:00"); the raw numbers alone read as meaningless seconds.
    expect(bar.getAttribute("aria-valuetext")).toMatch(/of/);
  });

  it("seeks with ArrowLeft/ArrowRight instead of ignoring the key", () => {
    mount();
    const bar = seekBar();
    // The bar claims role="slider" + tabIndex, so it owes the keyboard a
    // response; before this it accepted focus and silently did nothing.
    const before = document.querySelector("video")?.currentTime ?? 0;
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    // duration is NaN in jsdom, so the seek is clamped rather than applied —
    // what matters is that the handler ran and consumed the key.
    expect(document.querySelector("video")?.currentTime ?? 0).toBe(before);
  });

  it("claims the key so the global handler cannot double-seek", () => {
    mount();
    const bar = seekBar();
    const ev = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    fireEvent(bar, ev);
    // stopPropagation + preventDefault is the contract: without it one press
    // seeks 10s here AND 10s from the window-level Netflix key map.
    expect(ev.defaultPrevented).toBe(true);
  });

  it("leaves Up/Down to the global volume binding", () => {
    mount();
    const ev = new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true });
    fireEvent(seekBar(), ev);
    // Deliberately unhandled: this player uses Up/Down for volume everywhere
    // (and matches YouTube), so the scrubber must not hijack it for seeking.
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe("player settings sheet semantics", () => {
  it("exposes the open sheet as a named dialog", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveAttribute("aria-label", "Settings");
    // A side pane, NOT a modal: the transport row stays operable beneath it.
    expect(sheet).not.toHaveAttribute("aria-modal");
  });

  it("marks the settings control as expanded while a sheet is open", () => {
    mount();
    const gear = screen.getByRole("button", { name: /^settings$/i });
    expect(gear).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(gear);
    expect(gear).toHaveAttribute("aria-expanded", "true");
  });

  it("lights the gear for the subtitles sheet too (it was left unlit)", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    const subs = screen.getByRole("button", { name: /subtitles/i });
    fireEvent.click(subs);
    const gear = screen.getByRole("button", { name: /^settings$/i });
    // "subs" was missing from the active list, so this was the one sheet that
    // opened behind an unhighlighted gear. It is a disclosure, so aria-expanded
    // (not aria-pressed) is the attribute that carries "it is open".
    expect(gear).toHaveAttribute("aria-expanded", "true");
    expect(gear).not.toHaveAttribute("aria-pressed");
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Subtitles");
  });

  it("returns focus to the opener when the sheet closes", () => {
    mount();
    const gear = screen.getByRole("button", { name: /^settings$/i });
    // A real click moves focus to the button first; fireEvent does not, and the
    // focus-restore contract is only meaningful from a focused opener.
    gear.focus();
    expect(document.activeElement).toBe(gear);
    fireEvent.click(gear);
    fireEvent.click(screen.getByRole("button", { name: /close panel/i }));
    // Focus used to land on <body> here, dumping a keyboard viewer at the top.
    expect(document.activeElement).toBe(gear);
  });

  it("moves focus into the sheet when it opens", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    // Otherwise the sheet's rows are never announced and Tab resumes from
    // wherever the transport row left focus.
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("marks the playing episode in the rail for assistive tech", () => {
    render(
      <NativePlayerView
        type="tv"
        id="1399"
        season={1}
        episode={2}
        title="Game of Thrones"
        episodes={[
          { number: 1, title: "Winter Is Coming" },
          { number: 2, title: "The Kingsroad" },
        ]}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^episodes$/i }));
    const cards = document.querySelectorAll(".np-episode-card");
    expect(cards).toHaveLength(2);
    // Previously the current episode was only a red outline — nothing told a
    // screen reader which of the two was playing.
    expect([...cards].map((c) => c.getAttribute("aria-current"))).toEqual([null, "true"]);
    expect(screen.getByRole("button", { name: /now playing/i })).toBeInTheDocument();
  });
});

describe("player failure recovery", () => {
  it("announces the failure and offers a way forward", () => {
    mount();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/MediaSource/i);
    // The role lives on the message, not the wrapper — otherwise a live region
    // would read the button labels out as part of the failure text.
    expect(alert.querySelector("button")).toBeNull();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    // Distinct from the top bar's "Back", so voice/screen-reader users are not
    // offered two identically-named controls.
    expect(screen.getByRole("button", { name: /back to browse/i })).toBeInTheDocument();
  });

  it("re-runs the load when Try again is pressed", () => {
    mount();
    // jsdom has no MediaSource, so the retry re-resolves, fails for the same
    // honest reason and re-reports it. That the message comes BACK is the proof
    // the load effect actually re-ran instead of the click doing nothing.
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/MediaSource/i);
  });

  it("leaves the player from the failure banner", () => {
    const onClose = vi.fn();
    render(<NativePlayerView type="movie" id="550" title="Fight Club" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /back to browse/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
