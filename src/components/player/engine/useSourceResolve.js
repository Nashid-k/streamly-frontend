/* Source resolving: the attempt loop, warm-resolve handover, relay fallback,
   fatal latch, reload carry.

   This is the last engine slice and the only one that needed the load effect
   itself split. Quality/audio switching (6a/6b) could reach the commit through
   a ref indirection (`pickQualityRef` / `audioSwitchRef`) the player keeps, but
   the resolve logic lived INSIDE the load effect's closure, so the effect had
   to move here first: the run token, the `AbortController`, the media element's
   teardown and the reload carry are all owned by this hook now.

   Behaviour is frozen from the inline version — this is a move, not a rewrite:
   same timers, same listeners, same order of operations, same log messages.

   `mergeBoundaries` is the one component value that cannot be passed directly:
   it is a `useCallback` declared AFTER this hook in the player (its state is
   declared further down), so the player passes a ref it assigns on the same
   render, and the cue-tag callback reads it at playback time. */

import { useEffect } from "react";
import Hls from "hls.js";
import { logDebug, logWarn } from "../../../utils/debugLogger";
import { createStreamlyLoader, probeSourcePlayable } from "../../../api/nativeHlsLoader";
import { takeWarmResolve } from "../../../api/warmResolve";
import { PLAYER_SOURCES, AUTO_SOURCE, sourceByServer, sourceLabel } from "../../../constants/sources";
import { pickInitialBandwidthBits } from "../../../utils/streamTuning";
import { clearPreviewCache } from "../../../api/previewThumbs";
import { buildQualityRows } from "../nativePlayerHelpers";

/* Auto's per-rung ladder upgrades (non-master Auto only). A settled rung walks
   UP one beat at a time when the MEASURED throughput clears the next rung's
   advertised bitrate by AUTO_UPGRADE_HEADROOM — relayed fragments carry their
   real overhead inside the estimate, so the factor stays honest. Providers
   that omit `bandwidth` fall back to mainstream H.264 presets. */
const AUTO_UPGRADE_HEADROOM = 2.2;
const AUTO_UPGRADE_FALLBACK_BITS = {
  240: 5e5,
  360: 8e5,
  420: 1.1e6,
  480: 1.6e6,
  540: 2.2e6,
  576: 2.6e6,
  720: 4e6,
  900: 6e6,
  1080: 9e6,
  1440: 18e6,
  2160: 32e6,
};

