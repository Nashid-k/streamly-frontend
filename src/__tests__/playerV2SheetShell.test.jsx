import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import PlayerShell from "../components/player/v2/PlayerShell";

/* The sheet's single-panel invariant at the shell level (task.md 3.24).
 *
 * `SettingsSheet` is tested on its own in `playerV2SettingsSheet.test.jsx`. What
 * only the shell can show is the part this item is really about: whether the
 * shell can put TWO panels on screen. A sheet that renders one panel but is
 * mounted twice, or one whose openers each set their own state, passes every
 * unit test and still stacks.
 *
 * These go through the real transport rather than a stubbed `TransportBar`,
 * because the openers ARE the thing under test — `onOpenSheet(controlId)` is
 * what decides which panel appears, and a stub would test the stub. That means
 * the shell has to reach a resolved source before it mounts the transport at
 * all, hence the source and hls.js mocks below.
 */

const mocks = vi.hoisted(() => ({
  resolve: async () => ({}),
  tier: "A",
  /* Every node the shell ever hands to `useChromeHeight`, so a test can ask WHICH
   * node was measured instead of inferring it from the DOM. */
  measured: [],
}));
vi.mock("hls.js", () => {
  class FakeHls {
    static Events = { ERROR: "hlsError" };
    static isSupported() {
      return true;
    }
    on() {}
    off() {}
    loadSource() {}
    attachMedia() {}
    destroy() {}
  }
  return { default: FakeHls };
});
vi.mock("../constants/sources", () => ({
  PLAYER_SOURCES: [{ key: "one", label: "Server One", resolve: (a, o) => mocks.resolve(a, o) }],
}));
/* Tier A is what jsdom measures (0px wide) and it has only the captions and settings
 * openers. The Tier B openers are reachable by mocking the hook, which is honest about
 * what is being faked: the layout, not the wiring under test. */
vi.mock("../components/player/v2/hooks/useTier", () => ({
  default: () => mocks.tier,
}));
/* Wrapped rather than replaced: the real hook is still what produces `chromeHeight`,
 * so the only thing faked is the recording of which node it was pointed at. */
vi.mock("../components/player/v2/hooks/useChromeHeight", async () => {
  const actual = await vi.importActual("../components/player/v2/hooks/useChromeHeight");
  return {
    default: () => {
      const [attach, height] = actual.default();
      return [
        (node) => {
          if (node) mocks.measured.push(node);
          return attach(node);
        },
        height,
      ];
    },
  };
});

const PLAYABLE = {
  source: { url: "https://cdn.test/master.m3u8" },
  variants: [{ label: "1080p" }],
};

async function shell(extra = {}) {
  mocks.resolve = async () => PLAYABLE;
  const out = render(<PlayerShell id="tt123" type="movie" title="Test" {...extra} />);
  await waitFor(() => expect(document.querySelector("video")).toBeTruthy());
  return out;
}

/**
 * Open a panel by its transport opener.
 *
 * Asserting on the opener's accessible name rather than reaching into the shell's
 * state is deliberate: the opener IS the contract. `onOpenSheet(controlId)` is how
 * a panel gets chosen, so a test that set `sheetPanel` directly would pass even if
 * every opener passed the wrong id.
 *
 * Which openers exist depends on the TIER, and jsdom has no layout, so `useTier`
 * measures 0 and lands on Tier A. Tier A's openers are `captions` and `settings`;
 * `speed`, `aspect`, `episodes`, `users` and `server` are Tier B only, so they
 * have no button here to press. That is not a gap in this file — `SettingsSheet`
 * renders all six, tested directly, and the tier split itself is 3.9's.
 */
function openPanel(name = /subtitles/i) {
  fireEvent.click(screen.getByRole("button", { name }));
}

/**
 * The transport's Subtitles opener, reached through the row rather than the document.
 *
 * 3.27 made `/subtitles/i` ambiguous at the `screen` level: the sheet's own heading and
 * close button now name the panel too ("Close Subtitles"), so `getByRole` finds two.
 * Querying inside the transport is the more precise version anyway — the thing under
 * test is the OPENER's attributes, and `screen` spans both halves of the feature.
 */
