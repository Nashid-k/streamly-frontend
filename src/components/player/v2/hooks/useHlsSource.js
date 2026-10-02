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

/**
 * The path of a URL, with any query string and fragment removed.
 *
 * Extensions have to be judged on the path. `https://vidcore.io/?next=master.m3u8`
 * is a provider PAGE, not a playlist, and a regex that ignores the `?` happily
 * calls it HLS - which is the same mistake as handing it to `<video src>`.
 */
function urlPath(url) {
  return String(url || "").split(/[?#]/)[0];
}

/** Is this URL an HLS playlist? */
export function isHlsUrl(url) {
  return /\.m3u8$/i.test(urlPath(url));
}

/* Progressive containers a <video> can play from a plain src. Kept deliberately
 * narrow: a file whose path ends in a real media extension. */
const MEDIA_FILE_RE = /\.(m3u8|mp4|m4v|mov|webm|mkv|ts|ism)$/i;

/**
 * Is this URL something a <video> element could possibly load?
 *
 * This exists because `choosePlaybackMode` used to answer MODE.NATIVE for
 * *everything* that was not `.m3u8`, and a provider page URL is not `.m3u8`.
 * `refUrl` is the REFERRER, so `https://vidcore.io/` reached `<video src>`, the
 * browser tried to decode an HTML page as media, and the `media-src 'self' blob:`
 * CSP blocked the request - which surfaced as a black rectangle with a spinner
 * and no error anywhere. A URL that is not media must be rejected here rather
 * than handed to the element.
 */
export function isPlayableMediaUrl(url) {
  return MEDIA_FILE_RE.test(urlPath(url));
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
  // Not media. Returning NATIVE here is what put a provider homepage into
  // `<video src>`, so the refusal comes BEFORE the progressive branch below:
  // an mp4 is still played natively, but a page URL is never played at all.
  if (!isPlayableMediaUrl(url)) return MODE.NONE;
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
 * @param {(engine: object|null) => void} [options.onEngine] reports the live hls.js
 *   instance (or null), so a caller can hold it and read `audioTracks` / `levels`
 *   and write `audioTrack` / `currentLevel` (task.md R4.1/R4.2, R4.7).
 *
 * ── Why the engine is reported by CALLBACK, not written to a ref (R4.1/R4.7) ──
 * Audio-track and quality selection are the only two player features that cannot
 * be expressed as a property of the `<video>` element: both are hls.js state. The
 * engine is created here and used nowhere else, so while it stayed private the
 * settings sheet could not ask "what audio does this stream carry?".
 *
 * The first attempt published it through an out-param ref that a consumer read
 * during render. That cannot work: this effect runs AFTER render, so the read
 * always saw the previous value — on mount, null — and R4.7's probe caught the
 * panel binding to nothing on every source. A callback lets the caller put the
 * engine in state, which IS a render input, so the panel re-renders when it
 * arrives. The earlier fear that this "tears down the settings sheet" was not
 * true: the sheet is ordinary `useState` in the shell and survives a re-render.
 *
 * Reported from the SAME effect that creates it, and nulled on teardown, so the
 * caller can never hold an engine that was already destroyed.
 */
export default function useHlsSource({ node, url, onAction, onEngine }) {
  const onActionRef = useRef(onAction);
  const onEngineRef = useRef(onEngine);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    onEngineRef.current = onEngine;
  }, [onEngine]);

  useEffect(() => {
    if (!node || !url) return undefined;

    const mode = choosePlaybackMode(url, {
      canPlayNative: canPlayNativeHls(node),
      hlsSupported: Hls.isSupported(),
    });

    if (mode === MODE.UNSUPPORTED) {
      const error = new Error(
        "This browser cannot play HLS, and the streaming engine could not load.",
      );
      logWarn(HLS_SCOPE, "no playback path for this source", error);
      onActionRef.current?.({ type: E.FAIL, error });
      return undefined;
    }

    if (mode === MODE.NONE) {
      // `url` is truthy here, so NONE means the URL is not media at all - a
      // provider page handed over as the stream. Say so instead of returning
      // silently, which left the viewer staring at a spinner forever.
      const error = new Error("This source did not resolve to a playable video file.");
      logWarn(HLS_SCOPE, "resolved URL is not a media file", { url });
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

    // Hand the engine to the caller before wiring it up. This is the render
    // input the panel needs (R4.7), and doing it here — not in a separate mirror
    // effect declared earlier — is what makes the value the panel observes the
    // same instance this effect is about to load.
    onEngineRef.current?.(hls);

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
      hls.off(Hls.Events.ERROR, onError);
      hls.destroy();
      // Nulled only AFTER the engine can no longer emit, so a caller that reads
      // on the way out never touches a half-destroyed instance.
      onEngineRef.current?.(null);
    };
    /* `onEngine` is deliberately NOT a dependency (it is kept in a ref). The
     * engine's lifetime is bound to the node and the url; re-creating it because
     * the caller's callback changed identity would restart playback from zero
     * mid-view. */
  }, [node, url]);
}
