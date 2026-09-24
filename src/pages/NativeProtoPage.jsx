// src/pages/NativeProtoPage.jsx — NATIVE PLAYBACK PROTOTYPE (temporary).
//
// Purpose: prove, in a real browser, that a resolved HLS ladder can play
// natively (hls.js + MediaSource) with manifest-relay + direct-segment loads,
// before we touch CustomVideoPlayer. NOT product UI — plain video element with
// native controls plus a quality picker and an attempt log.
//
// Usage (after deploy): /proto-native?type=movie&id=693134
//   TV: /proto-native?type=tv&id=1396&season=1&episode=1
//
// Source priority is VidCore-first, then VidSrc, then CineSrc; a fatal source
// failure moves to the next source, and total failure shows the honest error
// (the final build will fall back to the iframe instead).

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Hls from "hls.js";
import { downloadService } from "../api/downloadService";
import { createStreamlyLoader } from "../api/nativeHlsLoader";

const SOURCES = [
  { key: "vidcore", label: "VidCore (native)", resolve: (a, o) => downloadService.resolveVidcore(a, o) },
  { key: "vidsrc", label: "VidSrc (native)", resolve: (a, o) => downloadService.resolveVidsrc(a, o) },
  { key: "cinesrc", label: "CineSrc (native)", resolve: (a, o) => downloadService.resolveCinesrc(a, o) },
];

const PARSE_TIMEOUT_MS = 75000;

function stamp() {
  return new Date().toLocaleTimeString();
}

export default function NativeProtoPage() {
  const [params] = useSearchParams();
  const type = params.get("type") === "tv" ? "tv" : "movie";
  const id = params.get("id") || "693134";
  const season = Number(params.get("season") || 1);
  const episode = Number(params.get("episode") || 1);

  const videoRef = useRef(null);
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

  const say = (msg) => setLines((prev) => [...prev.slice(-60), `${stamp()} ${msg}`]);

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

    const startLevelFor = (hls, def, variants) => {
      if (def.key !== "cinesrc" || !Array.isArray(hls.levels) || hls.levels.length === 0) return;
      const want = variants[0]?.height || 0;
      let best = 0;
      hls.levels.forEach((lvl, i) => {
        if (Math.abs((lvl.height || 0) - want) < Math.abs((hls.levels[best].height || 0) - want)) best = i;
      });
      hls.currentLevel = best;
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
      for (const def of SOURCES) {
        if (runRef.current !== run || controller.signal.aborted) return;
        say(`Trying ${def.label}…`);
        let resolved = null;
        try {
          resolved = await def.resolve(args, { signal: controller.signal });
        } catch (error) {
          say(`${def.label}: resolve failed (${error?.code || error?.message}) — next source.`);
          continue;
        }
        const variants = resolved?.variants || [];
        if (variants.length === 0) {
          say(`${def.label}: no variants — next source.`);
          continue;
        }
        const entryUrl = entryUrlFor(def, resolved, variants[0]);
        if (!entryUrl) {
          say(`${def.label}: no playable URL — next source.`);
          continue;
        }
        say(`${def.label}: ${variants.length} variant(s), loading ${variants[0]?.height || "?"}p…`);
        try {
          hlsRef.current?.destroy();
        } catch {
          // previous instance already gone
        }
        const refUrl = resolved.source?.refUrl || resolved.source?.url;
        const hls = new Hls({
          loader: createStreamlyLoader({ getRefUrl: () => refUrl }),
          // Prototype drives quality manually from our ladder — no ABR fights.
          abrEnabled: false,
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => attachAudio(hls));
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data?.fatal) say(`${def.label}: fatal ${data.details || "error"} — next source.`);
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
          continue;
        }
        if (runRef.current !== run || controller.signal.aborted) return;
        metaRef.current = { variants, sourceKey: def.key, refUrl, cinesrcLevels: def.key === "cinesrc" };
        startLevelFor(hls, def, variants);
        setQualities(variants.map((v) => ({ uri: v.uri, height: v.height || 0, bandwidth: v.bandwidth || 0, label: v.label })));
        setIsMasterMode(def.key === "cinesrc");
        setActiveUri(def.key === "cinesrc" ? null : variants[0]?.uri || null);
        attachAudio(hls);
        setStatus(`playing via ${def.label}`);
        say(`${def.label}: PLAYING (${variants[0]?.height || "?"}p).`);
        try {
          await videoRef.current?.play();
        } catch {
          say("Autoplay blocked — press play on the video.");
        }
        return;
      }
      if (runRef.current !== run || controller.signal.aborted) return;
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
        setActiveUri(null);
        say(`Level -> ${hls.levels[best]?.height || "?"}p.`);
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
          // user gesture needed — native controls are present
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

  return (
    <div style={{ minHeight: "100dvh", background: "#0a0a0a", color: "#fff", padding: 16 }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <p style={{ fontSize: 12, letterSpacing: 2, color: "#f59e0b", fontWeight: 800 }}>
          NATIVE PLAYBACK PROTOTYPE — TEMPORARY, NOT PRODUCT UI
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 2px" }}>
          Native HLS prototype
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          {type} {id}
          {type === "tv" ? ` S${season}E${episode}` : ""} · {status}
        </p>
        <video
          ref={videoRef}
          controls
          playsInline
          style={{ width: "100%", marginTop: 12, background: "#000", borderRadius: 12 }}
        />
        {fatal && (
          <p style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)", fontSize: 14 }}>
            {fatal}
          </p>
        )}
        {qualities.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>Quality (our ladder)</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
    </div>
  );
}
