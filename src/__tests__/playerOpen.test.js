import { describe, expect, it } from "vitest";
import {
  PLAYER_OPEN_ATTR,
  PLAYER_OPEN_SELECTOR,
  isPlayerOpen,
  playerOpenAttrs,
} from "../utils/playerOpen";

/* Player-open detection tests.
 *
 * The bug these lock down: detection was "is a provider IFRAME in the DOM?",
 * which is false for every native HLS stream. Both real regressions followed
 * from that (BackToTop floating over playback; the shortcuts modal opening
 * behind the player). The final test asserts the old predicate fails the same
 * DOM the new one passes, so this suite cannot quietly stop covering the bug.
 */

const OLD_IFRAME_SELECTOR =
  'iframe[src*="cinesrc"], iframe[src*="vidlink"], iframe[src*="vidsrc"], iframe[src*="vidcore"], iframe[src*="peachify"], iframe[src*="vidup"], iframe[src*="smashystream"]';

const OLD_PREDICATE = () => Boolean(document.querySelector(OLD_IFRAME_SELECTOR));

function mount(html) {
  document.body.innerHTML = html;
  return document.body;
}

describe("isPlayerOpen", () => {
  it("is false when nothing is mounted", () => {
    mount("");
    expect(isPlayerOpen()).toBe(false);
  });

  it("detects the NATIVE player, which contains no iframe at all", () => {
    // The regression. A real stream is <video> + a <canvas> subtitle layer.
    mount(`
      <div ${PLAYER_OPEN_ATTR}="true" style="z-index:99999">
        <video src="blob:https://example/x"></video>
      </div>
    `);
    expect(isPlayerOpen()).toBe(true);
  });

  it("detects the TRAILER player too, even though its iframe is not a provider", () => {
    // Note the src: a plain YouTube embed. The old selector listed only the
    // movie providers, so it missed trailers even when an iframe was present.
    mount(`
      <div ${PLAYER_OPEN_ATTR}="true">
        <iframe src="https://www.youtube.com/embed/abc123"></iframe>
      </div>
    `);
    expect(isPlayerOpen()).toBe(true);
  });

  it("ignores an element whose attribute is 'false'", () => {
    mount(`<div ${PLAYER_OPEN_ATTR}="false"></div>`);
    expect(isPlayerOpen()).toBe(false);
  });

  it("does not match the attribute name without a value", () => {
    // Guards against a sloppy `[data-player-open]` selector that would also
    // match `data-player-open="false"`.
    mount(`<div ${PLAYER_OPEN_ATTR}></div>`);
    expect(isPlayerOpen()).toBe(false);
  });

  it("is false again once the overlay unmounts", () => {
    mount(`<div ${PLAYER_OPEN_ATTR}="true"></div>`);
    expect(isPlayerOpen()).toBe(true);
    mount("");
    expect(isPlayerOpen()).toBe(false);
  });

  it("accepts an injected root", () => {
    const root = mount(`<div><section ${PLAYER_OPEN_ATTR}="true"></section></div>`);
    expect(isPlayerOpen(root)).toBe(true);
  });

  it("returns false instead of throwing on a hostile root", () => {
    const hostile = {
      querySelector() {
        throw new Error("bad selector");
      },
    };
    expect(() => isPlayerOpen(hostile)).not.toThrow();
    expect(isPlayerOpen(hostile)).toBe(false);
  });

  it("treats an omitted root as document, but an explicit null as 'nothing'", () => {
    mount(`<div ${PLAYER_OPEN_ATTR}="true"></div>`);
    // Omitted -> the whole document is searched.
    expect(isPlayerOpen()).toBe(true);
    // Explicit null -> respected as "no scope", NOT silently widened to
    // document. `root ?? document` would wrongly return true here.
    expect(isPlayerOpen(null)).toBe(false);
  });
});

describe("playerOpenAttrs", () => {
  it("produces exactly the attribute the selector matches", () => {
    // If these ever drift, the overlay stamps something nothing can read and
    // every consumer silently reverts to "always false" — the original bug.
    expect(playerOpenAttrs).toEqual({ [PLAYER_OPEN_ATTR]: "true" });
    mount("");
    expect(document.querySelector(PLAYER_OPEN_SELECTOR)).toBeNull();
  });

  it("is set by setAttribute, and NOT by Object.assign", () => {
    // Non-vacuity for the React-only constraint documented on playerOpenAttrs.
    // JSX special-cases data-* and calls setAttribute; a vanilla
    // Object.assign only creates a JS expando, leaving detection broken.
    const el = document.createElement("div");
    Object.assign(el, playerOpenAttrs);
    document.body.appendChild(el);
    expect(el.hasAttribute(PLAYER_OPEN_ATTR)).toBe(false);
    expect(isPlayerOpen()).toBe(false);

    el.setAttribute(PLAYER_OPEN_ATTR, "true");
    expect(isPlayerOpen()).toBe(true);
  });
});

describe("the old iframe predicate could not detect any real stream", () => {
  it("fails the native player case that this fix targets", () => {
    mount(`
      <div ${PLAYER_OPEN_ATTR}="true">
        <video src="blob:https://example/x"></video>
      </div>
    `);
    // Non-vacuity: the old code returns false here while the new code returns
    // true. If this ever flips, the bug is back.
    expect(OLD_PREDICATE()).toBe(false);
    expect(isPlayerOpen()).toBe(true);
  });

  it("fails the YouTube trailer case too", () => {
    mount(`<iframe src="https://www.youtube.com/embed/abc123"></iframe>`);
    expect(OLD_PREDICATE()).toBe(false);
  });

  it("agrees with the new predicate only for a listed provider iframe", () => {
    mount(`<iframe src="https://vidsrc.xyz/embed/movie"></iframe>`);
    expect(OLD_PREDICATE()).toBe(true);
  });
});
