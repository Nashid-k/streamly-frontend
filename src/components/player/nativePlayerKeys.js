/* Pure keymap for the player chrome. `keyboardAction` answers one question —
   "does the player own this keypress, and if so what should happen?" — so the
   contract that used to live inside a `switch` in a 4.6k-line component can be
   tested without mounting the player or faking MediaSource.

   Three historical behaviours are deliberate and pinned by the tests:
   - Space is swallowed on EVERY keydown (auto-repeat included) or the page
     scrolls behind the overlay, but it only ARMS the hold on the first one.
   - Arrow seeks are also swallowed on auto-repeat and only acted on once, so a
     held arrow cannot machine-gun seeks into the relay.
   - Escape belongs to the browser while an element is fullscreen.

   player-v4 parity: "<"/">" step through playback speeds, ","/"." nudge a
   paused frame, the number keys jump to 0–90 percent, and "c" flips captions
   — all matched on e.key, because those characters move across layouts. */

export function keyboardAction({
  code,
  key: rawKey = "",
  repeat = false,
  shiftKey = false,
  defaultPrevented = false,
  targetTag = "",
  panelOpen = false,
  fullscreen = false,
  spaceHeld = false,
  hasVideo = true,
  playing = false,
} = {}) {
  // Another handler already claimed this key.
  if (defaultPrevented) return null;
  const tag = String(targetTag || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return null;
  // Space/Enter on a focused button already clicks it — running our own toggle
  // too would double-fire into a no-op.
  if (tag === "button" && (code === "Space" || code === "Enter")) return null;
  // The engine ignores every key until the media element exists (fatal mount).
  if (!hasVideo) return null;

  const key = String(rawKey || "");
  // Character keys (v4 keeps these on e.key, not e.code: "<" is Shift+Comma on
  // a US layout but a different physical key elsewhere).
  if (key === "<") return { type: "speed-down", preventDefault: true };
  if (key === ">") return { type: "speed-up", preventDefault: true };
  // Frame-stepping only makes sense while paused; while playing, Comma/Period
  // are handed to the browser untouched.
  if ((key === "," || key === ".") && !playing) {
    return { type: "frame-step", value: key === "." ? 1 : -1, preventDefault: true };
  }
  if (/^[0-9]$/.test(key)) return { type: "seek-percent", value: Number(key) };
  if (key === "c") return { type: "toggle-captions" };

  switch (code) {
    case "Space":
      /* A TAP is play/pause, a HOLD is 2x, so the tap is deferred to keyup and
         cancelled outright if 2x engaged. KeyK stays an instant toggle — it has
         no hold meaning. */
      return { type: "space", preventDefault: true, repeated: spaceHeld };
    case "KeyK":
      return { type: "toggle-play", preventDefault: true };
    case "KeyJ":
      return { type: "seek-back", preventDefault: true };
    case "KeyL":
      return { type: "seek-forward", preventDefault: true };
    case "ArrowLeft":
      return { type: "seek-back", preventDefault: true, repeated: repeat };
    case "ArrowRight":
      return { type: "seek-forward", preventDefault: true, repeated: repeat };
    case "ArrowUp":
      return { type: "volume-up", preventDefault: true };
    case "ArrowDown":
      return { type: "volume-down", preventDefault: true };
    case "KeyA":
      return { type: "cycle-aspect", preventDefault: true };
    case "KeyM":
      return { type: "toggle-mute" };
    case "KeyF":
      return { type: "fullscreen" };
    case "KeyN":
      return { type: "episode-next", preventDefault: true };
    case "KeyP":
      // Streamly web: Shift+P = previous episode (plain P toggles play there).
      return shiftKey ? { type: "episode-prev", preventDefault: true } : null;
    case "Escape":
      // In fullscreen the browser consumes Esc to exit it — don't also close the
      // player underneath.
      if (fullscreen) return null;
      return { type: panelOpen ? "close-panel" : "close-player" };
    default:
      return null;
  }
}