function subtitlesOpener() {
  return within(document.querySelector(".pv2-transport")).getByRole("button", {
    name: /subtitles/i,
  });
}

function settingsOpener() {
  return within(document.querySelector(".pv2-transport")).getByRole("button", {
    name: /settings/i,
  });
}

beforeEach(() => {
  mocks.resolve = async () => ({});
  mocks.tier = "A";
  mocks.measured.length = 0;
});

describe("the sheet holds one panel (3.24)", () => {
  it("mounts no sheet until a panel is opened", async () => {
    const { container } = await shell();
    /* An always-mounted empty sheet is a permanent right-hand gutter over the
     * video. Asserting the panel id is unset would NOT catch that — it passes with
     * an empty sheet mounted — so this asserts on the element. */
    expect(container.querySelector(".pv2-sheet")).toBeNull();
    expect(document.querySelector(".pv2-shell")?.dataset.sheet).toBeUndefined();
  });

  it("opens one panel and stamps which (captions, a Tier A opener)", async () => {
    const { container } = await shell();
    fireEvent.click(subtitlesOpener());

    const sheets = container.querySelectorAll(".pv2-sheet");
    expect(sheets).toHaveLength(1);
    expect(sheets[0].dataset.sheetPanel).toBe("captions");
    expect(document.querySelector(".pv2-shell")?.dataset.sheet).toBe("captions");
  });

  it("shows exactly one heading, however many times an opener is pressed", async () => {
    /* The item's actual requirement, stated as a count. "One panel renders" would
     * still pass with two panels mounted if the second happened to be empty — and
     * an empty panel over a filled one is the exact stacked-overlay failure, just
     * less obvious. */
    const { container } = await shell();
    for (const name of [/subtitles/i, /settings/i]) {
      openPanel(name);
      expect(container.querySelectorAll(".pv2-sheet")).toHaveLength(1);
      expect(screen.getAllByRole("heading")).toHaveLength(1);
    }
  });

  it("replaces the open panel rather than stacking a second", async () => {
    const { container } = await shell();
    openPanel(/subtitles/i);
    openPanel(/settings/i);

    /* The legacy's defect, at the level where it is visible: the second sheet's
     * scrim covers the first panel's rows, so a press there dismisses the NEWER
     * panel and leaves the older one unreachable — the viewer taps a panel that
     * appears to do nothing. */
    expect(container.querySelectorAll(".pv2-sheet")).toHaveLength(1);
    expect(container.querySelector(".pv2-sheet").dataset.sheetPanel).toBe("settings");
  });

  it("closes when the openers own button is pressed again", async () => {
    const { container } = await shell();
    const opener = subtitlesOpener();
    fireEvent.click(opener);
    fireEvent.click(opener);

    /* The only dismissal available before 3.25's backdrop and Escape. Without it
     * the sheet is a one-way door for a keyboard viewer. */
    expect(container.querySelector(".pv2-sheet")).toBeNull();
    expect(document.querySelector(".pv2-shell")?.dataset.sheet).toBeUndefined();
  });

  it("closes from the sheet's own close button", async () => {
    const { container } = await shell();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: /close subtitles/i }));
    expect(container.querySelector(".pv2-sheet")).toBeNull();
  });

  it("survives an opener that is not a panel", async () => {
    /* The volume control is an opener in zones mode only. In row mode it is the
     * mute toggle, which must NOT open anything — if it did, the panel switch
     * would fall through and the viewer would get an empty sheet from a control
     * whose whole job is to toggle sound. */
    const { container } = await shell();
    const mute = screen.getByRole("button", { name: /mute/i });
    fireEvent.click(mute);
    expect(container.querySelector(".pv2-sheet")).toBeNull();

    /* And a press on a real panel afterwards still works, so the refused id left
     * no broken state behind. */
    openPanel();
    expect(container.querySelector(".pv2-sheet")?.dataset.sheetPanel).toBe("captions");
  });
});

/* Two wiring bugs 3.26's audit turned up. Both were invisible from the sheet's own
 * tests, because both live in the shell: the prop is passed here or it is not, and
 * the ref is attached here or it is not. */

