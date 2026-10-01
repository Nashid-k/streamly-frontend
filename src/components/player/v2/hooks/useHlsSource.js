import Hls from "hls.js";
import { useEffect, useRef } from "react";
import { E } from "../playbackMachine";
import { logInfo, logWarn } from "../../../../utils/debugLogger";

const HLS_SCOPE = "PlayerSource:hls";

/** How a given source URL gets onto the element. */
export const MODE = {
  /** No source to play. */
  NONE: "none",
  /** The browser plays it itself (Safari, or any non-HLS file). */
  NATIVE: "native",
  /** hls.js drives the element — the only option on Chrome and Firefox. */
  HLSJS: "hlsjs",
  /** HLS the browser cannot play and hls.js cannot help with. */
  UNSUPPORTED: "unsupported",
};

const NATIVE_HLS_MIME = "application/vnd.apple.mpegurl";

/** Is this URL an HLS playlist? */
export function isHlsUrl(url) {
  return /\.m3u8(\?|#|$)/i.test(String(url || ""));
}

/** Does this browser play HLS with a plain `src`? */
export function canPlayNativeHls(video) {
  if (typeof video?.canPlayType !== "function") return false;
  // Safari answers "maybe"; Chrome/Firefox answer "".
  return Boolean(video.canPlayType(NATIVE_HLS_MIME));
}

/**
 * Pick how to play `url`.
 *
 * The decision is a pure function of (url, capabilities) on purpose. It is the
 * one place where "the player silently does nothing" is decided, and that is
 * invisible in jsdom — `canPlayType` returns "" everywhere except Safari, so a
 * test that renders the component and hopes proves nothing. Injecting the two
 * capabilities makes every branch assertable without a browser.
 *
 * The middle branch is the whole point: native HLS is Safari-only, so without
 * hls.js the player "works" for a few percent of viewers and shows a spinner and
 * a black rectangle for everyone else.
 */
export function choosePlaybackMode(url, caps = {}) {
  const isHls = caps.isHls ?? isHlsUrl(url);
  if (!url) return MODE.NONE;
  if (!isHls) return MODE.NATIVE;
  if (caps.canPlayNative ?? false) return MODE.NATIVE;
  if (caps.hlsSupported ?? true) return MODE.HLSJS;
  return MODE.UNSUPPORTED;
}

/** hls.js config, matching what the legacy player proved against these CDNs. */
const HLS_CONFIG = {
  // Segments come from third-party CDNs without permissive CORS; without this
  // every manifest request fails and the error surfaces as a bare network fault.
  xhrSetup: (xhr) => {
    xhr.withCredentials = false;
  },
  // Enough buffer to ride out a relay hop without stalling every few seconds.
  maxBufferLength: 30,
};

/**
 * Put `url` on the element, by whichever means this browser supports.
 *
 * Owns the hls.js instance, so it also owns its destruction. A surviving Hls
 * keeps polling a dead playlist after the player closes — the single most
 * common leak in a video player, and one that unit tests will happily let pass.
 *
 * @param {object} options
 * @param {HTMLVideoElement|null} options.node the element, or null before attach
 * @param {string} options.url
 * @param {(action: object) => void} [options.onAction]
 */
export default function useHlsSource({ node, url, onAction }) {
  const hlsRef = useRef(null);
  const onActionRef = useRef(onAction);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    if (!node || !url) return undefined;

    const mode = choosePlaybackMode(url, {
      canPlayNative: canPlayNativeHls(node),
      hlsSupported: Hls.isSupported(),
    });

    if (mode === MODE.NONE) return undefined;

    if (mode === MODE.UNSUPPORTED) {
      const error = new Error(
        "This browser cannot play HLS, and the streaming engine could not load.",
      );
      logWarn(HLS_SCOPE, "no playback path for this source", error);
      onActionRef.current?.({ type: E.FAIL, error });
      return undefined;
    }

    if (mode === MODE.NATIVE) {
      logInfo(HLS_SCOPE, "native playback", { url });
      // setAttribute rather than `node.src = url`: identical resource selection,
      // and it keeps this a method call on the element instead of a mutation of
      // something React owns.
      node.setAttribute("src", url);
      return undefined;
    }

    let hls;
    try {
      hls = new Hls(HLS_CONFIG);
    } catch (error) {
      // A constructor throw is not fatal to the player — the viewer is better
      // served by a clear message than by a blank screen with a spinner.
      logWarn(HLS_SCOPE, "streaming engine failed to construct", error);
      onActionRef.current?.({ type: E.FAIL, error });
      return undefined;
    }

    hlsRef.current = hls;

    // Only FATAL errors are actionable. hls.js recovers from transient ones on
    // its own, and surfacing every retry as a failure would show an error banner
    // over a stream that is quietly playing.
    const onError = (_event, data) => {
      if (!data?.fatal) return;
      const detail = data.details || data.type || "unknown";
      logWarn(HLS_SCOPE, `fatal stream error: ${detail}`);
      onActionRef.current?.({
        type: E.FAIL,
        error: new Error(`Playback failed (${detail}).`),
      });
    };

    hls.on(Hls.Events.ERROR, onError);
    hls.loadSource(url);
    hls.attachMedia(node);

    return () => {
      hlsRef.current = null;
      hls.off(Hls.Events.ERROR, onError);
      hls.destroy();
    };
  }, [node, url]);
}
