import { describe, expect, it } from "vitest";
import { keyboardAction } from "../components/player/nativePlayerKeys";

/* The player's keyboard contract, pinned as a pure function. Until now it only
   existed inside a `switch` in NativePlayerView's keydown effect, so no test
   could reach it without a MediaSource-capable browser (jsdom has none). These
   cases describe the shipped behaviour, including the deliberate asymmetries:
   Space/arrows swallow auto-repeat but only act once, Escape yields to
   fullscreen, and M/F do not preventDefault while K/J/L do. */

const key = (overrides) => keyboardAction({ code: "KeyK", ...overrides });

describe("keyboardAction guards", () => {
  it("yields to a handler that already claimed the key", () => {
    expect(key({ defaultPrevented: true })).toBeNull();
  });

  it("never steals keys from a text field", () => {
    for (const targetTag of ["INPUT", "TEXTAREA", "SELECT"]) {
      for (const code of ["Space", "KeyK", "ArrowLeft", "KeyF", "Escape"]) {
        expect(key({ code, targetTag })).toBeNull();
      }
    }
  });

  it("leaves Space/Enter on a focused button to the button itself", () => {
    expect(key({ code: "Space", targetTag: "BUTTON" })).toBeNull();
    expect(key({ code: "Enter", targetTag: "BUTTON" })).toBeNull();
    // Other keys still reach the player while a button has focus.
    expect(key({ code: "KeyK", targetTag: "BUTTON" })).toMatchObject({ type: "toggle-play" });
  });

  it("does nothing until the media element exists", () => {
    expect(key({ hasVideo: false })).toBeNull();
    expect(key({ code: "Escape", hasVideo: false })).toBeNull();
  });
});

describe("keyboardAction transport", () => {
  it("arms Space and swallows the auto-repeat that follows", () => {
    expect(key({ code: "Space" })).toEqual({ type: "space", preventDefault: true, repeated: false });
    expect(key({ code: "Space", spaceHeld: true })).toEqual({
      type: "space",
      preventDefault: true,
      repeated: true,
    });
  });

  it("toggles on K immediately, with preventDefault", () => {
    expect(key({ code: "KeyK" })).toEqual({ type: "toggle-play", preventDefault: true });
  });

  it("maps J/L to relative seeks", () => {
    expect(key({ code: "KeyJ" })).toEqual({ type: "seek-back", preventDefault: true });
    expect(key({ code: "KeyL" })).toEqual({ type: "seek-forward", preventDefault: true });
  });

  it("seeks once per physical arrow press but always swallows the key", () => {
    expect(key({ code: "ArrowLeft" })).toEqual({
      type: "seek-back",
      preventDefault: true,
      repeated: false,
    });
    expect(key({ code: "ArrowLeft", repeat: true })).toEqual({
      type: "seek-back",
      preventDefault: true,
      repeated: true,
    });
    expect(key({ code: "ArrowRight", repeat: true })).toMatchObject({
      type: "seek-forward",
      repeated: true,
    });
  });

  it("lets volume arrows repeat, the way a held arrow key should", () => {
    expect(key({ code: "ArrowUp", repeat: true })).toEqual({ type: "volume-up", preventDefault: true });
    expect(key({ code: "ArrowDown" })).toEqual({ type: "volume-down", preventDefault: true });
  });
});

describe("keyboardAction surfaces", () => {
  it("cycles aspect and toggles mute/fullscreen", () => {
    expect(key({ code: "KeyA" })).toEqual({ type: "cycle-aspect", preventDefault: true });
    expect(key({ code: "KeyM" })).toEqual({ type: "toggle-mute" });
    expect(key({ code: "KeyF" })).toEqual({ type: "fullscreen" });
  });

  it("maps N to next and Shift+P to previous only", () => {
    expect(key({ code: "KeyN" })).toEqual({ type: "episode-next", preventDefault: true });
    expect(key({ code: "KeyP", shiftKey: true })).toEqual({
      type: "episode-prev",
      preventDefault: true,
    });
    expect(key({ code: "KeyP" })).toBeNull();
  });

  it("closes the open panel before the player, and never fights fullscreen", () => {
    expect(key({ code: "Escape", panelOpen: true })).toEqual({ type: "close-panel" });
    expect(key({ code: "Escape" })).toEqual({ type: "close-player" });
    expect(key({ code: "Escape", fullscreen: true })).toBeNull();
  });

  it("ignores keys it does not own", () => {
    expect(key({ code: "Enter" })).toBeNull();
    expect(key({ code: "KeyQ" })).toBeNull();
    expect(key({ code: "Digit1" })).toBeNull();
  });
});
