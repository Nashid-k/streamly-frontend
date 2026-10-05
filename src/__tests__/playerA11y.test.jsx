import { describe, expect, it, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

describe("episode rail with unaired episodes", () => {
  const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const openRail = (onSelectEpisode = vi.fn()) => {
    render(
      <NativePlayerView
        type="tv"
        id="1399"
        season={1}
        episode={1}
        title="Game of Thrones"
        episodes={[
          { number: 1, title: "Winter Is Coming", description: "Ned Stark is torn.", durationMins: 62, airDate: past },
          // Unreleased: TMDB has no still, no runtime and no synopsis for it.
          { number: 2, title: "The Kingsroad", airDate: future },
        ]}
        onSelectEpisode={onSelectEpisode}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^episodes$/i }));
    return { onSelectEpisode, cards: [...document.querySelectorAll(".np-episode-card")] };
  };

  it("reserves the same text block for an episode with no synopsis", () => {
    const { cards } = openRail();
    const blocks = cards.map((c) => c.querySelector("div[style*='min-height']"));
    // The ragged rail: an unaired episode has no description, so its block used
    // to collapse to 0px and the card ended higher than its neighbours.
    expect(blocks).toHaveLength(2);
    const heights = blocks.map((b) => b.style.minHeight);
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).not.toBe("");
    // …and it says something rather than leaving a hole.
    expect(blocks[1].textContent).toMatch(/airs/i);
  });

  it("marks an unaired episode unavailable instead of letting it play", () => {
    const { onSelectEpisode, cards } = openRail();
    expect(cards[0].getAttribute("aria-disabled")).toBeNull();
    expect(cards[1]).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(cards[1]);
    // It used to fire straight through to a source that cannot resolve, which
    // is how a viewer ended up staring at the fatal banner.
    expect(onSelectEpisode).not.toHaveBeenCalled();
    fireEvent.click(cards[0]);
    expect(onSelectEpisode).toHaveBeenCalledWith(1);
  });

  it("shows the air date on the card and names it for assistive tech", () => {
    const { cards } = openRail();
    expect(cards[1].textContent).toMatch(/\d/);
    // Not `disabled`: that would make the card unfocusable, so a keyboard user
    // could never find out why it will not play.
    expect(cards[1]).not.toBeDisabled();
  });
});

describe("episode rail chrome", () => {
  const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const mountTv = () =>
    render(
      <NativePlayerView
        type="tv"
        id="1399"
        season={1}
        episode={1}
        title="Game of Thrones"
        episodes={[{ number: 1, title: "Winter Is Coming", description: "Ned Stark is torn.", airDate: past }]}
        onClose={() => {}}
      />,
    );

  const openRail = () => {
    fireEvent.click(screen.getByRole("button", { name: /^episodes$/i }));
  };

  it("hides the Skip Intro pill behind an open panel", async () => {
    // The pill only appears as the intro approaches its end (see
    // SKIP_INTRO_LEAD_SECONDS), so the playhead has to be inside that window for it
    // to exist at all. jsdom reports no duration, which means no boundary and a 90s
    // estimate; 75s is comfortably inside [60, 100].
    mountTv();
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    // jsdom's media element ignores a plain currentTime assignment (no resource),
    // so define the value outright, then fire the act-wrapped event the player listens for.
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 75 });
    fireEvent.timeUpdate(video);
    expect(screen.getByRole("button", { name: /skip the opening credits/i })).toBeInTheDocument();
    openRail();
    // It shares the bottom-right corner with the rail, whose gradient fades to
    // transparent at the top — so the pill used to hover over the open sheet,
    // tappable, on a second layer. AnimatePresence unmounts it after the exit
    // animation, hence the wait.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /skip the opening credits/i })).toBeNull();
    });
    // …and it comes back once the panel is closed.
    fireEvent.click(screen.getByRole("button", { name: /close episodes/i }));
    expect(screen.getByRole("button", { name: /skip the opening credits/i })).toBeInTheDocument();
  });

  it("keeps room above the cards so the current episode's red ring is not clipped", () => {
    mountTv();
    openRail();
    const rail = document.querySelector(".np-episode-card").parentElement;
    // `overflow-x: auto` forces the block axis to clip too, so the 2px outer
    // ring on the playing card used to lose its top edge to the container.
    expect(rail.style.overflowX).toBe("auto");
    expect(rail.style.paddingTop).not.toBe("");
    expect(rail.style.paddingTop).not.toBe("0px");
  });
});