export default function useSourceResolve({
  // Media identity: the effect re-runs (full teardown → fresh resolve) when any
  // of these change, exactly as the inline effect did.
  type,
  id,
  season,
  episode,
  title,
  originalLanguage,
  reloadToken,
  // Playback mode. Embed mode must never resolve or attach the hidden native
  // element: the iframe owns playback there, and a late attach would play
  // audio/consume bandwidth behind it.
  playerMode,
  // Engine refs the resolve owns or mirrors.
  videoRef,
  hlsRef,
  metaRef,
  runRef,
  switchTokenRef,
  mediaKeyRef,
  carryRef,
  pendingSeekRef,
  requestedServerRef,
  autoSourceRef,
  sourceHeightRef,
  pendingSourceHeightRollbackRef,
  pendingResumeRef,
  activeDubRef,
  audioPreferenceRef,
  dubPickTokenRef,
  audioSwitchRef,
  audioStageArmedAtRef,
  audioFailedIndexRef,
  audioSwitchTimerRef,
  hasStartedRef,
  autoUriRef,
  autoUriHeightRef,
  autoLevelRef,
  pickQualityRef,
  maybeOfferResumeRef,
  // Assigned after this hook in the player; see the file header.
  mergeBoundariesRef,
  // Stable callbacks from the player's other hooks.
  clearSleepTimer,
  cancelAudioSwitch,
  safeSeek,
  // State setters the commit/teardown paths write.
  setFatal,
  setStatus,
  setBuffering,
  setSpinner,
  setStageWhileLoading,
  setServerSwitchStage,
  setSwitchingNote,
  setRequestedServer,
  setActiveDub,
  setDubTracks,
  setDubOriginalLang,
  setSourceVariants,
  setSourceHeight,
  setEnded,
  setUpNext,
  setSwitchFrame,
  setQualities,
  setAudioTracks,
  setAudioIndex,
  setBufferedSecs,
  setBufferedRanges,
  setAutoLevel,
  setManualHeight,
  setCurrentHeight,
  setResumeOffer,
  setPanel,
  setTransportRelay,
  setQualityNote,
  setDeadDubs,
  setActiveSourceKey,
  setIsMasterMode,
  setActiveUri,
  setAutoMuted,
  // Tuning constants (defined in the player's config block, passed in like the
  // other engine hooks do).
  MAX_CONSECUTIVE_FRAG_FAILURES,
  THROTTLE_BACKOFF_MS,
  SOURCE_RETRIES,
  SOURCE_RETRY_BACKOFF_MS,
  PARSE_TIMEOUT_MS,
  MIN_SWITCH_STAGE_MS,
  BUFFER_DEPTH_SECONDS,
  MIN_BUFFER_SIZE,
  MAX_BUFFER_SIZE,
  BACK_BUFFER_SECONDS,
  INITIAL_BW_BITS,
}) {
  useEffect(() => {
    /* Embed mode is a different player. Running the native resolve here would
       load a hidden HLS stream behind the iframe (audio + bandwidth) and could
       re-attach after the mode switch teardown. The mode is a dependency so
       entering embed runs the previous run's cleanup (abort + detach) and
       leaving it starts a fresh resolve. */
    if (playerMode === "embed") return undefined;
    if (!Hls.isSupported()) {
      setFatal("This browser has no MediaSource support — native playback cannot run here.");
      // Nothing will ever load: clear every loader signal so the banner is not
      // painted over a spinner that can never resolve.
      setStatus("error");
      setBuffering(false);
      setSpinner(false);
      setStageWhileLoading(false);
      setServerSwitchStage(false);
      setSwitchingNote(null);
      return undefined;
    }
    const run = runRef.current + 1;
    runRef.current = run;
    const controller = new AbortController();
    // EPISODE SWITCH = COLD OPEN. hasStartedRef stays true from the previous
    // episode, so without dropping it the spinner effect classifies this wait
    // as a warm stall and shows only the light ring - the viewer never sees
    // the title-logo stage they get on the first episode (user report).
    // Dropping it re-arms the full art stage; `stageWhileLoading` is already
    // true on this path, and the commit block clears it when frames return.
    hasStartedRef.current = false;
    // The source committed by the PREVIOUS run (null on first mount): a dub
    // pin carried across a SERVER switch must not index into the new
    // server's audioTracks — see the publish guard in the commit block.
    const prevSourceKey = metaRef.current?.sourceKey || null;
    // A NEW title/episode drops any manual server pick, so playback always
    // opens on the default AUTO rotation (the ZXC family, health-ordered)
    // instead of whatever server the viewer happened to pick for the PREVIOUS
    // title. A same-media reload
    // (reloadToken bump from pickServer) keeps the key unchanged and so keeps
    // the pick. Done here, synchronously, so the resolve below sees it.
    const mediaKey = `${type}|${id}|${season ?? ""}|${episode ?? ""}`;
    if (mediaKeyRef.current !== mediaKey) {
      mediaKeyRef.current = mediaKey;
      requestedServerRef.current = null;
      setRequestedServer(null);
      activeDubRef.current = 0;
      setActiveDub(0);
      setDubTracks([]);
      setDubOriginalLang("");
      setSourceVariants([]);
      setSourceHeight(0);
      sourceHeightRef.current = 0;
      pendingSourceHeightRollbackRef.current = null;
      // A track chosen for the previous title must not pin the new one.
      audioPreferenceRef.current = null;
      dubPickTokenRef.current += 1;
      clearSleepTimer();
      // A new title/episode is NOT "ended": without this the previous
      // installment's `ended` flag survives the switch and the Up Next card
      // (and the ended overlay) bleeds onto the episode that just started.
      setEnded(false);
      setUpNext(null);
    }
    // Consume any reload carry exactly once, and only for the SAME media — a
    // carry armed for one episode must never reposition another.
    const carry = carryRef.current;
    carryRef.current = null;
    // Queued relative deltas belong to the previous media — never re-apply
    // them onto a fresh stream that starts at 0.
    pendingSeekRef.current = 0;
    const carrySame = Boolean(carry && carry.key === mediaKey);
    const carryPaused = carrySame && Boolean(carry.paused);
    if (!carrySame) setSwitchFrame(null);

    const entryUrlFor = (def, resolved, variant) => {
      // Master sources keep their levels + audio groups on the master, so load the
      // master and let hls.js see them; other sources are per-quality media playlists.
      if (resolved?.source?.multiLevelMaster) return resolved.source?.url;
      return variant?.uri;
    };

    const waitParsed = (hls) =>
      new Promise((resolve, reject) => {
        let settled = false;
        const finish = () => {
          clearTimeout(timer);
          hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
          hls.off(Hls.Events.ERROR, onError);
          controller.signal.removeEventListener("abort", onAbort);
        };
        const timer = setTimeout(() => reject(new Error("Timed out waiting for the playlist")), PARSE_TIMEOUT_MS);
        const onParsed = () => {
          if (settled) return;
          settled = true;
          finish();
          resolve();
        };
        const onError = (_e, data) => {
          if (settled || !data?.fatal) return;
          settled = true;
          finish();
          reject(new Error(data?.details || "hls fatal error"));
        };
        // Abort hygiene: a failover/title switch mid-load used to leave this promise
        // hanging past its 75s timer. Reject immediately on abort.
        const onAbort = () => {
          if (settled) return;
          settled = true;
          finish();
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        };
        hls.on(Hls.Events.MANIFEST_PARSED, onParsed);
        hls.on(Hls.Events.ERROR, onError);
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });

    const startLevelFor = (hls) => {
      // Master sources load their master with level selection on AUTO (-1): forcing
      // the top level first is what stalled 4K playback.
      if (!metaRef.current?.masterLevels || !Array.isArray(hls.levels) || hls.levels.length === 0) return;
      hls.currentLevel = -1;
    };

    const attachAudio = (hls) => {
      const tracks = hls.audioTracks || [];
      if (runRef.current !== run) return;
      // Re-apply a user language preference after a re-resolve / token refresh.
      // Match by lang/name; if missing, fall back to track 0 (original).
      const pref = audioPreferenceRef.current;
      if (pref && Array.isArray(tracks) && tracks.length > 1) {
        try {
          const idx = tracks.findIndex((t) => {
            const lang = t.lang || "";
            const name = t.name || "";
            if (pref.lang && lang && lang === pref.lang) return true;
            if (pref.name && name && name === pref.name) return true;
            return false;
          });
          if (idx > 0 && hls.audioTrack !== idx) {
            // Part of the run's own commit; don't trigger the branded switch UI.
            hls.audioTrack = idx;
          } else if (idx < 0) {
            // Preference unavailable on this server/variant — drop back to original
            // instead of silently keeping a foreign track (also avoid re-applying).
            audioPreferenceRef.current = null;
            if (hls.audioTrack !== 0) {
              hls.audioTrack = 0;
            }
          }
        } catch {
          // ignore
        }
      }
      setAudioTracks(
        tracks.map((t, i) => ({ index: i, name: t.name || t.lang || `Audio ${i + 1}`, lang: t.lang || "" })),
      );
      // hls.js reports -1 until it has selected a default track. A -1 leaked
      // into the menu as "no row selected" on a fresh open; track 0 is what the
      // element is about to play, so show that until the real event lands.
      let live = 0;
      try {
        live = Number(hls.audioTrack);
      } catch {
        live = 0;
      }
      setAudioIndex(Number.isInteger(live) && live >= 0 ? live : 0);
    };

    /* The commit used to drop the stage the moment the PLAYLIST parsed, which
       is before the element has a frame: a server switch showed black between
       the old captured frame and the new one. Keep the branded stage (and the
       captured frame) until a frame is actually decoded — bounded, because a
       paused/slow element may never fire loadeddata. */
    let revealCleanup = () => {};
    const revealStageWhenReady = () => {
      const video = videoRef.current;
      let cleaned = false;
      let finished = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (video) {
          video.removeEventListener("loadeddata", onReady);
          video.removeEventListener("canplay", onReady);
          video.removeEventListener("seeked", onReady);
        }
        clearTimeout(timer);
      };
      const finish = () => {
        if (finished) return;
        if (runRef.current !== run) {
          cleanup();
          return;
        }
        /* A user audio pick that armed after this reveal started owns the
           stage now. The reveal's 2.5s fallback exists only for "no frame ever
           decoded"; letting it fire mid-switch blanked the loader while the
           new track was still loading (the switch's own confirmation or its
           timeout clears the stage). */
        if (audioSwitchRef.current) {
          cleanup();
          return;
        }
        finished = true;
        cleanup();
        setStageWhileLoading(false);
        setServerSwitchStage(false);
        setSwitchingNote(null);
        setSwitchFrame(null);
      };
      if (!video) {
        finish();
        return;
      }
      const ready = () => (video.readyState ?? 0) >= 2 && !video.seeking;
      if (ready()) {
        finish();
        return;
      }
      const onReady = () => {
        if (ready()) finish();
      };
      video.addEventListener("loadeddata", onReady);
      video.addEventListener("canplay", onReady);
      video.addEventListener("seeked", onReady);
      const timer = setTimeout(() => {
        if (runRef.current !== run) {
          cleanup();
          return;
        }
        finish();
      }, 2500);
      revealCleanup = cleanup;
    };

    (async () => {
      setStatus("resolving");
      setFatal(null);
      setQualities([]);
      setAudioTracks([]);
      setAudioIndex(0);
      setDubTracks([]);
      setDubOriginalLang("");
      setActiveDub(0);
      setBuffering(true);
      setBufferedSecs(0);
      setBufferedRanges([]);
      setAutoLevel(true);
      setManualHeight(null);
      setCurrentHeight(null);
      setResumeOffer(null);
      setPanel(null);
      setTransportRelay(false);
      setQualityNote(null);
      setDeadDubs(new Set());
      autoUriRef.current = null;
      autoUriHeightRef.current = null;
      const args = {
        type,
        id,
        season: type === "tv" ? season : undefined,
        episode: type === "tv" ? episode : undefined,
        title,
        // Which language the film is actually in (TMDB). RIVO's Server 1 lists
        // one master per language and does NOT put the original first, so the
        // handler cannot choose the entry master without this.
        originalLanguage,
        // Raw-source resolution pin (0/undefined = Auto) — see pickSourceQuality.
        sourceHeight: sourceHeightRef.current || undefined,
      };
      const stale = () => runRef.current !== run || controller.signal.aborted;
      const abortPromise = () =>
        new Promise((resolve) => {
          if (controller.signal.aborted) resolve("done");
          else controller.signal.addEventListener("abort", () => resolve("done"), { once: true });
        });
      const sleep = (ms) =>
        new Promise((resolve) => {
          if (controller.signal.aborted) return resolve();
          const timer = setTimeout(() => resolve(), ms);
          controller.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      // A failure that smells like an expired token (VidCore path tokens rotate) is not a dead CDN.
      const isAuthFatal = (detail) =>
        /\[relay:(segment-fetch-failed|manifest-fetch-failed)\]/.test(detail || "") ||
        /failed \((401|403|429)\)/.test(detail || "");
      const pickSmooth = (list) =>
        list.filter((v) => (v.height || 0) > 0 && (v.height || 0) <= 1080).sort((a, b) => (b.height || 0) - (a.height || 0))[0] ||
        list[0];

      // Set when any source attempt dies on an upstream 429 (see reportFatal).
      // The final banner reads it: vidzen's 2026-09 delivery fleet quota-dies
      // with Cloudflare "error code: 1027" — the browser logs an opaque CORS
      // error while the real story is the provider's daily quota, so the banner
      // should say THAT instead of a bare "no stream".
      let anyUpstreamQuota = false;

      // The position a re-run of THIS effect must resume at. Seeded from the
      // reload carry (server/source pick, manual retry) and then kept honest by
      // the fatal-latch below, so a MID-PLAY failover to another source picks
      // up where the viewer actually was — a non-auth fatal used to restart the
      // whole run with no carry and began again at 0.
      let carryAt = carrySame && carry.at > 0 ? carry.at : null;

      // One pass at a source: true = settled (caller stops), false = transient (retryable
      // warm-up/empty/flaky), "off" = terminal (the provider doesn't have this title).
      const runSourceOnce = async (defArg, bypassCache) => {
        // Auto rotation resolves through AUTO_SOURCE (the backend picks the
        // healthiest server in one round trip); a Servers-menu pick overrides it
        // for one pass (stale() guards everything as usual).
        let def = defArg || PLAYER_SOURCES.find((s) => s.key === requestedServerRef.current) || null;
        if (!def) return false;
        let resolved = null;
        try {
          // Warm-resolve handover (PLAN.md P0.4): the details page may have
          // pre-minted the token while the viewer read the synopsis — consume it
          // instead of re-paying the resolve leg. The handover is one-shot and
          // refuses ANY manual server pick (a pick must resolve THAT server, not
          // a warm token minted for the auto path).
          // The warm token was minted for the plain auto path, so a custom
          // server priority must not consume it (it would play a server the
          // order says is not first).
          const autoDef = autoSourceRef.current;
          const warm =
            autoDef === AUTO_SOURCE
              ? takeWarmResolve(args, { sourceKey: requestedServerRef.current })
              : null;
          resolved = warm || (await def.resolve(args, { signal: controller.signal, bypass: bypassCache }));
        } catch (error) {
          if (error?.code === "no-source") return "off";
          return false;
        }
        // The resolve above can outlive this run (server switch, title change):
        // its result belongs to a stream that no longer exists.
        if (stale()) return true;
        // The backend echoes the server that ACTUALLY served this — for the
        // automatic path because it picks one, and for a manual `prefer` pick
        // because it may fall through when the picked backend has no source.
        // Map it onto its real row so the label, the Servers-menu highlight and
        // any token-refresh retry all speak about the server actually playing.
        // A manual pick that fell through says so, instead of silently playing a
        // different server behind the viewer's back.
        const servedKey = sourceByServer(resolved?.server)?.key || null;
        if (servedKey && servedKey !== def.key) {
          if (requestedServerRef.current && requestedServerRef.current !== servedKey) {
            setSwitchingNote(
              `${sourceLabel(requestedServerRef.current)} has no stream — playing ${sourceLabel(servedKey)}`,
            );
          }
          def = sourceByServer(resolved.server);
        }
        let variants = resolved?.variants || [];
        if (variants.length === 0) {
          // Empty is not terminal: the catalogue returns empty lists when rate-flaky.
          return false;
        }
        // Sibling-URL dubs ride OUTSIDE the ladder (resolved.audioTracks); variants
        // above is rewritten by the token-refresh path, so the dub list keeps the
        // FIRST resolution's — sibling URLs never refresh tokens anyway.
        const dubTracks = Array.isArray(resolved?.audioTracks) ? resolved.audioTracks : [];
        const dubOriginalLang =
          typeof resolved?.audioOriginalLang === "string" ? resolved.audioOriginalLang : "";
        // The server reports the distinct raw source resolutions it can offer for
        // THIS server/title (>1 only), which drives the "Source quality" row. The
        // pick itself lives in sourceHeightRef and is NOT reset here — the reload
        // that a pick triggers re-runs this effect, and a reset would undo it.
        setSourceVariants(Array.isArray(resolved?.sourceVariants) ? resolved.sourceVariants : []);

        let liveSource = resolved.source;
        let liveRefUrl = resolved.source?.refUrl || resolved.source?.url;
        // ABR seed — navigator.connection as a PRIOR for how the ladder opens
        // and upgrades (hls.js's own measurement wins after the first
        // segments). Absent the API (Safari, Firefox) this is the fixed seed.
        const streamSeedBits = pickInitialBandwidthBits(
          typeof navigator !== "undefined" ? navigator.connection : undefined,
          INITIAL_BW_BITS,
        );
        // Master sources ship levels + audio groups in ONE url; others are per-rendition.
        const isMaster = Boolean(liveSource?.multiLevelMaster);
        // attempt 0 = initial URLs; attempt 1 = one token-refresh re-resolve.
        let preferHeight = null;
        // A reload carry (server/source pick, manual retry) — or the fatal-latch
        // from an earlier attempt in this run — repositions this run the same
        // way the token-refresh path below does.
        let resumeTime = carryAt;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (stale()) return true;
          const pool = preferHeight != null ? variants.filter((v) => (v.height || 0) === preferHeight) : [];
          // Smooth start: open on the tallest rendition ≤1080p (a 4K segment needs
          // ~20Mbps sustained — opening there is what stalled playback after 5-10s).
          let smoothStart = pool[0] || pickSmooth(variants);
          // A pinned dub re-opens on ITS OWN sibling manifest (the token-refresh
          // attempt below), not the original-language entry — the position restore
          // then lands the viewer back inside the dub they were watching.
          // Row index N is dubTracks[N - 1] (row 0 is the original).
          const pinnedDub =
            activeDubRef.current > 0 && activeDubRef.current <= dubTracks.length
              ? dubTracks[activeDubRef.current - 1]
              : null;
          if (pinnedDub) {
            smoothStart = { uri: pinnedDub.uri, height: 0 };
          }
          let entryUrl = pinnedDub?.uri || entryUrlFor(def, { source: liveSource }, smoothStart);
          if (!entryUrl) {
            return false;
          }
          // Playability gate: prove one real media byte flows before hls.js sees the
          // source, or a perfect ladder over dead segments plays as a black screen.
          let probe = { ok: false, reason: "probe error" };
          try {
            probe = await probeSourcePlayable(entryUrl, liveRefUrl, { signal: controller.signal });
          } catch (error) {
            if (error?.name === "AbortError" || stale()) return true;
            probe = { ok: false, reason: error?.message || "probe error" };
          }
          if (stale()) return true;
          if (!probe.ok) {
            // A provider whose delivery fleet is quota-dead fails HERE (the
            // probe's relay sip rides the same 429). Flag it for the final
            // banner so "all sources came up empty" can name the real cause.
            if (/\b429\b|quota/i.test(probe.reason || "")) anyUpstreamQuota = true;
            return false;
          }
          setTransportRelay(probe?.via === "relay");
          // Relay delivery is latency-bound (fresh serverless round trip per chunk),
          // so the auto OPEN is seeded by the connection prior, not a blind cap: a
          // connection that comfortably sustains 1080p (the seed knows) opens ON
          // 1080p even through the relay; a modem-pace seed keeps the old ≤720p
          // guard. The upgrade walker below still corrects this with MEASURED
          // bandwidth once fragments bite.
          const autoTopHeight =
            probe?.via === "relay" && streamSeedBits < 25_000_000 ? 720 : 1080;
          if (!isMaster && (smoothStart?.height || 0) > autoTopHeight) {
            const relayFriendly = variants
              .filter((v) => (v.height || 0) > 0 && (v.height || 0) <= autoTopHeight)
              .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
            if (relayFriendly && relayFriendly.uri !== smoothStart?.uri) {
              smoothStart = relayFriendly;
              entryUrl = pinnedDub?.uri || entryUrlFor(def, { source: liveSource }, smoothStart);
              // A per-quality source whose variant lacks a uri must not reach
              // hls.loadSource(undefined) — that surfaced as ?url=undefined at
              // the worker (500 + CORS noise) instead of a clean failover.
              if (!entryUrl) {
                return false;
              }
            }
          }
          try {
            hlsRef.current?.destroy();
          } catch {
            // previous instance already gone
          }
          hlsRef.current = null;
          // Byte cap scaled so the top rendition we serve can get BUFFER_DEPTH_SECONDS ahead.
          const topBps = variants.reduce((m, v) => Math.max(m, Number(v.bandwidth) || 0), 0) || 8 * 1000 * 1000;
          const maxBufferSize = Math.min(
            MAX_BUFFER_SIZE,
            Math.max(MIN_BUFFER_SIZE, Math.ceil((topBps / 8) * BUFFER_DEPTH_SECONDS * 3)),
          );
          // Start-conservative, pick-liberal: fragments come through the Vercel relay with
          // parallel range chunking, so a manual tall pick may try and the buffer-floor
          // step-down negotiates back down. We do NOT yank a user's 4K/1080p pick (every
          // source is relay-only on the free tier; banning tall rungs bans everything).
          // Startup stays ≤720p over relay; master sources self-adjust.
          const hls = new Hls({
            loader: createStreamlyLoader({
              getRefUrl: () => liveRefUrl,
              onRelayPath: () => {
                setTransportRelay(true);
              },
              onDirectPath: () => {
                setTransportRelay(false);
              },
              // Manifest cue tags, when present, replace the guessed skip windows.
              onCueBoundaries: (bounds) => mergeBoundariesRef.current?.(bounds, "cues"),
            }),
            // ABR + progressive MSE appends: chunks hit the screen while the segment is
            // still arriving. The back buffer stays small so device RAM stays bounded.
            abrEnabled: true,
            progressive: true,
            // The loader's watchdog is an INACTIVITY timer (it re-arms on every
            // progress chunk — see nativeHlsLoader), so 15s means "no bytes for
            // 15s = dead hop", not "the segment must finish in 15s". The old 30s
            // held a seek/stall spinner for half a minute per attempt, and 8
            // retries stretched a dead origin's detection into minutes; with the
            // re-arming watchdog, failover now trips in under a minute worst case.
              fragLoadingTimeOut: 15000,
              fragLoadingMaxRetry: 5,
              manifestLoadingTimeOut: 20000,
              manifestLoadingMaxRetry: 4,
              levelLoadingTimeOut: 20000,
              levelLoadingMaxRetry: 4,
            maxBufferLength: BUFFER_DEPTH_SECONDS,
              maxMaxBufferLength: 180,
            maxBufferSize,
            backBufferLength: BACK_BUFFER_SECONDS,
            // Auto starts mid-ladder (INITIAL_BW_BITS) so quality doesn't climb rung-by-rung.
            initialBandwidthEstimate: streamSeedBits,
            // Judge ABR by MEASURED bytes/sec, not the advertised bitrate (relayed sources
            // lie), and never exceed the rendered size — a small window doesn't need 1080p
            // and every rung saved off the relay is one fewer stall.
            abrMaxWithRealBitrate: true,
            capLevelToPlayerSize: true,
          });
          hlsRef.current = hls;
          let lastFatalDetail = "";
          let resolveFatal = null;
          const fatalLater = new Promise((resolve) => {
            resolveFatal = resolve;
          });
          const reportFatal = (data) => {
            const frag = data?.frag;
            lastFatalDetail =
              `${data?.details || "error"}` +
              (data?.error?.message ? ` (${data.error.message})` : "") +
              (frag ? ` [sn ${frag.sn ?? "?"} ${String(frag.url || "").slice(0, 90)}]` : "");
            // Logs name the PROVIDER, not the generic row: "Server 4" in a
            // console tells you nothing, `zxc-centaurus` tells you which
            // backend to go debug. The viewer-facing status line keeps the generic name.
            if (/\b429\b|quota/i.test(lastFatalDetail)) anyUpstreamQuota = true;
            logWarn("native", `${def.provider} (${def.label}) fatal during playback`, {
              sourceKey: def.key,
              details: data?.details,
              message: data?.error?.message,
              fragSn: frag?.sn ?? null,
            });
          };
          const failOver = () => {
            // Latch the REAL position first: destroy() detaches the media, and a
            // detach resets currentTime to 0 — without this every re-run of the
            // failed run (token refresh, same-source retry, rotation to another
            // server) resumed at 0 instead of where the viewer actually was.
            const lastT = videoRef.current?.currentTime || 0;
            if (lastT > 0) carryAt = lastT;
            // This instance is about to die: any quality/dub continuation parked
            // on it must never write into the next run, and an in-flight audio
            // switch's listeners die with it.
            switchTokenRef.current += 1;
            cancelAudioSwitch();
            try {
              hls.destroy();
            } catch {
              // already torn down
            }
            hlsRef.current = null;
            resolveFatal?.();
          };
          // Non-fatal fragment failures never reach the attempt log, yet a loop of them IS
          // the black screen (vidzen 429s) — count them and fail over ourselves.
          let consecFragFails = 0;
          hls.on(Hls.Events.FRAG_BUFFERED, () => {
            consecFragFails = 0;
          });
          hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
            // A heightless media playlist reports 0/null; keep the last real
            // height rather than drive the dialog to "0p" after a full-reload
            // switch (that path now also seeds currentHeight from the pick).
            if (data?.height) setCurrentHeight(data.height);
          });
          hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => attachAudio(hls));

          const clearAudioSwitch = () => {
            const pending = audioSwitchRef.current;
            if (!pending) return;
            audioSwitchRef.current = null;
            audioFailedIndexRef.current = null;
            try {
              clearTimeout(audioSwitchTimerRef.current);
            } catch {
              // ignore
            }
            audioSwitchTimerRef.current = null;
            // The pick paused the outgoing track for the switch's whole life, so
            // the resume lives HERE — not in the AUDIO_TRACK_SWITCHED listener.
            // hls.js fires AUDIO_TRACK_LOADED first and that handler also calls
            // us; resuming only from the later event left the element paused
            // forever whenever the load event won the race (user report: audio
            // switched but playback stayed stopped).
            const resumeAfterSwitch = () => {
              if (!pending.resume) return;
              const video = videoRef.current;
              // A viewer who pressed play during the hold owns the element now.
              if (!video || !video.paused) return;
              // A strict autoplay policy can reject this (it runs outside the
              // click gesture): log it and arm the same one-shot resume a
              // refused quality switch uses, instead of mounting a second
              // blocked play() attempt here.
              Promise.resolve(video.play()).catch((error) => {
                pendingResumeRef.current = true;
                logWarn("native", "Browser refused the post-audio-switch auto-resume; playback starts on the next tap.", {
                  index: pending.index,
                  code: error?.name || String(error),
                });
              });
            };
            const finish = () => {
              audioSwitchTimerRef.current = null;
              if (runRef.current !== run) return;
              setBuffering(false);
              setStageWhileLoading(false);
              setSwitchingNote(null);
              resumeAfterSwitch();
            };
            // Confirmed in under a frame? Hold the stage for the rest of its
            // minimum so the pick is visible (see MIN_SWITCH_STAGE_MS).
            const remaining = MIN_SWITCH_STAGE_MS - (Date.now() - audioStageArmedAtRef.current);
            if (remaining > 0) {
              audioSwitchTimerRef.current = setTimeout(finish, remaining);
              return;
            }
            finish();
          };

          // Startup audio loading moves the default track too. The menu must
          // follow it even when no USER pick is pending (the stage must not).
          const syncAudioIndex = () => {
            try {
              const live = Number(hlsRef.current?.audioTrack);
              setAudioIndex(Number.isInteger(live) && live >= 0 ? live : 0);
            } catch {
              setAudioIndex(0);
            }
          };

          if (Hls.Events.AUDIO_TRACK_SWITCHING) {
            hls.on(Hls.Events.AUDIO_TRACK_SWITCHING, () => {
              if (runRef.current !== run) return;
              if (!audioSwitchRef.current) return;
              setBuffering(true);
              setStageWhileLoading(true);
              setServerSwitchStage(false);
              setSwitchingNote("Switching audio…");
            });
          }
          if (Hls.Events.AUDIO_TRACK_SWITCHED) {
            hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
              if (runRef.current !== run) return;
              const pending = audioSwitchRef.current;
              if (!pending) {
                syncAudioIndex();
                return;
              }
              // A rapid second pick moved the target while this event was in
              // flight: only the track that is actually selected may settle it.
              try {
                if ((hls.audioTrack ?? 0) !== pending.index) return;
              } catch {
                // fall through: the event itself is the confirmation
              }
              // clearAudioSwitch resumes the paused element once the stage has
              // served its minimum — the confirmation is all this listener owes.
              clearAudioSwitch();
              syncAudioIndex();
            });
          }
          if (Hls.Events.AUDIO_TRACK_LOADED) {
            hls.on(Hls.Events.AUDIO_TRACK_LOADED, () => {
              if (runRef.current !== run) return;
              // Only clear for an actual user-initiated in-manifest audio switch.
              const pending = audioSwitchRef.current;
              if (!pending) {
                syncAudioIndex();
                return;
              }
              try {
                if ((hls.audioTrack ?? 0) !== pending.index) return;
              } catch {
                // fall through: the event itself is the confirmation
              }
              clearAudioSwitch();
              syncAudioIndex();
            });
          }
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data?.fatal) {
              if (
                data?.details === "fragLoadError" ||
                data?.details === "fragLoadTimeout" ||
                data?.details === "levelLoadError"
              ) {
                consecFragFails += 1;
                // Multi-level sources step down early so hls.js's own retry has a chance instead
                // of re-burning the same doomed fragment. Only in PURE AUTO (manualLevel -1):
                // a pinned rung goes straight to failover.
                const isPureAuto =
                  Number.isInteger(hls.manualLevel) && hls.manualLevel < 0;
                const autoRung = hls.autoLevel ?? -1;
                const canStepDown =
                  Array.isArray(hls.levels) &&
                  hls.levels.length > 1 &&
                  isPureAuto &&
                  Number.isInteger(autoRung) &&
                  autoRung > 0;
                if (consecFragFails >= 2 && canStepDown) {
                  hls.currentLevel = autoRung - 1;
                  consecFragFails = 0;
                                  } else if (consecFragFails >= MAX_CONSECUTIVE_FRAG_FAILURES) {
                  reportFatal({ ...data, fatal: true, details: `${data.details} (×${consecFragFails} consecutive — giving up)` });
                  failOver();
                }
              }
              return;
            }
            reportFatal(data);
            failOver();
          });
          try {
            hls.loadSource(entryUrl);
            hls.attachMedia(videoRef.current);
            await waitParsed(hls);
          } catch {
            // The instance never committed: invalidate every quality/dub/audio
            // continuation parked on it before tearing it down.
            switchTokenRef.current += 1;
            cancelAudioSwitch();
            try {
              hls.destroy();
            } catch {
              // already torn down
            }
            hlsRef.current = null;
            return false;
          }
          if (stale()) return true;
          metaRef.current = {
            variants,
            sourceKey: def.key,
            refUrl: liveRefUrl,
            masterLevels: isMaster,
            entryUrl,
          };
          // Single write point for the live source, so this is the single place
          // that has to announce it. Runs for a manual pick AND for the loader's
          // own fail-over, which is the case the ref could not express.
          setActiveSourceKey(def.key);
          // A fresh resolution carries a fresh referer token — thumbnails from
          // the previous one are dead weight; the preview decoder remounts.
          clearPreviewCache(def.key);
          startLevelFor(hls);
          // One row per DISTINCT LABEL: providers list several renditions of the
          // same rung (640x272 + 640x360 both read "480p"), which showed as
          // duplicate menu rows. Rows carry their RAW height so level matching
          // (highlight, step-down) keeps comparing like with like.
          setQualities(buildQualityRows(variants));
          // Publish this run's dub list — unless a dub pin carried over from
          // a DIFFERENT server (a Servers-menu switch): a stale index must not
          // auto-pin a dub on the new server (its attempt loop would re-open
          // a dead old token). Same-server re-runs keep the pin by design.
          if (activeDubRef.current > 0 && def.key !== prevSourceKey) {
            activeDubRef.current = 0;
            setActiveDub(0);
            setDubTracks([]);
            setDubOriginalLang("");
          } else {
            setDubTracks(dubTracks);
            setDubOriginalLang(dubOriginalLang);
            setActiveDub(activeDubRef.current);
          }
          setIsMasterMode(isMaster);
          setActiveUri(isMaster ? null : smoothStart?.uri || null);
          // Remember the rung the player negotiated (non-master "Auto").
          autoUriRef.current = isMaster ? null : smoothStart?.uri || null;
          autoUriHeightRef.current = isMaster ? null : smoothStart?.height ?? null;
          // Measured-progression Auto for a per-rung ladder (a master rides
          // hls.js ABR instead). The settle rung is a latency-aware prior; once
          // real fragments measure the pipe, an estimate that comfortably
          // clears the next rung walks the ladder UP — the old fixed rung kept
          // a fast connection at the open quality for the whole film. A
          // manually pinned rung stays manual (autoLevelRef), and a pinned dub
          // keeps its language (its sibling manifests are single-rung — an
          // upgrade here would silently drop the audio). Each upgrade rides
          // pickQuality's own probe/rollback path; a refused rung is
          // attempt-locked so the ladder cannot thrash against a lying
          // sibling. Listeners die with this hls instance at every teardown.
          if (!isMaster) {
            const autoLadder = variants
              .filter((v) => (v.height || 0) > 0)
              .sort((a, b) => (a.height || 0) - (b.height || 0));
            const baseHeight = smoothStart?.height || 0;
            const attemptedRungs = new Set([baseHeight]);
            hls.on(Hls.Events.FRAG_BUFFERED, () => {
              if (stale() || hlsRef.current !== hls) return;
              if (!autoLevelRef.current || activeDubRef.current > 0) return;
              const estimate = hls.bandwidthEstimate || 0;
              if (estimate <= 0) return;
              for (const next of autoLadder) {
                const h = next.height || 0;
                if (h <= baseHeight || h > autoTopHeight || attemptedRungs.has(h)) continue;
                const advertised = Number(next.bandwidth) || 0;
                const need =
                  (advertised > 0 ? advertised : AUTO_UPGRADE_FALLBACK_BITS[h] || 0) *
                  AUTO_UPGRADE_HEADROOM;
                if (need > 0 && estimate >= need) {
                  attemptedRungs.add(h);
                  pickQualityRef.current?.(next.uri, h, { auto: true });
                }
                break; // one rung per buffered fragment; a taller rung needs this one proven
              }
            });
          }
          attachAudio(hls);
          // A real "playing" phase, not a label: consumers (the paused centre
          // transport in CenterStack, the low-buffer ABR step-down below) test
          // `status === "playing"` by exact equality, so the server name must
          // never be folded into this string or both go dead. The provider name
          // is already carried by `switchingNote`/the Servers menu.
          setStatus("playing");
          // This run committed: a source-quality pick (if any) is no longer
          // pending, so a later failure must not roll back to an older rung.
          pendingSourceHeightRollbackRef.current = null;
          // Restore the position BEFORE arming the reveal gate, so the first
          // decoded frame is the resumed one rather than the new stream's 0:00.
          if (resumeTime != null) {
            safeSeek(resumeTime);
            resumeTime = null;
          }
          // The stage comes down when a frame exists, not when the playlist
          // parses (see revealStageWhenReady).
          revealStageWhenReady();
          // A switch made while PAUSED stays paused (pickQuality's rule): the
          // commit's play() runs outside the click gesture, so it would also
          // fight the autoplay policy on the way.
          if (!carryPaused) {
            try {
              await videoRef.current?.play();
            } catch {
              // Muted autoplay is allowed, an unmuted play() outside a user-activation window
              // is not: try unmuted, else play muted + hint at "Tap to unmute".
              try {
                videoRef.current.muted = true;
                setAutoMuted(true);
                await videoRef.current.play();
              } catch (error) {
                // Even muted playback was refused: the element cannot start
                // without a gesture, so leave it paused and let the viewer press
                // play. The log is dev-only and keeps the reason traceable.
                logDebug("player", "Muted autoplay after a quality switch was refused.", {
                  message: error?.message,
                });
              }
            }
          }
          // Non-master sources are single-rendition: their current height is fixed.
          const seedHeight = smoothStart?.height || variants?.find((v) => (v.height || 0) > 0)?.height || null;
          if (seedHeight) setCurrentHeight(seedHeight);
          // Honest Auto/active state for the quality menu: a master opened on
          // real ABR; a fixed ladder (single-variant HLS) has no ABR to be auto
          // WITH — Auto there just replays the open rung. Without this the
          // menu showed no active row on NHD/ZXC until the viewer picked one.
          setAutoLevel(isMaster);
          // Streamly resume gate: first real playback for this title/episode.
          maybeOfferResumeRef.current();
          // A fatal error AFTER playback started either refreshes tokens in place (same
          // source/quality, resume position) or moves on — never a dead "playing" screen.
          const parked = await Promise.race([fatalLater.then(() => "fatal"), abortPromise()]);
          if (parked === "done") return true;
          // The stream died mid-play (expired token, dead CDN, quota'd relay):
          // the frozen frame belongs to a source that is no longer delivering,
          // so bring the art stage back over it for the reconnect/rotation wait.
          // Cold-open state, exactly like a server switch — hasStartedRef must
          // be dropped too, or the spinner effect would classify the next stall
          // as a "warm" one and hide the stage this open just armed.
          hasStartedRef.current = false;
          setStageWhileLoading(true);
          setSwitchingNote("Reconnecting…");
          // A pinned dub whose token died mid-play cannot refresh in place — its
          // sibling URL is fixed — so drop back to the original track and let the
          // token-refresh re-resolve below mint a fresh ladder for it.
          if (activeDubRef.current > 0 && isAuthFatal(lastFatalDetail) && !stale()) {
            activeDubRef.current = 0;
            setActiveDub(0);
          }
          if (attempt === 0 && isAuthFatal(lastFatalDetail) && !stale()) {
            const savedT = videoRef.current?.currentTime || 0;
            // A quota/429 is a THROTTLE, not an expired token: re-resolving the
            // instant it fires spends another request on an origin that is
            // already refusing us, which is how one momentary limit turned into a
            // cascade through every server (and 1-4 are the same provider, so the
            // failover could not have helped). Hold off long enough for the limit
            // to clear, then re-resolve on this same source. Switching note so the
            // wait reads as intent rather than a hung player.
            const throttled = /\b429\b/.test(lastFatalDetail || "");
            if (throttled) {
              setSwitchingNote(`${def.label}: provider rate-limited, retrying shortly...`);
              await sleep(THROTTLE_BACKOFF_MS);
              if (stale()) return true;
                }
            let fresh = null;
            try {
              // bypass: the cached payload is the one the probe just proved dead
              // — a token refresh must actually re-resolve, not replay it.
              fresh = await def.resolve(args, { signal: controller.signal, bypass: true });
            } catch {
              fresh = null;
            }
            // Dub tracks survive: the fresh re-resolve rewrites the LADDER only,
            // so a pinned dub keeps playing across the token refresh.
            const freshVariants = fresh?.variants || [];
            if (fresh && freshVariants.length > 0) {
              preferHeight = smoothStart?.height ?? null;
              resumeTime = savedT;
              variants = freshVariants;
              liveSource = fresh.source;
              liveRefUrl = fresh.source?.refUrl || fresh.source?.url;
              continue;
            }
          }
          return false;
        }
        return false;
      };

      const runSource = async (def) => {
        for (let retry = 0; ; retry += 1) {
          if (stale()) return true;
          if (retry > 0) {
            if (retry > SOURCE_RETRIES) return false;
            await sleep(SOURCE_RETRY_BACKOFF_MS[retry - 1] ?? 1200);
            if (stale()) return true;
          }
          // A retry means the previous attempt (possibly from the prefetch
          // cache) did not play, so bypass the cache and resolve live.
          const outcome = await runSourceOnce(def, retry > 0);
          if (outcome === true) return true;
          if (outcome === "off") return false;
        }
      };

      // A Servers-menu pick plays ONLY that server (its own retry + token-
      // refresh machinery still applies). The no-pick path resolves through
      // AUTO_SOURCE: the server walks its health-ordered backends in ONE round
      // trip, so a dead backend no longer costs the viewer four more client
      // requests before playback. Silently falling back to another provider on
      // an explicit pick would lie about what the viewer chose — the fatal
      // message points at the Servers menu instead.
      if (requestedServerRef.current) {
        if (await runSource(null)) return;
      } else if (await runSource(autoSourceRef.current)) {
        return;
      }
      if (stale()) return;
      setStatus("error");
      // Terminal failure: the fatal banner is the only thing on screen, so the
      // branded stage/spinner must not keep spinning behind it. Same for any
      // in-flight switch continuation — its listeners died with this run.
      switchTokenRef.current += 1;
      dubPickTokenRef.current += 1;
      cancelAudioSwitch();
      setBuffering(false);
      setStageWhileLoading(false);
      setServerSwitchStage(false);
      setSwitchingNote(null);
      // A source-quality pin is a request to the provider. If that request is
      // what failed, restore the last ladder that worked so "Try again" is not
      // doomed to repeat the dead rung.
      let restoredHeight = null;
      if (pendingSourceHeightRollbackRef.current != null) {
        restoredHeight = pendingSourceHeightRollbackRef.current;
        pendingSourceHeightRollbackRef.current = null;
        if (sourceHeightRef.current !== restoredHeight) {
          sourceHeightRef.current = restoredHeight;
          setSourceHeight(restoredHeight);
        }
      }
      const quotaHit = anyUpstreamQuota;
      const qualityNote = restoredHeight != null ? ` Restored the previous source quality (${restoredHeight ? `${restoredHeight}p` : "Auto"}).` : "";
      setFatal(
        requestedServerRef.current
          ? `${sourceLabel(requestedServerRef.current)} had no playable stream${quotaHit ? " (provider hit its daily delivery quota, HTTP 429 — try again later)" : ""} — try another server (gear → Servers).${qualityNote}`
          : `No native source resolved this title (all sources came up empty).${
              quotaHit
                ? " At least one provider hit a daily delivery quota (HTTP 429) — try again later or pick another server."
                : ""
            }${qualityNote}`,
      );
    })();

    return () => {
      controller.abort();
      try {
        revealCleanup();
      } catch {
        // listeners already detached
      }
      try {
        hlsRef.current?.destroy();
      } catch {
        // already torn down
      }
      hlsRef.current = null;
      switchTokenRef.current += 1;
      dubPickTokenRef.current += 1;
      cancelAudioSwitch();
      try {
        videoRef.current?.removeAttribute?.("src");
      } catch {
        // element already detached
      }
    };
  }, [type, id, season, episode, title, reloadToken, playerMode, clearSleepTimer, cancelAudioSwitch]);
}
