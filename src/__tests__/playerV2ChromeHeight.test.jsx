import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import useChromeHeight from "../components/player/v2/hooks/useChromeHeight";

/* PLAYER V2 measured chrome height (task.md 3.22).
 *
 * The subtitle cue has to clear the transport, and the legacy answered with two
 * literals — `controlsVisible ? 132 : 64` — which describe one desktop layout and
 * nothing else: on a narrow player the real transport is taller than 132 and a cue
 * sits underneath it. These tests hold the measurement, because the point of
 * measuring is that the arithmetic is gone.
 *
 * What can go wrong here is quiet rather than loud:
 *
 *  - an observer that never fires leaves the cue at its resting offset, and the only
 *    symptom is a cue under the transport on a layout nobody tested
 *  - an observer that is never disconnected keeps measuring a detached node
 *  - a fractional height produces `bottom: 95.66667px` in an inline style, and a
 *    different value on every frame of a transition
 *  - 0 is a REAL value, not "not measured yet": the transport is conditional on a
 *    resolved source, so a loading player has genuinely nothing to measure
 */

/** jsdom has no layout, so the rect is stubbed. */
const nodeWithHeight = (height) => ({ getBoundingClientRect: () => ({ height }) });

let observers;

beforeEach(() => {
  observers = [];
  global.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb;
      this.targets = [];
      observers.push(this);
    }
    observe(node) {
      this.targets.push(node);
    }
    disconnect() {
      this.disconnected = true;
      this.targets = [];
    }
  };
});

afterEach(() => {
  delete global.ResizeObserver;
});

/* Drives the hook directly rather than through the shell: this is about the
 * measurement, and rendering a whole player to observe one number would fail for
 * reasons that have nothing to do with what is under test. */
function drive({ node = null } = {}) {
  const seen = { height: null, attach: null };
  function Probe() {
    const [attach, height] = useChromeHeight();
    seen.attach = attach;
    seen.height = height;
    return null;
  }
  const utils = render(<Probe />);
  return { seen, utils, attach: (n) => act(() => seen.attach(n)) };
}

describe("useChromeHeight", () => {
  it("reports zero before anything is attached", () => {
    const { seen } = drive();
    expect(seen.height).toBe(0);
  });

  it("measures as soon as a node is attached", () => {
    // Not on the first observer callback. A ResizeObserver does fire once on
    // `observe` in a real browser, but depending on that leaves the cue at its
    // resting offset until something happens to resize the player — and on a
    // player that never resizes, never.
    const { seen, attach } = drive();
    attach(nodeWithHeight(96));
    expect(seen.height).toBe(96);
  });

  it("reports zero when the node detaches", () => {
    // The transport unmounts when a source resolves away. Leaving the last
    // measurement behind would hold the cue high above a video with no chrome.
    const { seen, attach } = drive();
    attach(nodeWithHeight(96));
    attach(null);
    expect(seen.height).toBe(0);
  });

  it("rounds a fractional height", () => {
    // Sub-pixel chrome would otherwise put `bottom: 95.66667px` in an inline style,
    // changing on every frame of a height transition.
    const { seen, attach } = drive();
    attach(nodeWithHeight(95.6667));
    expect(Number.isInteger(seen.height)).toBe(true);
    expect(seen.height).toBe(96);
  });

  it("follows the chrome as it changes height", () => {
    // This is the case the literals could not express: 3.9's Tier B adds controls,
    // 3.11's touch layout is taller, and safe-area insets change on rotation. None
    // of those fire a React render on the subtitle side.
    const { seen, attach } = drive();
    attach(nodeWithHeight(96));
    expect(seen.height).toBe(96);
    const observer = observers[observers.length - 1];
    observer.targets[0].getBoundingClientRect = () => ({ height: 148 });
    act(() => observer.cb([], observer));
    expect(seen.height).toBe(148);
  });

  it("observes the node it was given", () => {
    const { attach } = drive();
    const node = nodeWithHeight(40);
    attach(node);
    expect(observers[observers.length - 1].targets).toEqual([node]);
  });

  it("disconnects when the hook unmounts", () => {
    // A live observer on a detached node measures forever, and every measurement
    // is a setState on a gone component.
    const { attach, utils } = drive();
    attach(nodeWithHeight(96));
    const observer = observers[observers.length - 1];
    utils.unmount();
    expect(observer.disconnected).toBe(true);
  });

  it("does not throw where ResizeObserver is missing", () => {
    // jsdom, and any older embed. Throwing here would take the whole shell down
    // over subtitles.
    delete global.ResizeObserver;
    const { seen, attach } = drive();
    expect(() => attach(nodeWithHeight(96))).not.toThrow();
    // Still measured from the initial read, so the cue is not stuck at the floor.
    expect(seen.height).toBe(96);
  });
});