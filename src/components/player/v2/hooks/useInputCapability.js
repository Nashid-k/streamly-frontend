import { useEffect, useState } from "react";
import {
  INPUT,
  MEDIA_QUERIES,
  classifyInput,
  readMediaCapabilities,
} from "../inputCapability";
import { logInfo } from "../../../../utils/debugLogger";

const SCOPE = "PlayerInput";

/**
 * Live input capability for the player (task.md 3.3-3.4).
 *
 * Three media queries, each with a `change` listener, plus one `pointerdown`
 * listener for the hybrid devices no media query can describe. Returns the
 * classification and the individual facts, so a component can ask the precise
 * question ("can this be hovered?") instead of inferring it from a layout
 * decision.
 *
 * The listeners exist to make the answer *move*. A capability read once cannot
 * respond to a mouse being plugged in, a tablet being folded to keyboard, or the
 * viewer switching from dragging to clicking mid-episode — and every one of those
 * is a real event on a real device.
 */
export default function useInputCapability() {
  const [media, setMedia] = useState(readMediaCapabilities);
  const [lastPointerType, setLastPointerType] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    /* 3.3 — one listener per query. Subscribing to the comma-joined string the
     * old player used would work only in browsers that expose the combined
     * MediaQueryList, and it still could not tell us *which* fact changed. */
    const lists = [];
    const onChange = () => setMedia(readMediaCapabilities());
    for (const query of Object.values(MEDIA_QUERIES)) {
      if (typeof window.matchMedia !== "function") break;
      const list = window.matchMedia(query);
      if (typeof list?.addEventListener !== "function") continue;
      list.addEventListener("change", onChange);
      lists.push(list);
    }

    logInfo(SCOPE, "capability listeners attached", { queries: lists.length });

    return () => {
      for (const list of lists) list.removeEventListener("change", onChange);
    };
  }, []);

  /* 3.4 — `pointerType` is the only signal that distinguishes a Surface or a
   * touchscreen laptop from a tablet. Both report `pointer: coarse`; only the
   * event says whether the viewer just used a finger or a trackpad.
   *
   * `passive` because this runs during a drag and must never delay it — a
   * non-passive listener here is a dropped frame on every scrub. */
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onPointerDown = (event) => {
      const type = event?.pointerType;
      if (!type) return;
      setLastPointerType((current) => (current === type ? current : type));
    };
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const mode = classifyInput({ ...media, lastPointerType });

  return {
    mode,
    isTouch: mode === INPUT.COARSE,
    canHover: Boolean(media.canHover),
    lastPointerType,
  };
}
