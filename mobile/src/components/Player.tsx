/* The real player: ExoPlayer via react-native-video with a small, hand-rolled
 * control bar.
 *
 * Why not react-native-video's built-in controls? They ship a fixed white
 * overlay that ignores the product's dark palette and cannot be styled from
 * RN. The app only needs play/pause, a seek bar, ±15s (the same skip window as
 * the web build) and a time readout, so ~120 lines of RN beat fighting a
 * WebView-styled overlay. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Video, { type OnBufferData, type OnLoadData, type OnProgressData, type VideoRef } from "react-native-video";
import { useKeepAwake } from "expo-keep-awake";

import { colors, radius, space, type } from "../theme";
import { FadeIn, Touchable } from "./motion";
import { logError, logInfo } from "../utils/logger";

const SKIP_SECONDS = 15;
const CONTROLS_TIMEOUT_MS = 3500;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

interface PlayerProps {
  uri: string;
  /* Per-source request headers. react-native-video passes these into ExoPlayer's
   * data-source factory, so they reach the manifest AND every segment/key load -
   * which is what makes referer-gated hosts playable at all. */
  headers?: Record<string, string>;
  title: string;
  qualityLabel?: string | null;
  startPosition?: number;
  onProgress?: (positionSec: number, durationSec: number) => void;
  onEnded?: () => void;
}

export function Player({ uri, headers, title, qualityLabel, startPosition = 0, onProgress, onEnded }: PlayerProps) {
  const player = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [position, setPosition] = useState(startPosition);
  const [duration, setDuration] = useState(0);
  const [seekable, setSeekable] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useKeepAwake();

  const ratio = useMemo(() => {
    const total = duration || seekable;
    if (!total) return 0;
    return Math.min(1, Math.max(0, position / total));
  }, [position, duration, seekable]);

  const bumpControls = () => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_TIMEOUT_MS);
  };

  useEffect(() => {
    bumpControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const seekBy = (delta: number) => {
    const target = Math.max(0, position + delta);
    player.current?.seek(target);
    setPosition(target);
    bumpControls();
  };

  const seekToRatio = (x: number) => {
    const total = duration || seekable;
    if (!total || !trackWidth) return;
    const target = Math.min(total, Math.max(0, (x / trackWidth) * total));
    player.current?.seek(target);
    setPosition(target);
    bumpControls();
  };

  return (
    <View style={styles.root} onTouchStart={bumpControls}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={paused ? "Play" : "Pause"}
        style={styles.stage}
        onPress={() => {
          setPaused((p) => !p);
          bumpControls();
        }}
      >
        <Video
          ref={player}
          source={{ uri, headers }}
          style={styles.video}
          paused={paused}
          resizeMode="contain"
          controls={false}
          playInBackground={false}
          playWhenInactive={false}
          progressUpdateInterval={1000}
          onLoad={(data: OnLoadData) => {
            setDuration(data.duration);
            setBuffering(false);
            logInfo("player", "Stream ready.", {
              uri,
              duration: data.duration,
              quality: qualityLabel,
              sentReferer: Boolean(headers?.Referer),
            });
            if (startPosition > 0) {
              player.current?.seek(startPosition);
              logInfo("player", "Resumed from saved position.", { startPosition });
            }
          }}
          onProgress={(data: OnProgressData) => {
            setPosition(data.currentTime);
            if (data.seekableDuration) setSeekable(data.seekableDuration);
            onProgress?.(data.currentTime, duration);
          }}
          onBuffer={(data: OnBufferData) => setBuffering(data.isBuffering)}
          onEnd={() => {
            logInfo("player", "Playback finished.", { uri });
            onEnded?.();
          }}
          onError={(data) => {
            const message = data?.error?.errorString || data?.error?.errorCode || "unknown playback error";
            logError("player", "ExoPlayer failed.", new Error(String(message)), { uri, code: data?.error?.errorCode });
            setError(String(message));
            setBuffering(false);
          }}
        />
        {buffering && !error ? (
          <View style={styles.centered} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.red} />
          </View>
        ) : null}
        {error ? (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>Playback failed</Text>
            <Text style={styles.errorDetail}>{error}</Text>
          </View>
        ) : null}
      </Pressable>

      {controlsVisible ? (
        /* Fades in rather than snapping on: the first thing a viewer does is tap
         * the frame, and a chrome block appearing out of nowhere reads as a glitch. */
        <FadeIn style={styles.controlsFade}>
        <View style={styles.controls}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {qualityLabel ? <Text style={styles.quality}>{qualityLabel}</Text> : null}
          </View>

          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Seek bar"
            onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
            onPress={(e) => seekToRatio(e.nativeEvent.locationX)}
            style={styles.track}
          >
            <View style={[styles.trackFill, { width: `${ratio * 100}%` }]} />
          </Pressable>

          <View style={styles.row}>
            <Text style={styles.time}>{formatTime(position)}</Text>
            <View style={styles.spacer} />
            <Touchable accessibilityLabel="Back 15 seconds" onPress={() => seekBy(-SKIP_SECONDS)} style={styles.button} scaleTo={0.92}>
              <Text style={styles.buttonText}>↺ 15</Text>
            </Touchable>
            <Touchable
              accessibilityLabel={paused ? "Play" : "Pause"}
              onPress={() => setPaused((p) => !p)}
              style={styles.playButton}
              scaleTo={0.9}
            >
              <Text style={styles.playText}>{paused ? "▶" : "❚❚"}</Text>
            </Touchable>
            <Touchable accessibilityLabel="Forward 15 seconds" onPress={() => seekBy(SKIP_SECONDS)} style={styles.button} scaleTo={0.92}>
              <Text style={styles.buttonText}>15 ↻</Text>
            </Touchable>
            <View style={styles.spacer} />
            <Text style={styles.time}>{formatTime(duration)}</Text>
          </View>
        </View>
        </FadeIn>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: "#000", flex: 1 },
  stage: { flex: 1, backgroundColor: "#000" },
  video: { ...StyleSheet.absoluteFillObject },
  centered: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: space.sm, padding: space.lg },
  errorTitle: { color: colors.text, fontWeight: "700", fontSize: type.body },
  errorDetail: { color: colors.textDim, fontSize: type.small, textAlign: "center" },
  controlsFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  /* Placement (absolute bottom strip) belongs to the FadeIn wrapper above; this
   * is only the strip's own paint. */
  controls: {
    padding: space.lg,
    gap: space.md,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { color: colors.text, fontSize: type.body, fontWeight: "700", flex: 1 },
  quality: { color: colors.textDim, fontSize: type.tiny, fontWeight: "700", backgroundColor: colors.surfaceHi, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.sm, overflow: "hidden" },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.22)" },
  trackFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.red },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  spacer: { flex: 1 },
  time: { color: colors.textDim, fontSize: type.tiny, fontVariant: ["tabular-nums"] },
  button: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceHi },
  buttonText: { color: colors.text, fontSize: type.tiny, fontWeight: "700" },
  playButton: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.red, alignItems: "center", justifyContent: "center" },
  playText: { color: colors.text, fontSize: 18, fontWeight: "800" },
});
