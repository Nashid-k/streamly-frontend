// src/components/NativePlayerView.jsx — native HLS playback view (prototype).
//
// Shared by the /proto-native test route and the watch page's "native test"
// play button. Resolves VidCore-first → VidSrc → CineSrc via downloadService,
// plays through hls.js (manifest-relay + direct-segment loader), and offers
// our own quality ladder + audio menu + attempt log. Custom transport only —
// no native <video controls> anywhere in here.

import { useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play } from "lucide-react";
import Hls from "hls.js";
import { downloadService } from "../api/downloadService";
import { createStreamlyLoader } from "../api/nativeHlsLoader";
import { logWarn } from "../utils/debugLogger";

const SOURCES = [
  { key: "vidcore", label: "VidCore (native)", resolve: (a, o) => downloadService.resolveVidcore(a, o) },
  { key: "vidsrc", label: "VidSrc (native)", resolve: (a, o) => downloadService.resolveVidsrc(a, o) },
  { key: "cinesrc", label: "CineSrc (native)", resolve: (a, o) => downloadService.resolveCinesrc(a, o) },
];

const PARSE_TIMEOUT_MS = 75000;

function stamp() {
  return new Date().toLocaleTimeString();
}

function fmtTime(s) {
  const v = Math.max(0, Math.floor(Number(s) || 0));
  const m = Math.floor(v / 60);
  const r = v % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function NativePlayerView({ type = "movie", id, season = 1, episode = 1 }) {
  const videoRef = useRef(null);
  const screenRef = useRef(null);
  const hlsRef = useRef(null);
  const runRef = useRef(0);
  const metaRef = useRef({ variants: [], sourceKey: null, refUrl: null, cinesrcLevels: false });

  const [lines, setLines] = useState([]);
  const [status, setStatus] = useState("idle");
  const [qualities, setQualities] = useState([]);
  const [activeUri, setActiveUri] = useState(null);
  const [isMasterMode, setIsMasterMode] = useState(false);
  const [audioTracks, setAudioTracks] = useState([]);
  const [fatal, setFatal] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Master-mode (CineSrc) starts on ABR auto; picking a level pins it.
  const [autoLevel, setAutoLevel] = useState(true);

  const say = (msg) => setLines((prev) => [...prev.slice(-60), `${stamp()} ${msg}`]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.paused) await video.play();
      else video.pause();
    } catch {
      // Autoplay policy — the big custom button stays visible for a tap.
    }
  };

  const seekTo = (value) => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = Number(value) || 0;
    } catch {
      // live-edge clamp — ignore out-of-range seeks
    }
  };

  const goFullscreen = () => {
    try {
      screenRef.current?.requestFullscreen?.()?.catch?.(() => {});
    } catch {
      // fullscreen unsupported — native video keeps playing inline
    }
  };

  /* Custom transport state (no native video controls — play/pause/seek/time/
     fullscreen below are all wired by hand). */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrentTime(video.currentTime || 0);
    const onMeta = () => setDuration(video.duration || 0);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("durationchange", onMeta);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("durationchange", onMeta);
    };
  }, []);

  useEffect(() => {
    if (!Hls.isSupported()) {
      setFatal("This browser has no MediaSource support — native playback cannot run here.");
      return undefined;
    }
    const run = runRef.current + 1;
    runRef.current = run;
    const controller = new AbortController();

    const entryUrlFor = (def, resolved, variant) => {
      // CineSrc keeps audio groups + levels on the master — load the master so
      // hls.js sees them. VidCore/VidSrc variants are per-quality media
      // playlists, loadable directly.
      if (def.key === "cinesrc") return resolved.source?.url;
      return variant?.uri;
    };

    const waitParsed = (hls) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out waiting for the playlist")), PARSE_TIMEOUT_MS);
        const onParsed = () => {
          clearTimeout(timer);
          hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
          hls.off(Hls.Events.ERROR, onError);
          resolve();
        };
        const onError = (_e, data) => {
          if (!data?.fatal) return;
          clearTimeout(timer);
          hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
          hls.off(Hls.Events.ERROR, onError);
          reject(new Error(data?.details || "hls fatal error"));
        };
        hls.on(Hls.Events.MANIFEST_PARSED, onParsed);
        hls.on(Hls.Events.ERROR, onError);
      });

    const startLevelFor = (hls, def) => {
      // CineSrc loads its master: leave level selection on AUTO (-1) so ABR
      // starts conservatively and steps up only when the pipe sustains it.
      // (Forcing the top level first is exactly what stalled 4K playback.)
      if (def.key !== "cinesrc" || !Array.isArray(hls.levels) || hls.levels.length === 0) return;
      hls.currentLevel = -1;
    };

    const attachAudio = (hls) => {
      const tracks = hls.audioTracks || [];
      if (runRef.current !== run) return;
      setAudioTracks(
        tracks.map((t, i) => ({ index: i, name: t.name || t.lang || `Audio ${i + 1}`, lang: t.lang || "" })),
      );
    };

    (async () => {
      setStatus("resolving");
      setFatal(null);
      setQualities([]);
      setAudioTracks([]);
      const args = { type, id, season: type === "tv" ? season : undefined, episode: type === "tv" ? episode : undefined };
      const stale = () => runRef.current !== run || controller.signal.aborted;
      const abortPromise = () =>
        new Promise((resolve) => {
          if (controller.signal.aborted) resolve("done");
          else controller.signal.addEventListener("abort", () => resolve("done"), { once: true });
        });
      // A loader/relay failure that smells like an expired token (VidCore
      // path tokens and CineSrc sessions both rotate) rather than a dead
      // CDN. Downloads survive this via re-mint; playback must too.
      const isAuthFatal = (detail) =>
        /\[relay:(segment-fetch-failed|manifest-fetch-failed)\]/.test(detail || "") ||
        /failed \((401|403|429)\)/.test(detail || "");
      const pickSmooth = (list) =>
        list.filter((v) => (v.height || 0) > 0 && (v.height || 0) <= 1080).sort((a, b) => (b.height || 0) - (a.height || 0))[0] ||
        list[0];

      // Returns true when playback settled on this source (caller stops), false
      // to move to the next source.
      const runSource = async (def) => {
        say(`Trying ${def.label}…`);
        let resolved = null;
        try {
          resolved = await def.resolve(args, { signal: controller.signal });
        } catch (error) {
          say(`${def.label}: resolve failed (${error?.code || error?.message}) — next source.`);
          return false;
        }
        let variants = resolved?.variants || [];
        if (variants.length === 0) {
          say(`${def.label}: no variants — next source.`);
          return false;
        }
        let liveSource = resolved.source;
        let liveRefUrl = resolved.source?.refUrl || resolved.source?.url;
        // attempt 0 = initial URLs; attempt 1 = one token-refresh re-resolve.
        let preferHeight = null;
        let resumeTime = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (stale()) return true;
          const pool = preferHeight != null ? variants.filter((v) => (v.height || 0) === preferHeight) : [];
          // Smooth start: open on the tallest rendition at or below 1080p so
          // the first seconds play instantly; 4K stays one tap away in the
          // menu. (A 4K segment needs ~20 Mbps sustained — opening straight
          // on it is what stalled playback after 5–10s.)
          const smoothStart = pool[0] || pickSmooth(variants);
          const entryUrl = entryUrlFor(def, { source: liveSource }, smoothStart);
          if (!entryUrl) {
            say(`${def.label}: no playable URL — next source.`);
            return false;
          }
          say(
            `${def.label}: ${variants.length} variant(s), loading ` +
              (def.key === "cinesrc" ? "master (ABR auto)" : `${smoothStart?.height || "?"}p (smooth start)`) +
              (attempt > 0 ? " with fresh tokens…" : "…"),
          );
          try {
            hlsRef.current?.destroy();
          } catch {
            // previous instance already gone
          }
          const hls = new Hls({
            loader: createStreamlyLoader({ getRefUrl: () => liveRefUrl }),
            // Adaptive bitrate + progressive MSE appends: chunks hit the
            // screen while the rest of the segment is still arriving. The
            // forward buffer is sized for 4K segments (10+ MB each) so one
            // slow fetch doesn't stall playback.
            abrEnabled: true,
            progressive: true,
            maxBufferLength: 60,
            maxBufferSize: 120 * 1000 * 1000,
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
            say(`${def.label}: fatal ${lastFatalDetail} — next source.`);
            logWarn("native", `${def.label} fatal during playback`, {
              details: data?.details,
              message: data?.error?.message,
              fragSn: frag?.sn ?? null,
            });
          };
          hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => attachAudio(hls));
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data?.fatal) return;
            reportFatal(data);
            try {
              hls.destroy();
            } catch {
              // already torn down
            }
            resolveFatal?.();
          });
          try {
            hls.loadSource(entryUrl);
            hls.attachMedia(videoRef.current);
            await waitParsed(hls);
          } catch (error) {
            say(`${def.label}: ${error?.message || "load failed"} — next source.`);
            try {
              hls.destroy();
            } catch {
              // already torn down
            }
            return false;
          }
          if (stale()) return true;
          metaRef.current = { variants, sourceKey: def.key, refUrl: liveRefUrl, cinesrcLevels: def.key === "cinesrc" };
          startLevelFor(hls, def);
          setQualities(variants.map((v) => ({ uri: v.uri, height: v.height || 0, bandwidth: v.bandwidth || 0, label: v.label })));
          setIsMasterMode(def.key === "cinesrc");
          setActiveUri(def.key === "cinesrc" ? null : smoothStart?.uri || null);
          attachAudio(hls);
          setStatus(`playing via ${def.label}`);
          say(`${def.label}: PLAYING (${def.key === "cinesrc" ? "ABR auto" : `${smoothStart?.height || "?"}p`}).`);
          if (resumeTime != null) {
            try {
              videoRef.current.currentTime = resumeTime;
            } catch {
              // live-edge clamp — start wherever the fresh playlist begins
            }
            resumeTime = null;
          }
          try {
            await videoRef.current?.play();
          } catch {
            say("Autoplay blocked — tap the custom play button.");
          }
          // Park this attempt: a fatal error AFTER playback started either
          // refreshes tokens in place (same source, same quality, resume at
          // the saved position) or moves to the next source — never a dead
          // "playing" screen. Unmount/abort ends the park quietly.
          const parked = await Promise.race([fatalLater.then(() => "fatal"), abortPromise()]);
          if (parked === "done") return true;
          if (attempt === 0 && isAuthFatal(lastFatalDetail) && !stale()) {
            const savedT = videoRef.current?.currentTime || 0;
            say(`${def.label}: token may have expired — re-resolving…`);
            let fresh = null;
            try {
              fresh = await def.resolve(args, { signal: controller.signal });
            } catch {
              fresh = null;
            }
            const freshVariants = fresh?.variants || [];
            if (fresh && freshVariants.length > 0) {
              preferHeight = smoothStart?.height ?? null;
              resumeTime = savedT;
              variants = freshVariants;
              liveSource = fresh.source;
              liveRefUrl = fresh.source?.refUrl || fresh.source?.url;
              say(`${def.label}: fresh tokens minted — resuming…`);
              continue;
            }
            say(`${def.label}: re-resolve failed — next source.`);
          }
          return false;
        }
        return false;
      };

      for (const def of SOURCES) {
        if (stale()) return;
        if (await runSource(def)) return;
      }
      if (stale()) return;
      setStatus("error");
      setFatal("No native source resolved this title (all three resolvers came up empty).");
      say("All sources exhausted.");
    })();

    return () => {
      controller.abort();
      try {
        hlsRef.current?.destroy();
      } catch {
        // already torn down
      }
      hlsRef.current = null;
    };
  }, [type, id, season, episode]);

  const pickQuality = async (uri, height) => {
    const hls = hlsRef.current;
    const meta = metaRef.current;
    if (!hls || !videoRef.current) return;
    const t = videoRef.current.currentTime || 0;
    const wasPaused = videoRef.current.paused;
    say(`Switching to ${height || "?"}p…`);
    try {
      if (meta.cinesrcLevels && Array.isArray(hls.levels) && hls.levels.length > 0) {
        let best = 0;
        hls.levels.forEach((lvl, i) => {
          if (Math.abs((lvl.height || 0) - (height || 0)) < Math.abs((hls.levels[best].height || 0) - (height || 0))) best = i;
        });
        hls.currentLevel = best;
        setAutoLevel(false);
        setActiveUri(null);
        say(`Level -> ${hls.levels[best]?.height || "?"}p (pinned).`);
        return;
      }
      hls.loadSource(uri);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("switch timed out")), 30000);
        const done = () => {
          clearTimeout(timer);
          hls.off(Hls.Events.MANIFEST_PARSED, done);
          resolve();
        };
        hls.on(Hls.Events.MANIFEST_PARSED, done);
      });
      try {
        videoRef.current.currentTime = t;
      } catch {
        // live-edge clamp — start wherever the new playlist begins
      }
      if (!wasPaused) {
        try {
          await videoRef.current.play();
        } catch {
          // user gesture needed — custom transport is present
        }
      }
      setActiveUri(uri);
      say(`Switched to ${height || "?"}p.`);
    } catch (error) {
      say(`Switch failed: ${error?.message || "unknown"}.`);
    }
  };

  const pickAudio = (index) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.audioTrack = index;
    say(`Audio -> ${audioTracks[index]?.name || index}.`);
  };

  const pickAuto = () => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = -1;
    setAutoLevel(true);
    say("Level -> Auto (ABR).");
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
        {type} {id}
        {type === "tv" ? ` S${season}E${episode}` : ""} · {status}
      </p>
      <div
        ref={screenRef}
        style={{ position: "relative", marginTop: 12, background: "#000", borderRadius: 12, overflow: "hidden" }}
      >
        <video
          ref={videoRef}
          playsInline
          onClick={togglePlay}
          style={{ width: "100%", display: "block", aspectRatio: "16 / 9", background: "#000" }}
        />
        {!playing && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play"
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: 84,
              height: 84,
              borderRadius: "50%",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(34,197,94,0.92)",
              color: "#04120a",
              boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
            }}
          >
            <Play size={38} fill="currentColor" style={{ marginLeft: 4 }} />
          </button>
        )}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
          }}
        >
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            {fmtTime(currentTime)} / {fmtTime(duration)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, Math.floor(duration) || 0)}
            step={1}
            value={Math.min(Math.floor(currentTime) || 0, Math.max(0, Math.floor(duration) || 0))}
            onChange={(e) => seekTo(e.target.value)}
            aria-label="Seek"
            style={{ flex: 1, accentColor: "#22c55e", cursor: "pointer" }}
          />
          <button
            type="button"
            onClick={goFullscreen}
            aria-label="Fullscreen"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>
      {fatal && (
        <p style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)", fontSize: 14 }}>
          {fatal}
        </p>
      )}
      {qualities.length > 0 && (
        <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>Quality (our ladder)</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {isMasterMode && (
                <button
                  key="auto"
                  type="button"
                  onClick={pickAuto}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: autoLevel ? "2px solid #22c55e" : "1px solid rgba(255,255,255,0.2)",
                    background: autoLevel ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Auto
                </button>
              )}
              {qualities.map((q) => {
                const active = !isMasterMode && activeUri === q.uri;
              return (
                <button
                  key={q.uri}
                  type="button"
                  onClick={() => pickQuality(q.uri, q.height)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: active ? "2px solid #22c55e" : "1px solid rgba(255,255,255,0.2)",
                    background: active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {q.label || `${q.height}p`}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {audioTracks.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>Audio</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {audioTracks.map((a) => (
              <button
                key={a.index}
                type="button"
                onClick={() => pickAudio(a.index)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>Attempt log</p>
        <pre
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            padding: 12,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {lines.length > 0 ? lines.join("\n") : "starting…"}
        </pre>
      </div>
    </div>
  );
}
