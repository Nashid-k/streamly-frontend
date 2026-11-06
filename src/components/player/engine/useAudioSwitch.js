/* Audio switching: in-manifest audio groups (`pickAudio`) and sibling-manifest
   dubs (`pickDub`).

   Two different mechanisms behind one menu, and the difference is the reason
   this file exists:

   - An in-manifest pick only writes `hls.audioTrack`. Nothing reloads, so the
     switch is confirmed by an EVENT, and an event that never arrives has to be
     caught: the timeout restores the track that WAS playing (not the target —
     hls.audioTrack already points at the target, and leaving it there both lies
     to the menu and blocks a retry, because re-selecting the same track is a
     no-op in hls.js).
   - A dub is a WHOLE SIBLING MANIFEST, so its switch is a position-preserving
     manifest swap through `pickQualityRef`. The outgoing language keeps playing
     while the new playlist and its first fragments download, which is exactly
     the reported "old audio plays in the bg till the new audio switches" — so
     the pick pauses for the switch's whole life and takes playback back when it
     settles, or when the swap turns out to be impossible.
   - Both PAUSE for the switch's life and both resume from the confirming path,
     never from the failure path only — a rolled-back switch must not strand a
     paused frame either.
   - Every optimistic write (the preferred language, the highlighted row, the
     dead-track mark) is rolled back on failure, because a highlight that claims
     a language nothing is playing is worse than no highlight.

   Behaviour is frozen from the inline version — this is a move, not a rewrite. */

import { logWarn } from "../../../utils/debugLogger";
import { probeSourcePlayable } from "../../../api/nativeHlsLoader";
import { sourceLabel } from "../../../constants/sources";

