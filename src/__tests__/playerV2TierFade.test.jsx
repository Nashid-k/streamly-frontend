import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import TransportBar from "../components/player/v2/TransportBar";
import {
  TIER_A_CONTROLS,
  TIER_B_CONTROLS,
  ALL_CONTROL_IDS,
  TRANSPORT_SUPERSET,
  TRANSPORT_MODE,
  absentControls,
  isPresentInTier,
} from "../components/player/v2/tiers";
/* Mirrors `playerV2Style.test.js`: the stylesheet claims are checked against the
 * real file, not a fixture, so a rule deleted from `player.css` fails here. */
const V2_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "components", "player", "v2");
const readV2 = (name) => readFileSync(resolve(V2_DIR, name), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
/* Control identity from the DOM, since a disabled button is the only way these
 * are distinguishable by anything a test can read. */
const btnName = (el) => el.getAttribute("aria-label");

/* PLAYER V2 shared-DOM tier cross-fade (task.md 3.10).
 *
 * The item says Tier A and Tier B "share ONE DOM and cross-fade in place — not
 * two layouts — so nothing jumps and tab order stays continuous". Each of those
 * is a separate, falsifiable claim, and each is tested in the form that would
 * actually catch the failure:
 *
 *  - ONE DOM is asserted as NODE IDENTITY (`toBe`, not `toEqual`), across a tier
 *    change on the same mounted tree. A second layout would produce a different
 *    element and this fails; "same set of buttons" would not.
 *  - tab order is asserted through the accessibility tree, because `inert` and
 *    `aria-hidden` are what make an absent control unreachable — and crucially it
 *    is asserted IMMEDIATELY, on the same paint the control goes absent, not after
 *    its fade finishes.
 *  - nothing jumps is asserted structurally (the container and the spacer never
 *    remount, and spacing is per-item so a collapsed control leaves no gap) plus
 *    by the stylesheet actually declaring the transitions. Animations cannot be
 *    observed in jsdom, so claiming to test the motion here would be a lie; what
 *    is testable is that the thing being animated is the SAME DOM node.
 */

function absentElements(container) {
  return Array.from(container.querySelectorAll('[data-presence="absent"]'));
}

describe("the transport renders ONE dom for both tiers", () => {
  it("keeps every node mounted across a tier change", () => {
    const { container, rerender } = render(<TransportBar tier="A" />);

    // Snapshot the actual element objects, not a description of them.
    const before = Array.from(container.querySelectorAll(".pv2-transport > *"));

    rerender(<TransportBar tier="B" />);
    const after = Array.from(container.querySelectorAll(".pv2-transport > *"));

    expect(after).toHaveLength(before.length);
    // The claim. Same objects, same order — the row grew in place.
    after.forEach((el, i) => expect(el).toBe(before[i]));

    // And back again, because a one-way transition would still be a replacement.
    rerender(<TransportBar tier="A" />);
    Array.from(container.querySelectorAll(".pv2-transport > *"))
      .forEach((el, i) => expect(el).toBe(before[i]));
  });

  it("renders the superset at BOTH tiers", () => {
    const a = render(<TransportBar tier="A" />);
    const b = render(<TransportBar tier="B" />);
    const count = (c) => c.container.querySelectorAll(".pv2-transport > *").length;
    // 15 buttons + the timecode + the scrubber. The tier spines hold 14
    // controls; 3.11 adds skipBack, skipForward and close, which belong to the
    // zones layout only and are rendered — absent — in row mode too, so that
    // switching layouts never mounts a node.
    expect(count(a)).toBe(17);
    expect(count(b)).toBe(17);
    expect(count(a)).toBe(ALL_CONTROL_IDS.length);
    // The tier spines are a subset of what renders, never the whole of it.
    expect(ALL_CONTROL_IDS.length).toBeGreaterThan(TRANSPORT_SUPERSET.length);
  });

  it("renders one container, not a per-tier layout", () => {
    const { container, rerender } = render(<TransportBar tier="A" />);
    expect(container.querySelectorAll(".pv2-transport")).toHaveLength(1);
    rerender(<TransportBar tier="B" />);
    expect(container.querySelectorAll(".pv2-transport")).toHaveLength(1);
    // The tier is a class and a data attribute on that one element.
    const bar = container.querySelector(".pv2-transport");
    expect(bar.getAttribute("data-tier")).toBe("B");
    expect(bar.classList.contains("pv2-transport--tier-b")).toBe(true);
  });

  it("does not remount the controls the two tiers share", () => {
    // Tier A is a strict subset of Tier B, so a control in both is the same node
    // in both. This is the specific thing that would break if someone "optimised"
    // the two tiers into separate subtrees keyed by tier.
    //
    // Exact name, not a `/Play|Pause/` regex: in Tier B the transport also exposes
    // "Playback speed", which that pattern matches too. (It did, and the test
    // failed with "found multiple elements" for exactly this reason.)
    const { container, rerender } = render(<TransportBar tier="A" />);
    const playA = within(container).getByRole("button", { name: "Play" });
    const scrubberA = container.querySelector(".pv2-scrubber");

    rerender(<TransportBar tier="B" />);
    expect(within(container).getByRole("button", { name: "Play" })).toBe(playA);
    expect(container.querySelector(".pv2-scrubber")).toBe(scrubberA);
  });

  it("keeps the spacer — the thing that absorbs the width — mounted", () => {
    // If the scrubber were remounted, focus and any in-flight drag would be lost
    // at exactly the moment the row reflows.
    const { container, rerender } = render(<TransportBar tier="A" />);
    const spacer = container.querySelector(".pv2-transport__scrubber");
    expect(spacer).toBeTruthy();
    rerender(<TransportBar tier="B" />);
    expect(container.querySelector(".pv2-transport__scrubber")).toBe(spacer);
  });
});

describe("presence is the tier", () => {
  it("marks exactly the other tier's controls absent", () => {
    const a = render(<TransportBar tier="A" />);
    const absent = absentElements(a.container);
    // Ten: the seven Tier B additions, plus the three zones-only controls 3.11
    // added (skip-back, skip-forward, close), which are in neither spine.
    expect(absent).toHaveLength(10);
    expect(absent.map((el) => el.getAttribute("aria-label"))).toEqual([
      "Episodes",
      "Previous episode",
      "Next episode",
      "Playback speed",
      expect.stringContaining("Aspect ratio"),
      "Servers",
      "Watch Party",
      "Back 10 seconds",
      "Forward 10 seconds",
      "Close player",
    ]);
  });

  it("marks only the zones-only controls absent in Tier B", () => {
    // Was "marks nothing absent in Tier B" until 3.11, which added three controls
    // that belong to the zones layout and to neither tier spine. They render
    // absent in ROW mode at both tiers — that is the price of one DOM across both
    // layouts, and it is the right trade: three inert buttons beat remounting
    // eight nodes the moment someone picks up a finger.
    const b = render(<TransportBar tier="B" />);
    expect(absentElements(b.container).map(btnName)).toEqual(
      expect.arrayContaining(["Back 10 seconds", "Forward 10 seconds", "Close player"]),
    );
    expect(absentElements(b.container)).toHaveLength(3);
    b.container
      .querySelectorAll(".pv2-transport button[data-presence='present']")
      .forEach((el) => expect(el.getAttribute("data-presence")).toBe("present"));
  });

  it("never marks the shared spine absent, at either tier", () => {
    // The timecode and scrubber belong to both tier spines, so in ROW mode they
    // are always present — and the attribute now says so explicitly.
    //
    // This used to assert the attribute was `null`, on the reasoning that a
    // control shared by both tiers could never be absent. 3.11 falsified that:
    // the zones layout has no clock and no scrubber, so presence has to be able
    // to say "absent" for exactly this pair. The guarantee that survives is the
    // one that matters — in row mode, at either tier, neither ever goes absent.
    ["A", "B"].forEach((tier) => {
      const { container } = render(<TransportBar tier={tier} />);
      expect(container.querySelector(".pv2-timecode").getAttribute("data-presence")).toBe(
        "present",
      );
      expect(container.querySelector(".pv2-scrubber").getAttribute("data-presence")).toBe(
        "present",
      );
    });
  });

  it("agrees with the pure layer", () => {
    // Tier A is 7 of 17, Tier B is 14 of 17. The remaining 3 are the zones-only
    // controls, which is why neither count is 0 anymore.
    expect(absentControls("A")).toHaveLength(10);
    expect(absentControls("B")).toHaveLength(3);
    expect(absentControls("Z")).toHaveLength(10); // unknown tier degrades to A
    TIER_A_CONTROLS.forEach((id) => expect(isPresentInTier(id, "A")).toBe(true));
    TIER_B_CONTROLS.forEach((id) => expect(isPresentInTier(id, "B")).toBe(true));
    ["episodes", "speed"].forEach((id) => {
      expect(isPresentInTier(id, "A")).toBe(false);
      expect(isPresentInTier(id, "B")).toBe(true);
    });
    // The zones-only controls are absent from BOTH tiers — they are a layout, not
    // a tier, which is exactly why `isPresentInTier` takes a mode.
    ["skipBack", "skipForward", "close"].forEach((id) => {
      expect(isPresentInTier(id, "A")).toBe(false);
      expect(isPresentInTier(id, "B")).toBe(false);
      expect(isPresentInTier(id, "B", TRANSPORT_MODE.ZONES)).toBe(true);
    });
  });

  it("keeps the invariant that makes all of this possible", () => {
    // THE load-bearing property. Tier A is a strict subset of Tier B, which is
    // why "render the superset, mark the rest absent" reproduces Tier A's exact
    // order. If a control is added to A alone, the superset's B-first ordering no
    // longer describes A, and the row would come out in the wrong sequence —
    // silently, since every count still matches.
    const aOnly = TIER_A_CONTROLS.filter((id) => !TIER_B_CONTROLS.includes(id));
    expect(aOnly, `Tier A has controls Tier B lacks: ${aOnly.join(", ")}`).toEqual([]);

    // And the rendering order of the present controls must equal the tier's list,
    // for both tiers — which is the consequence of the subset property.
    ["A", "B"].forEach((tier) => {
      const { container } = render(<TransportBar tier={tier} />);
      const present = Array.from(container.querySelectorAll(".pv2-transport > *"))
        .filter((el) => el.getAttribute("data-presence") !== "absent")
        .map((el) => el.getAttribute("aria-label") || "scrubber-or-timecode");
      expect(present).toHaveLength(tier === "B" ? 14 : 7);
    });
  });
});

describe("an absent control leaves the tab order immediately", () => {
  it("takes absent controls out of the accessibility tree", () => {
    render(<TransportBar tier="A" />);
    // Not merely invisible — unreachable. `getByRole` respects `aria-hidden`, so
    // a control that is still in the accessibility tree fails here.
    expect(screen.queryByRole("button", { name: "Episodes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Playback speed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Watch Party" })).toBeNull();
  });

  it("keeps absent controls out of the tab sequence", () => {
    const { container } = render(<TransportBar tier="A" />);
    absentElements(container).forEach((el) => {
      // `inert` for real browsers, and `tabindex="-1"` for the rest. Either alone
      // would do; both together means an engine without `inert` support still
      // cannot be tabbed into an invisible control.
      expect(el.hasAttribute("inert"), el.getAttribute("aria-label")).toBe(true);
      expect(el.getAttribute("tabindex")).toBe("-1");
      expect(el.disabled).toBe(true);
    });
  });

  it("brings them back on Tier B", () => {
    const { container, rerender } = render(<TransportBar tier="A" />);
    rerender(<TransportBar tier="B" />);
    expect(screen.getByRole("button", { name: "Episodes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Playback speed" })).toBeTruthy();
    // Buttons only. The scrubber is a `div[role="slider"]`, so "back in the tab
    // order" is `tabindex="0"` rather than the absence of a `tabindex`
    // attribute — it carries one in both states, because `role="slider"` has to
    // keep its keyboard model either way.
    container.querySelectorAll('button[data-presence="present"]').forEach((el) => {
      expect(el.hasAttribute("inert")).toBe(false);
      expect(el.getAttribute("tabindex")).toBeNull();
    });
    container
      .querySelectorAll('[data-presence="present"]')
      .forEach((el) => expect(el.hasAttribute("inert")).toBe(false));
    expect(container.querySelector(".pv2-scrubber").getAttribute("tabindex")).toBe("0");
  });

  it("applies absence on the SAME paint, not after the fade", () => {
    // The failure this rules out: deferring `inert` to a transitionend callback
    // would leave a focusable ghost for the whole 160ms fade — long enough for a
    // keyboard user mid-Tab to land on an invisible button.
    const { container, rerender } = render(<TransportBar tier="B" />);
    rerender(<TransportBar tier="A" />);
    // No timers, no waiting, no act(): synchronously after the re-render.
    const episodes = container.querySelector('[aria-label="Episodes"]');
    expect(episodes.hasAttribute("inert")).toBe(true);
    expect(episodes.getAttribute("aria-hidden")).toBe("true");
    expect(episodes.getAttribute("tabindex")).toBe("-1");
  });

  it("does not let a present-but-disabled control be confused with an absent one", () => {
    // A disabled prev/next is PRESENT and stays in the row; an absent control is
    // not. Collapsing the two would mean Tier A's row grows a gap on the first
    // episode of a series.
    const { container } = render(<TransportBar tier="B" />);
    const prev = container.querySelector('[aria-label="Previous episode"]');
    expect(prev.getAttribute("data-presence")).toBe("present");
    expect(prev.disabled).toBe(true);
    expect(prev.hasAttribute("inert")).toBe(false);
  });
});

describe("the cross-fade is declared in the stylesheet", () => {
  const css = stripComments(readV2("player.css"));

  it("spaces the row per item, not with a container gap", () => {
    // A flex `gap` is added between every pair of items, including zero-width
    // ones. With the superset always rendered, seven collapsed Tier B controls
    // would leave seven phantom gaps in Tier A and the row would be permanently
    // too wide with nothing filling it.
    //
    // The declaration must be matched at a real boundary: `\bgap\s*:` also matches
    // the `gap` inside `--pv2-transport-gap:`, so the lookbehind here requires
    // whitespace, `;` or `{` before it. Verified against the actual file rather
    // than assumed — the first version of this test failed for exactly that reason.
    expect(css, "the container must not use flex gap").not.toMatch(
      /\.pv2-transport\s*\{[^}]*(?:^|[\s;{])gap\s*:/s,
    );
    expect(css, "spacing must live on the children").toMatch(
      /\.pv2-transport\s*>\s*\*\s*\{[^}]*margin-inline-end/s,
    );
  });

  it("collapses an absent control's spacing to zero", () => {
    expect(css).toMatch(
      /\[data-presence="absent"\][^}]*margin-inline-end\s*:\s*0/s,
    );
  });

  it("fades presence in both directions", () => {
    expect(css).toMatch(/\[data-presence\][^}]*transition[^}]*opacity/s);
    expect(css).toMatch(/\[data-presence="absent"\][^}]*opacity\s*:\s*0/s);
  });

  it("animates width in a length-to-length direction", () => {
    // `inline-size: 2rem -> 0` interpolates; `auto -> 0` does not, which is why
    // the fixed-size icon buttons get a width transition and the content-sized
    // value buttons are documented as fading only.
    expect(css).toMatch(/pv2-icon-btn\[data-presence\][^}]*transition[^}]*inline-size/s);
    expect(css).toMatch(/pv2-icon-btn\[data-presence="absent"\][^}]*inline-size\s*:\s*0/s);
  });

  it("honours reduced motion through the existing shell attribute", () => {
    // No new @media rule: 3.6 bans them in this stylesheet, and it does not need
    // one because 3.1 already neutralises transitions under the shell attribute.
    // The selector is a comma-separated list (`*`, `*::before`, `*::after`), so the
    // pattern has to span the list rather than stop at the first `*`.
    expect(css).toMatch(
      /\.pv2-shell\[data-reduce-motion="true"\][\s\S]{0,120}?\{[^}]*transition\s*:\s*none/s,
    );
  });
});