describe("what the shell hands the sheet (3.24/3.26 audit)", () => {
  it("forwards the watch party's identity so the roster can mark you", async () => {
    /* `UsersPanel` compares each participant against `identity.participantId`. With
     * `identity` left out of the `panels` object the comparison was against
     * `undefined` and matched NOBODY — so the roster rendered, listed everyone, and
     * silently never said which one was the viewer. A unit test on `UsersSheet`
     * passes that bug, because the unit test supplies the prop itself; only the shell
     * knows whether it forwards one.
     *
     * Driven through the real transport opener, which means the tier has to be Tier B:
     * jsdom has no layout, so `useTier` measures 0 and lands on Tier A, where the users
     * opener does not exist. Mocking the tier is the only way to reach the wiring
     * without hand-typing the `panels` object — and a test that types the prop it is
     * asserting the shell passes proves nothing at all. */
    mocks.tier = "B";
    await shell({
      party: {
        identity: { participantId: "me", name: "Ana" },
        room: {
          participants: [
            { participantId: "them", name: "Bo", isHost: true },
            { participantId: "me", name: "Ana" },
          ],
        },
      },
    });

    openPanel(/watching/i);
    expect(document.querySelector(".pv2-sheet")?.dataset.sheetPanel).toBe("users");

    const listed = document.querySelectorAll(".pv2-sheet__roster > li");
    expect(listed).toHaveLength(2);
    expect(listed[1].dataset.self).toBe("true");
    expect(listed[1].textContent).toMatch(/you/);
  });

  it("names a panel element that actually exists (3.27)", async () => {
    /* The test with teeth. `aria-controls` is a relationship between the opener in
     * `TransportBar` and the panel in `SettingsSheet` — two files that do not import
     * each other, each able to assert only its own half. A prefix spelled slightly
     * differently on the two sides, or an id stamped on the body when the opener
     * points at the dialog, produces a reference that resolves to nothing while both
     * files' unit tests pass.
     *
     * So the assertion is RESOLUTION, not presence: `document.getElementById` against
     * the live attribute. `expect(opener).toHaveAttribute("aria-controls")` would pass
     * for `aria-controls="pv2-sheet-pannel-captions"`. */
    await shell();
    openPanel();

    const opener = subtitlesOpener();
    const controls = opener.getAttribute("aria-controls");
    expect(controls, "no aria-controls on an opener").toBeTruthy();

    /* And it resolves to the panel that is actually on screen — not to some other
     * element that happens to share the id. */
    const target = document.getElementById(controls);
    expect(target, `aria-controls="${controls}" resolves to nothing`).toBeTruthy();
    expect(target).toBe(document.querySelector(".pv2-sheet"));
    expect(target.dataset.sheetPanel).toBe("captions");
  });

  it("says which opener is expanded, and only while its panel is open (3.27)", async () => {
    /* `aria-expanded` was hardcoded `false` on all six openers, so a screen-reader
     * user was told the Subtitles button was collapsed while the Subtitles panel was
     * on screen in front of them. A claim that is always "no" is worse than no claim:
     * it is indistinguishable from a broken control, and it makes `aria-controls`
     * incoherent — an opener naming a panel it insists is not there.
     *
     * All three openers checked, because the failure was a hardcoded constant on every
     * one of them and a test on one opener passes just as well. */
    const openersOf = () => ({
      subtitles: subtitlesOpener(),
      settings: settingsOpener(),
      play: screen.getByRole("button", { name: /play|pause/i }),
    });

    await shell();
    let now = openersOf();
    expect(now.subtitles.getAttribute("aria-expanded")).toBe("false");
    expect(now.settings.getAttribute("aria-expanded")).toBe("false");

    openPanel();
    now = openersOf();
    expect(now.subtitles.getAttribute("aria-expanded")).toBe("true");
    /* The OTHER opener stays collapsed. Testing only the open one is how a bug where
     * every opener reports expanded survives. */
    expect(now.settings.getAttribute("aria-expanded")).toBe("false");
    /* And a control that opens nothing carries neither attribute — `aria-expanded` on
     * the play button would be a claim about a state that does not exist, and
     * `aria-controls` on it would name a panel it cannot open.
     *
     * Not `toBeNull()`: an attribute whose value is the literal string "null" is a
     * reference to an element with that id, which does not exist. `controls ?? undefined`
     * in the render is what prevents that, and this is the assertion that would notice
     * if it were removed — `expect(null)` on an absent attribute and on
     * `aria-controls="null"` look identical from the wrong side. */
    expect(now.play.hasAttribute("aria-expanded")).toBe(false);
    expect(now.play.hasAttribute("aria-controls")).toBe(false);

    /* Every non-opener in the row, not just play: the guard is `haspopup` on two
     * button components, and a scrubber or a volume icon carrying a dialog reference
     * is the same defect wearing different clothes. */
    for (const button of document.querySelectorAll(".pv2-transport button")) {
      if (button.hasAttribute("aria-haspopup")) continue;
      expect(
        button.hasAttribute("aria-controls"),
        `non-opener ${button.getAttribute("aria-label") ?? button.textContent} has aria-controls`,
      ).toBe(false);
    }

    /* Closing returns it to false, rather than latching. */
    fireEvent.click(subtitlesOpener());
    expect(openersOf().subtitles.getAttribute("aria-expanded")).toBe("false");
  });

  it("moves the expanded claim when the panel is replaced (3.27)", async () => {
    /* One panel at a time means exactly one opener may claim expanded. A replacement
     * that left the previous opener expanded would give a screen reader two "expanded"
     * buttons and no way to tell which panel is on screen. */
    await shell();
    openPanel();
    expect(subtitlesOpener().getAttribute("aria-expanded")).toBe(
      "true",
    );

    fireEvent.click(settingsOpener());
    expect(document.querySelector(".pv2-sheet")?.dataset.sheetPanel).toBe("settings");
    expect(subtitlesOpener().getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(settingsOpener().getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("points each opener at its OWN panel (3.27)", async () => {
    /* Not a shared id, and not the open one. An opener naming a panel it does not open
     * is a plausible bug — the mapping is `controlId === panelId` in every case today,
     * which is exactly the coincidence that hides a mistake until someone adds an
     * opener whose id differs from its panel's. */
    await shell();
    openPanel();
    const subtitles = subtitlesOpener();
    const settings = settingsOpener();
    expect(subtitles.getAttribute("aria-controls")).not.toBe(settings.getAttribute("aria-controls"));
    /* Only the open one's target is in the DOM, because only one panel exists. */
    const closed = document.getElementById(settings.getAttribute("aria-controls"));
    /* Deferred, not absent: an id that is not mounted yet is what a dialog opener
     * normally points at, and `aria-expanded` is what says whether it is there now. */
    expect(closed).toBeNull();
  });

  it("measures the transport, not the full-bleed chrome layer", async () => {
    /* 3.18's subtitle clearance is `chromeHeight` off the bottom edge, and
     * `useChromeHeight` measures whichever node it is handed. Handed the
     * `.pv2-chrome` wrapper — which is `position: absolute; inset: 0`, the whole
     * player — it reports the player's height, so every cue sits a full player's
     * height above the bottom edge: off-screen, on every title.
     *
     * Captured at the hook rather than inferred from the DOM. `getBoundingClientRect`
     * returns 0 for everything in jsdom, so a height assertion here would be
     * `expect(0).toBe(0)`; and "a `.pv2-transport` exists somewhere" passes whether or
     * not the ref is on it. The question is only ever WHICH node was handed over, so
     * the test asks that directly. */
    await shell();
    expect(mocks.measured.length).toBeGreaterThan(0);
    for (const node of mocks.measured) {
      expect(node.className, "measured node").toMatch(/pv2-transport/);
      expect(node.className, "measured node").not.toMatch(/pv2-chrome\b/);
      /* And it is the row, not the layer: the full-bleed wrapper is its ancestor. */
      expect(node.closest(".pv2-chrome")).toBeTruthy();
    }
  });
});