export default function useAudioSwitch({
  hlsRef,
  videoRef,
  runRef,
  metaRef,
  requestedServerRef,
  sourceHeightRef,
  activeSourceKey,
  activeDubRef,
  audioFailedIndexRef,
  audioPreferenceRef,
  audioSwitchRef,
  audioSwitchTokenRef,
  audioSwitchTimerRef,
  audioStageArmedAtRef,
  dubPickTokenRef,
  dubTracks,
  audioTrackList,
  pickQualityRef,
  pendingResumeRef,
  AUDIO_SWITCH_TIMEOUT_MS,
  DUB_PROBE_TIMEOUT_MS,
  poke,
  setPanel,
  setQualityNote,
  setControlsVisible,
  setStageWhileLoading,
  setServerSwitchStage,
  setSwitchingNote,
  setBuffering,
  setAudioIndex,
  setActiveDub,
  setDeadDubs,
}) {
const pickAudio = (index) => {
  const hls = hlsRef.current;
  if (!hls) {
    // Still resolving: the sheet is the only surface, so say so instead of
    // swallowing the click (a dead-looking row was the whole complaint).
    setQualityNote("The player is still starting — try again in a moment.");
    setControlsVisible(true);
    return;
  }
  const tracks = hls.audioTracks || [];
  const picked = tracks[index];
  if (!picked) {
    setQualityNote("That audio track isn't in this stream. Try another server.");
    setControlsVisible(true);
    return;
  }
  // hls.audioTrack is ALREADY the target when a previous pick timed out, so a
  // plain equality guard made that row permanently unretryable. The failure
  // mark is cleared on any confirmed switch. Re-picking the row that is
  // already playing is still an action — close the sheet instead of ignoring
  // the click.
  if (index === hls.audioTrack && audioFailedIndexRef.current !== index) {
    setPanel(null);
    poke();
    return;
  }
  // Capture what is playing BEFORE the optimistic preference overwrite. A
  // failed pick must not make that language sticky across every later resolve.
  let previousIndex = -1;
  try {
    previousIndex = Number(hls.audioTrack);
  } catch {
    previousIndex = -1;
  }
  const previousPref =
    audioPreferenceRef.current ||
    (previousIndex > 0 && tracks[previousIndex]
      ? { lang: tracks[previousIndex].lang || "", name: tracks[previousIndex].name || "" }
      : null);
  // Remember the language, not the index: a re-resolve (server switch, token
  // refresh) builds a new track list where the same language may sit elsewhere.
  audioPreferenceRef.current = {
    lang: picked.lang || "",
    name: picked.name || "",
  };
  audioFailedIndexRef.current = null;
  // Gate the hls AUDIO_TRACK_* listeners: only a real user pick may put the
  // branded stage up (or take it down). Startup audio loading fires the same
  // events and used to clear a cold-open stage before the first frame.
  const token = (audioSwitchTokenRef.current += 1);
  const hlsAtPick = hls;
  const runAtPick = runRef.current;
  // Pause the outgoing track for the switch's whole life — the swap must not
  // leave the old audio running in the background while the new one loads.
  // `resume` remembers the viewer was listening, so the confirmed-switch
  // path can pick playback up again the moment the new track lands.
  const wasPlayingAtPick = Boolean(videoRef.current && !videoRef.current.paused);
  audioSwitchRef.current = { index, token, resume: wasPlayingAtPick };
  try {
    clearTimeout(audioSwitchTimerRef.current);
  } catch {
    // ignore
  }
  setStageWhileLoading(true);
  setServerSwitchStage(false);
  setSwitchingNote("Switching audio…");
  setBuffering(true);
  audioStageArmedAtRef.current = Date.now();
  poke();
  // Close the sheet so the viewer actually sees the branded loader behind it.
  setPanel(null);
  // If the group is advertised but the manifest never confirms the switch,
  // never leave the stage up forever. Restore the track that WAS playing, not
  // the target: hls.audioTrack already points at the target, and leaving it
  // there both lies to the menu and prevents a retry (re-selecting the same
  // track is a no-op in hls.js).
  audioSwitchTimerRef.current = setTimeout(() => {
    if (audioSwitchTokenRef.current !== token) return;
    if (runRef.current !== runAtPick || hlsRef.current !== hlsAtPick) return;
    if (!audioSwitchRef.current) return;
    audioSwitchRef.current = null;
    audioSwitchTimerRef.current = null;
    audioFailedIndexRef.current = index;
    audioPreferenceRef.current = previousPref;
    if (previousIndex >= 0 && previousIndex !== index) {
      try {
        hlsAtPick.audioTrack = previousIndex;
      } catch {
        // element torn down between the pick and the bound
      }
    }
    setAudioIndex(previousIndex >= 0 ? previousIndex : 0);
    // The switch never confirmed — the outgoing track is back and the viewer
    // was listening, so take playback away from the paused element again.
    if (wasPlayingAtPick && previousIndex >= 0) {
      videoRef.current?.play().catch(() => {});
    }
    setBuffering(false);
    setStageWhileLoading(false);
    setSwitchingNote(null);
    setQualityNote("That audio track didn't start — the provider may not serve it.");
    setControlsVisible(true);
  }, AUDIO_SWITCH_TIMEOUT_MS);
  try {
    if (wasPlayingAtPick) videoRef.current?.pause();
    hls.audioTrack = index;
    setAudioIndex(index);
  } catch (error) {
    // Roll the optimistic preference and label back; the old track keeps
    // playing. The failure mark lets the same row be picked again.
    logWarn("native", "Could not switch the in-manifest audio track.", {
      index,
      message: error?.message,
    });
    audioSwitchRef.current = null;
    try {
      clearTimeout(audioSwitchTimerRef.current);
    } catch {
      // no timer armed
    }
    audioSwitchTimerRef.current = null;
    audioFailedIndexRef.current = index;
    audioPreferenceRef.current = previousPref;
    try {
      const live = Number(hls.audioTrack);
      setAudioIndex(Number.isInteger(live) && live >= 0 ? live : 0);
    } catch {
      setAudioIndex(0);
    }
    // The pick already paused the outgoing track; the switch never started, so
    // hand playback back instead of leaving the viewer on a paused frame.
    if (wasPlayingAtPick) videoRef.current?.play().catch(() => {});
    setBuffering(false);
    setStageWhileLoading(false);
    setSwitchingNote(null);
    setQualityNote("That audio track couldn't be selected.");
    setControlsVisible(true);
  }
};

/* Dub switch: each dub is a SEPARATE HLS manifest (a sibling full-stream
   URL from the resolver's audioTracks, never an in-manifest audio group), so
   switching = swapping the source with pickQuality's position-preserving
   mechanics. Row index 0 is the original soundtrack — picking it swaps back to
   the resolution's own entry URL.

   The row index and the dubTracks index are OFF BY ONE on purpose: the panel
   renders an "Original" row first, so row N is dubTracks[N - 1]. Indexing
   both with the same N played the WRONG language under the clicked label. */
const pickDub = async (index) => {
  // A sibling is NOT provably the original — the provider's own player
  // highlights tracks[0] while playing the main URL — so the two lists must
  // never be conflated.
  if (index === activeDubRef.current) {
    // Re-picking the language already playing is still an action: close the
    // sheet instead of leaving it open with no response.
    setPanel(null);
    poke();
    return;
  }
  const target = index === 0 ? null : dubTracks[index - 1];
  if (index > 0 && !target?.uri) {
    setQualityNote("That audio track isn't listed for this source. Try another server.");
    setControlsVisible(true);
    return;
  }
  // This probe awaits the network. If another dub is picked, the server is
  // switched, or the source ladder is re-resolved before it returns, its
  // result belongs to a stream that is no longer playing.
  const myId = (dubPickTokenRef.current += 1);
  const sourceAtPick = `${requestedServerRef.current || ""}|${sourceHeightRef.current || 0}`;
  // A failover destroys this hls instance mid-probe. A dub result that lands
  // after that belongs to a stream that is no longer playing, even when the
  // requested server/source did not change.
  const hlsAtPick = hlsRef.current;
  const runAtPick = runRef.current;
  const isCurrent = () =>
    dubPickTokenRef.current === myId &&
    `${requestedServerRef.current || ""}|${sourceHeightRef.current || 0}` === sourceAtPick &&
    runRef.current === runAtPick &&
    hlsRef.current === hlsAtPick;
  const meta = metaRef.current;
  // The "Original" row must return to the SAME entry the resolver loaded:
  // for a master source that is the multi-level master (meta.entryUrl), not
  // `variants[0].uri` — `variants` is the per-rendition ladder, so preferring
  // it swapped a 4K-capable master for its lowest rendition and killed ABR.
  // Mirrors entryUrlFor() and the preview target at the top of the file.
  const targetUri =
    index === 0
      ? (meta?.masterLevels ? meta?.entryUrl : meta?.variants?.[0]?.uri || meta?.entryUrl)
      : target.uri;
  if (!targetUri) {
    setQualityNote("This source has no playable URL for that audio track.");
    setControlsVisible(true);
    return;
  }
  // A dub is a whole sibling manifest, so the swap re-downloads the playlist
  // and its first fragments while the OUTGOING language keeps playing — user
  // report: "old audio plays in the bg till the new audio switches". Pause for
  // the switch's whole life and take playback up again when it settles (or
  // when the swap turns out to be impossible and the old track stays).
  const wasPlayingAtPick = Boolean(videoRef.current && !videoRef.current.paused);
  if (wasPlayingAtPick) videoRef.current?.pause();
  const resumePausedPlayback = () => {
    if (!wasPlayingAtPick) return;
    const video = videoRef.current;
    // A viewer who pressed play meanwhile owns the element now.
    if (!video || !video.paused) return;
    Promise.resolve(video.play()).catch((error) => {
      // Same contract as a refused quality resume: log and arm the one-shot
      // resume so the next interaction starts playback.
      pendingResumeRef.current = true;
      logWarn("native", "Browser refused the post-dub-switch auto-resume; playback starts on the next tap.", {
        index,
        code: error?.name || String(error),
      });
    });
  };
  poke();
  // Arm the branded loader BEFORE the probe — a user-initiated dub switch must
  // show the art stage the moment the row is clicked (the in-manifest pick
  // already does; the dub path did not, so a click read as "nothing happens"
  // until the probe + swap finished, with the sheet left open over the stage).
  setStageWhileLoading(true);
  setServerSwitchStage(false);
  setSwitchingNote("Switching audio…");
  setBuffering(true);
  audioStageArmedAtRef.current = Date.now();
  setPanel(null);
  // Prove the target manifest flows BEFORE committing the pick — NHD tokens are
  // time-scoped, and a dead dub must not end up highlighted with the previous
  // audio still playing. (The same gate pickQuality applies to quality rungs.)
  // Bounded: a provider/relay that never answers must not leave the stage up
  // forever. A timeout falls through to the switch itself, which still fails
  // honestly through loadSource + the canplay gate.
  try {
    const probe = await probeSourcePlayable(targetUri, meta?.refUrl, { timeoutMs: DUB_PROBE_TIMEOUT_MS });
    if (!isCurrent()) return;
    if (!probe.ok) {
      // The provider advertises this dub but does not serve it (verified live:
      // Orion lists Hindi/Tamil for tmdb 1101383 and answers HTTP 404 "Main
      // request failed" for both). Previously this returned silently, so the row
      // looked dead — the "audio track won't change" report. Say so AND mark the
      // row, so the viewer stops retrying and picks a working language.
      const label = index === 0 ? "This track" : audioTrackList[index]?.label || "That audio track";
      const serverLabel = sourceLabel(activeSourceKey) || "this server";
      setQualityNote(`${label} isn't available on ${serverLabel} (dead provider track). Try another.`);
      setDeadDubs((prev) => {
        const next = new Set(prev);
        next.add(index);
        return next;
      });
      setStageWhileLoading(false);
      setBuffering(false);
      setSwitchingNote(null);
      setControlsVisible(true);
      // The dead-row explanation renders inside the audio sheet — the armed
      // stage closed it on click, so reopen before handing control back.
      setPanel("audio");
      // The old language never left: hand playback back to the viewer.
      resumePausedPlayback();
      return;
    }
  } catch {
    // probe hiccup (abort/timeout) — let the switch itself decide
    if (!isCurrent()) return;
  }
  if (!isCurrent()) return;
  // A track that proved playable is no longer flagged dead.
  setDeadDubs((prev) => {
    if (!prev.has(index)) return prev;
    const next = new Set(prev);
    next.delete(index);
    return next;
  });
  setQualityNote(null);
  const previousDub = activeDubRef.current;
  activeDubRef.current = index;
  setActiveDub(index);
  let ok = false;
  try {
    ok = await pickQualityRef.current?.(targetUri, null, { dubSwitch: true, preProbed: true });
  } catch {
    // pickQuality never rejects; the catch is future-proofing
    ok = false;
  }
  if (!isCurrent()) return;
  if (ok === false) {
    // The switch never committed (probe/playlist/frame failure). Leaving the
    // row highlighted would claim a language that is not playing — and the
    // next resolve would keep preferring the manifest that just failed.
    activeDubRef.current = previousDub;
    setActiveDub(previousDub);
    const label =
      index === 0
        ? "The original audio"
        : audioTrackList[index]?.label || "That audio track";
    setQualityNote(`${label} didn't start — keeping the previous audio.`);
    setControlsVisible(true);
    // The armed stage closed the sheet on click; the failure explanation
    // renders inside it, so reopen to keep the rollback visible.
    setPanel("audio");
    // The previous language is still the live manifest: resume it.
    resumePausedPlayback();
    return;
  }
  // The new sibling manifest committed — pick up where the pause left off.
  resumePausedPlayback();
};


  return { pickAudio, pickDub };
}
