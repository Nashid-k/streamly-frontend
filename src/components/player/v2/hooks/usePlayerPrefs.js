import { useCallback, useEffect } from "react";
import { useOptionalPreferences } from "../../../../context/preferences";
import {
  aspectNameForId,
  aspectShortNameForId,
  aspectStyleForId,
  nextAspectId,
  normalizeAspectId,
} from "../aspect";
import { logWarn } from "../../../../utils/debugLogger";

/**
 * Playback preferences that belong to the ELEMENT rather than the transport
 * (task.md 3.9): the aspect ratio and the playback rate.
 *
 * ── Why this is a separate hook from `usePlayerControls` ─────────────────────
 * `usePlayerControls` owns viewer-driven TRANSPORT actions against the element
 * (seek, volume, fullscreen) and nothing else. Aspect and rate are different in
 * kind: they are PERSISTED PREFERENCES that happen to be applied to the
 * element. Folding them into the controls hook would make it depend on
 * `PreferencesContext`, so a transport action could not be tested without a
 * provider, and the two concerns would have to be unmocked together.
 *
 * ── `useOptionalPreferences`, not `usePreferences` ──────────────────────────
 * `usePreferences` throws outside a provider. The shell is rendered bare by the
 * wiring and transport suites, and a player that crashes without a preferences
 * tree is a worse failure than one that quietly uses defaults — so a missing
 * provider degrades to "no persistence available" and says so.
 *
 * ── Why the rate is applied here and not declaratively ─────────────────────
 * `playbackRate` is a DOM property with no attribute equivalent, so there is no
 * JSX that can set it. The aspect, by contrast, IS declarative (`object-fit`
 * and a transform are styles) and the shell passes that straight to
 * `PlayerVideo`; only the rate needs this effect.
 */
export default function usePlayerPrefs({ videoNode } = {}) {
  const preferences = useOptionalPreferences();
  const setPreference = preferences?.setPreference;

  /* Normalised on read as well as on write. `setPreference` already rejects bad
   * values, but a preference can also arrive from another tab or a hand-edited
   * localStorage, and an unresolvable aspect id must render Fit rather than
   * propagate into the video's style object. */
  const aspectId = normalizeAspectId(preferences?.aspect);
  const rate = Number(preferences?.playbackRate) || 1;

  const setAspect = useCallback(
    (id) => {
      if (!setPreference) {
        logWarn("player-prefs", "aspect change ignored: no preferences provider", { id });
        return;
      }
      setPreference("aspect", normalizeAspectId(id));
    },
    [setPreference],
  );

  const cycleAspect = useCallback(() => {
    setAspect(nextAspectId(aspectId));
  }, [aspectId, setAspect]);

  const setRate = useCallback(
    (next) => {
      if (!setPreference) {
        logWarn("player-prefs", "rate change ignored: no preferences provider", { next });
        return;
      }
      setPreference("playbackRate", next);
    },
    [setPreference],
  );

  /* Apply the rate to the element. Keyed on the NODE for the same reason the
   * `usePlayerControls` subscription is (see the note there): the element does
   * not exist on the first render, so a ref-keyed effect would miss it and the
   * viewer's chosen speed would never reach the video.
   *
   * Wrapped because engines genuinely throw here — some refuse rates outside a
   * range they support, and an exception here would take the whole player down
   * over a preference. The preference itself stays correct; only the element
   * disagrees, so it is logged rather than swallowed. */
  useEffect(() => {
    if (!videoNode) return;
    try {
      videoNode.playbackRate = rate;
    } catch (error) {
      logWarn("player-prefs", "engine refused playbackRate", {
        rate,
        error: error?.message,
      });
    }
  }, [rate, videoNode]);

  return {
    aspectId,
    aspectName: aspectNameForId(aspectId),
    aspectShortName: aspectShortNameForId(aspectId),
    aspectStyle: aspectStyleForId(aspectId),
    setAspect,
    cycleAspect,
    rate,
    setRate,
    /** Whether persistence is actually available, so the transport can explain
     *  an inert control instead of silently ignoring the press. */
    persistent: Boolean(setPreference),
  };
}
