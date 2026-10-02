import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { MEDIA_EVENTS, mediaEventToAction } from "./mediaEvents";
import useHlsSource from "./hooks/useHlsSource";

/**
 * The video element, and nothing else (task.md 6.3).
 *
 * ── Why this file has no chrome in it ───────────────────────────────────────
 * Phase 2 deliberately attaches NO UI. The queue's reasoning is in 6.3: prove the
 * 4-server failover ladder before any UI depends on it, because every UI decision
 * downstream — when to show the loader, whether to keep the picture, what to
 * write in the status line — depends on the states being right first. Adding a
 * scrubber now would mean re-deriving all of that against states never yet
 * exercised against a real element.
 *
 * ── Why the element subscribes and the shell only listens ───────────────────
 * One owner per concern. This file owns "which DOM events exist and when they are
 * unsubscribed"; the shell owns "what those events mean". Splitting it that way
 * is what keeps the translation testable without a DOM: `mediaEvents.js` is a
 * pure function, so every mapping is asserted by handing it a name and a state.
 *
 * An earlier draft stashed the current state on the DOM node as a mutable
 * `__pv2State` property so the listener closure could read it. That was implicit
 * coupling between two files through an undocumented expando, for no gain — a
 * ref is the same thing without the surprise.
 */
const PlayerVideo = forwardRef(function PlayerVideo(
  {
    src = "",
    /** Applied imperatively by `useHlsSource`, never as a `src` attribute: whether
     *  a plain `src` works depends on the browser, and handing an HLS playlist to
     *  a browser that cannot play one produces a silent black rectangle. */
    poster = "",
    autoPlay = true,
    muted = false,
    crossOrigin = "anonymous",
    playsInline = true,
    preload = "auto",
    /** Current machine state. Needed to disambiguate `waiting`; see mediaEvents. */
    state = null,
    onAction,
    className = "pv2-video",
    /* Reports the live hls.js engine, owned by `useHlsSource`, straight through.
     * Exists because audio tracks and quality are the only two player settings
     * that are NOT properties of the <video> element — they are hls.js state — so
     * anything that renders a control for them has to reach the engine somehow.
     * A callback into shell state (R4.7): the consumer reads it during render, so
     * it has to arrive as a render input, not a ref an effect writes. */
    onEngine,
    ...rest
  },
  forwardedRef,
) {
  const videoRef = useRef(null);
  const onActionRef = useRef(onAction);

  /* The element node as state, not just a ref: the source has to be attached
   * imperatively (hls.js or a native `src`), which is a side effect that needs a
   * value it can depend on. A callback ref that also sets state is the smallest
   * way to get that — and it is what makes "attach, then attach to the new node"
   * happen at all. */
  const [node, setNode] = useState(null);

  useHlsSource({ node, url: src, onAction, onEngine });

  // Keep the latest callback without re-subscribing. Re-attaching listeners each
  // render would drop events fired between a commit and the next effect — and
  // during a source switch that window is exactly when events matter.
  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  // The handler below closes over this ref, so it reads the CURRENT state without
  // the subscription depending on it. Written in an effect rather than during
  // render: it runs before the subscription effect below, and before any DOM
  // event can possibly fire, so nothing is ever read stale.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const attachRef = useCallback(
    (element) => {
      videoRef.current = element;
      setNode(element);
      if (typeof forwardedRef === "function") forwardedRef(element);
      else if (forwardedRef) forwardedRef.current = element;
    },
    [forwardedRef],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const handle = (event) => {
      const action = mediaEventToAction(event.type, stateRef.current, {
        error: event.target?.error,
      });
      if (action && onActionRef.current) onActionRef.current(action, event);
    };

    MEDIA_EVENTS.forEach((type) => video.addEventListener(type, handle));

    return () => {
      MEDIA_EVENTS.forEach((type) => video.removeEventListener(type, handle));
    };
  }, []);

  return (
    <video
      ref={attachRef}
      className={className}
      poster={poster || undefined}
      autoPlay={autoPlay}
      muted={muted}
      crossOrigin={crossOrigin}
      playsInline={playsInline}
      preload={preload}
      {...rest}
    />
  );
});

export default PlayerVideo;