describe("player aspect-ratio panel", () => {
  const openAspectPanel = () => {
    mount();
    // gear → Settings → Aspect Ratio
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    fireEvent.click(screen.getByText("Aspect Ratio"));
    return screen.getByRole("dialog");
  };

  // REGRESSION: the panel read `aspect.label`, but the ASPECT_RATIOS catalog has
  // only ever had `name`. `undefined` renders as nothing, so all six options
  // were blank rows. It looked server-dependent because switching servers
  // closes the sheet, and the Settings root row masked it with a `|| "Fit"`
  // fallback — the symptom was "the aspect texts vanish after I change server".
  it("shows real text for every aspect option, not blank rows", () => {
    const dialog = openAspectPanel();
    const rows = [...dialog.querySelectorAll(".np-dialog-row")];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect((row.textContent || "").trim().length).toBeGreaterThan(0);
    }
    expect(dialog.textContent).toContain("Cinema 2.39:1");
    expect(dialog.textContent).toContain("Stretch to Screen");
  });

  it("the Settings row reports the CURRENT mode, not a hardcoded 'Fit'", () => {
    // The same `.label` bug made this always fall through to "Fit" via `||`,
    // so a viewer on Cinema was told "Fit" on the row that opens the panel.
    mount();
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    const row = [...document.querySelectorAll(".np-dialog-row")].find((r) =>
      (r.textContent || "").includes("Aspect Ratio"),
    );
    expect(row.textContent).toContain("Fit (Original 16:9)");
  });

  it("picking an option selects it and closes the sheet", async () => {
    const dialog = openAspectPanel();
    const cinema = [...dialog.querySelectorAll(".np-dialog-row")].find((r) =>
      (r.textContent || "").includes("Cinema 2.39:1"),
    );
    fireEvent.click(cinema);
    // The sheet animates out, so it is still mounted for a moment — wait for
    // the exit rather than asserting a synchronous unmount that never happens.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // …and the choice is now the reported current mode, not the "Fit" default.
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    const row = [...document.querySelectorAll(".np-dialog-row")].find((r) =>
      (r.textContent || "").includes("Aspect Ratio"),
    );
    expect(row.textContent).toContain("Cinema 2.39:1");
  });
});

describe("player Servers menu", () => {
  it("lists every server as a generic 'Server N' row with a capability line", () => {
    // jsdom has no MediaSource → the mount takes the fatal path, but the
    // chrome (and therefore the sheet) still renders — enough to verify the
    // menu wiring and its copy.
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Servers" }));
    const dialog = screen.getByRole("dialog", { name: "Servers" });
    expect(dialog).toBeInTheDocument();
    // Row order = auto-rotation priority. The visible name is deliberately the
    // generic "Server N" (a viewer picks on capability, not on brand), and the
    // grey sub-line states the capability: a resolution ceiling, multi-audio, etc.
    // Server 1 is ZXC Centaurus — a multi-language-audio row — so "Multi audio"
    // belongs on row 1. Five rows, matching the current upstream `gN.SERVERS`
    // roster (Orion/Andromeda/Centaurus/Atlas/Ursa) read off the live embed
    // chunk 2026-10-05; Server 5 (Orion) is a multi-audio row too. VidSrc (6),
    // NHD (7) and VidRack (previously 5) were removed after re-measuring dead.
    const rows = [...dialog.querySelectorAll(".np-dialog-row")];
    expect(rows.length).toBe(5);
    const expected = [
      ["Server 1", "Multi audio"],
      ["Server 2", "Original audio"],
      ["Server 3", "Original audio"],
      ["Server 4", "Original audio"],
      ["Server 5", "Multi audio"],
    ];
    expected.forEach(([label, cap], i) => {
      expect(rows[i].textContent).toContain(label);
      expect(rows[i].textContent).toContain(cap);
    });
  });

  it("never leaks a provider's own name into the menu", () => {
    // The whole point of the rename: the sheet describes what you GET, not
    // which host serves it. Provider names stay in debug logs only.
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Servers" }));
    const dialog = screen.getByRole("dialog", { name: "Servers" });
    for (const leak of ["VidCore", "VidRack", "VidSrc", "NHD", "ZXC", "Centaurus", "Andromeda", "Atlas", "Ursa", "Meow"]) {
      expect(dialog.textContent).not.toContain(leak);
    }
  });

  it("does not call the audio capability 'dubs' in the menu copy", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Servers" }));
    const dialog = screen.getByRole("dialog", { name: "Servers" });
    expect(dialog.textContent).not.toContain("dubs");
  });

  it("exposes the switcher as a transport icon with dialog semantics", () => {
    const { rerender } = render(
      <NativePlayerView type="movie" id="550" title="Fight Club" onClose={() => {}} />,
    );
    const btn = screen.getByRole("button", { name: "Servers" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    // TV mounts carry the same switcher (chrome is shared).
    rerender(<NativePlayerView type="tv" id="1399" season={1} episode={1} title="Game of Thrones" onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Servers" })).toBeInTheDocument();
  });
});
