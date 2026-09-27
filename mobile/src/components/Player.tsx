/* The real player: ExoPlayer via react-native-video with a hand-rolled,
 * Netflix-shaped control surface.
 *
 * Why not react-native-video's built-in controls? They ship a fixed white
 * overlay that ignores the product's dark palette and cannot be styled from RN.
 *
 * System brightness and volume (the Netflix behaviour a video FILTER cannot
 * give): brightness is set through expo-brightness, which on Android is scoped
 * to THIS activity - it overrides the system value while the player is open and
 * is restored (by PlayerScreen) on the way out, so the user's phone is never
 * left dimmed. Volume is set through react-native-volume-manager on the MUSIC
 * stream, which is the same stream the hardware keys move; the native volume
 * HUD is suppressed while the player is open so only ours shows.
 *
 * Gestures: the picture is split into two halves. A vertical drag on the LEFT
 * half is brightness, on the RIGHT half is volume - drag UP for more, the sign
 * Netflix taught everyone. A single tap toggles the chrome; a double tap on a
 * half jumps ±10s. The gesture responders are created ONCE and read the live
 * values through mirror refs, because a responder recreated mid-drag (or a
 * stale closure) is how gestures end up fighting the state they just set.
 *
 * Every animation is plain Animated on opacity only - useNativeDriver always
 * on, nothing that can drop a frame. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Video, { type OnBufferData, type OnLoadData, type OnProgressData, type VideoRef } from "react-native-video";
import { useKeepAwake } from "expo-keep-awake";
import * as Brightness from "expo-brightness";
import { BlurView } from "expo-blur";
import VolumeManager from "react-native-volume-manager";

import { colors, radius, space, type } from "../theme";
import { logError, logInfo, logWarn } from "../utils/logger";

const SKIP_SECONDS = 10;
const CONTROLS_TIMEOUT_MS = 3500;
const DOUBLETAP_MS = 300;
const SINGLETAP_MS = 240;
const GESTURE_THRESHOLD_PX = 12;
const GESTURE_RANGE_PX = 260; // a full-height drag spans the whole 0..1 range
const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
const UPNEXT_WINDOW_SEC = 12;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface PlayerProps {
  uri: string;
  /* Per-source request headers. react-native-video passes these into ExoPlayer's
   * data-source factory, so they reach the manifest AND every segment/key load -
   * which is what makes referer-gated hosts playable at all. */
  headers?: Record<string, string>;
  title: string;
  qualityLabel?: string | null;
  /* Every rendition the resolver offered, for the in-player quality menu. */
  qualities?: { uri: string; label: string; height: number }[];
  startPosition?: number;
  onProgress?: (positionSec: number, durationSec: number) => void;
  onEnded?: () => void;
  /* Given by PlayerScreen: leaves the player (saving progress) and steps
   * episodes. prev/next are only provided when a real, aired neighbour exists. */
  onClose?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  nextLabel?: string | null;
}

interface QualityOption {
  uri: string;
  label: string;
}

export function Player({
  uri,
  headers,
  title,
  qualityLabel,
  qualities,
  startPosition = 0,
  onProgress,
  onEnded,
  onClose,
  onPrev,
  onNext,
  hasNext,
  hasPrev,
  nextLabel,
}: PlayerProps) {
  const player = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [position, setPosition] = useState(startPosition);
  const [duration, setDuration] = useState(0);
  const [seekable, setSeekable] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [muted, setMuted] = useState(false);
  const [menu, setMenu] = useState<"quality" | "speed" | null>(null);
  const [upNextDismissed, setUpNextDismissed] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef({ time: 0, half: "" });
  const advancedRef = useRef(false);

  /* ── system brightness + volume (Netflix behaviour) ──────────────────────── */
  const [brightness, setBrightness] = useState(1);
  const [volume, setVolume] = useState(1);
  const [hud, setHud] = useState<{ kind: "brightness" | "volume" | "jump"; text: string } | null>(null);
  const hudOpacity = useRef(new Animated.Value(0)).current;
  /* Mirror refs: the gesture responders and timers read THESE, so they always
   * see the value the last event wrote, never a render behind. */
  const brightnessRef = useRef(1);
  const volumeRef = useRef(1);
  const controlsVisibleRef = useRef(true);
  const speedRef = useRef(1);

  const [locked, setLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"contain" | "cover" | "stretch">("contain");

  useEffect(() => {
    let live = true;
    /* A native call that refuses - synchronously (TurboModule lookup fails,
     * activity mid-detach) or asynchronously (OEM quirk, module still warming
     * up) - must never take the player down. The HUD just starts at 100% and a
     * [Streamly] line says why. */
    const safe = (call: () => Promise<unknown>, scope: string) => {
      try {
        call().catch((err: unknown) => logWarn("player", `${scope} unavailable.`, { message: String(err) }));
      } catch (err: unknown) {
        logWarn("player", `${scope} threw synchronously.`, { message: String(err) });
      }
    };
    safe(
      () =>
        Brightness.getBrightnessAsync().then((b) => {
          if (!live) return;
          brightnessRef.current = clamp01(b);
          setBrightness(brightnessRef.current);
        }),
      "Brightness read",
    );
    safe(
      () =>
        VolumeManager.getVolume().then((v) => {
          if (!live) return;
          volumeRef.current = clamp01(v.volume);
          setVolume(volumeRef.current);
        }),
      "Volume read",
    );
    /* The system's own volume pill would stack under ours on every drag. */
    safe(() => VolumeManager.showNativeVolumeUI({ enabled: false }), "Volume UI suppress");
    return () => {
      live = false;
      /* Deliberately NO native teardown calls here: they race the screen going
       * away (expo-brightness resolves `throwingActivity`, which THROWS once
       * the activity is detaching; volume-manager is the same class of risk),
       * and both of their effects undo themselves anyway - the activity-scoped
       * brightness dies with the activity, and the system volume UI reappears
       * the moment this screen is gone. */
    };
  }, []);

  useEffect(() => {
    controlsVisibleRef.current = controlsVisible;
  }, [controlsVisible]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const showHud = useCallback(
    (kind: "brightness" | "volume" | "jump", text: string) => {
      setHud({ kind, text });
      hudOpacity.setValue(1);
      if (hudTimer.current) clearTimeout(hudTimer.current);
      hudTimer.current = setTimeout(() => {
        Animated.timing(hudOpacity, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }, 900);
    },
    [hudOpacity],
  );

  useEffect(
    () => () => {
      if (hudTimer.current) clearTimeout(hudTimer.current);
      if (tapTimer.current) clearTimeout(tapTimer.current);
    },
    [],
  );

  const applyBrightness = useCallback(
    (value: number) => {
      const next = clamp01(value);
      brightnessRef.current = next;
      setBrightness(next);
      showHud("brightness", `${Math.round(next * 100)}%`);
      try {
        Brightness.setBrightnessAsync(next).catch((err: unknown) =>
          logWarn("player", "Could not set screen brightness.", { message: String(err) }),
        );
      } catch (err: unknown) {
        // A synchronous native refusal must never take the player down.
        logWarn("player", "Brightness call threw synchronously.", { message: String(err) });
      }
    },
    [showHud],
  );

  const applyVolume = useCallback(
    (value: number) => {
      const next = clamp01(value);
      volumeRef.current = next;
      setVolume(next);
      showHud("volume", `${Math.round(next * 100)}%`);
      try {
        VolumeManager.setVolume(next, { type: "music", showUI: false }).catch((err: unknown) =>
          logWarn("player", "Could not set device volume.", { message: String(err) }),
        );
      } catch (err: unknown) {
        logWarn("player", "Volume call threw synchronously.", { message: String(err) });
      }
    },
    [showHud],
  );

  /* ── controls visibility (fades, like the picture behind it) ─────────────── */
  const chromeOpacity = useRef(new Animated.Value(1)).current;

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    chromeOpacity.stopAnimation();
    chromeOpacity.setValue(1);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(chromeOpacity, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => finished && setControlsVisible(false));
    }, CONTROLS_TIMEOUT_MS);
  }, [chromeOpacity]);

  const hideControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.timing(chromeOpacity, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => finished && setControlsVisible(false));
  }, [chromeOpacity]);

  const cycleAspect = useCallback(() => {
    setAspectRatio((prev) => {
      if (prev === "contain") return "cover";
      if (prev === "cover") return "stretch";
      return "contain";
    });
    bumpControls();
  }, [bumpControls]);

  useEffect(() => {
    bumpControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  /* ── seeking ─────────────────────────────────────────────────────────────── */
  const positionRef = useRef(startPosition);
  const durationRef = useRef(0);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  useEffect(() => {
    durationRef.current = duration || seekable;
  }, [duration, seekable]);

  const ratio = useMemo(() => {
    const total = duration || seekable;
    if (!total) return 0;
    return Math.min(1, Math.max(0, position / total));
  }, [position, duration, seekable]);

  const seekBy = useCallback((delta: number) => {
    const total = durationRef.current;
    const target = Math.min(total || Infinity, Math.max(0, positionRef.current + delta));
    player.current?.seek(target);
    positionRef.current = target;
    setPosition(target);
  }, []);

  const seekToRatio = useCallback(
    (x: number) => {
      const total = durationRef.current;
      if (!total || !trackWidth) return;
      const target = Math.min(total, Math.max(0, (x / trackWidth) * total));
      player.current?.seek(target);
      positionRef.current = target;
      setPosition(target);
      bumpControls();
    },
    [bumpControls, trackWidth],
  );

  /* ── the two gesture halves (left = brightness, right = volume) ──────────── */
  const tapHandlerRef = useRef<(half: "left" | "right") => void>(() => undefined);
  const bumpRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    bumpRef.current = bumpControls;
  }, [bumpControls]);

  /* Per-gesture flag inside the factory closure; the responders are created once
   * so the flag survives the whole gesture. */
  const makeHalfPan = (side: "left" | "right") => {
    let gestureMoved = false;
    let gestureStartValue = 0;
    return PanResponder.create({
      /* The half claims the touch from the start: it is an overlay with no
       * children, so nothing inside it ever needs a normal press. The chrome
       * (buttons, menus) lives OUTSIDE the halves and is hit-tested first. */
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        gestureMoved = false;
        gestureStartValue = side === "left" ? brightnessRef.current : volumeRef.current;
        bumpRef.current();
      },
      onPanResponderMove: (_e, g) => {
        if (!gestureMoved) {
          if (Math.abs(g.dy) <= GESTURE_THRESHOLD_PX || Math.abs(g.dy) <= Math.abs(g.dx)) return;
          gestureMoved = true;
        }
        const delta = (-g.dy / GESTURE_RANGE_PX) * 0.9; // drag UP = brighter / louder
        if (side === "left") applyBrightness(gestureStartValue + delta);
        else applyVolume(gestureStartValue + delta);
      },
      onPanResponderRelease: () => {
        if (!gestureMoved) tapHandlerRef.current(side);
      },
    });
  };

  const leftPan = useMemo(() => makeHalfPan("left"), [applyBrightness, applyVolume]);
  const rightPan = useMemo(() => makeHalfPan("right"), [applyBrightness, applyVolume]);

  /* Tap on the picture: single = chrome, double on a half = ±10s. The single tap
   * is delayed by the double-tap window, which is the price of telling them
   * apart - the same trade every mobile player makes. */
  const handleHalfTap = useCallback(
    (half: "left" | "right") => {
      const now = Date.now();
      const isDouble = now - lastTap.current.time < DOUBLETAP_MS && lastTap.current.half === half;
      lastTap.current = { time: now, half };
      if (tapTimer.current) clearTimeout(tapTimer.current);
      if (isDouble) {
        tapTimer.current = null;
        const dir = half === "left" ? -SKIP_SECONDS : SKIP_SECONDS;
        seekBy(dir);
        showHud("jump", `${dir < 0 ? "⏪" : "⏩"} ${SKIP_SECONDS}s`);
        return;
      }
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        if (controlsVisibleRef.current) hideControls();
        else bumpControls();
      }, SINGLETAP_MS);
    },
    [bumpControls, hideControls, seekBy, showHud],
  );
  tapHandlerRef.current = handleHalfTap;

  /* ── quality switching (no re-resolve: the resolver already gave every rung) */
  const [activeQuality, setActiveQuality] = useState<QualityOption | null>(null);
  useEffect(() => {
    /* New uri prop (new title, or a retry) resets the pick and the flags. */
    setActiveQuality(null);
    setPaused(false);
    setError(null);
    setUpNextDismissed(false);
    setMenu(null);
    advancedRef.current = false;
    positionRef.current = startPosition;
    setPosition(startPosition);
  }, [uri, startPosition]);

  const sourceUri = activeQuality?.uri ?? uri;
  const shownQuality = activeQuality?.label ?? qualityLabel ?? null;

  const pickQuality = useCallback(
    (option: QualityOption) => {
      if (option.uri === sourceUri) {
        setMenu(null);
        return;
      }
      logInfo("player", "Switching quality mid-playback.", { from: shownQuality, to: option.label });
      setMenu(null);
      setActiveQuality(option);
      setBuffering(true);
      /* Keep watching the same moment: the source reloads, so the position is
       * re-applied once the new rendition reports ready. */
      player.current?.seek(positionRef.current);
    },
    [shownQuality, sourceUri],
  );

  /* ── up next / auto-advance ──────────────────────────────────────────────── */
  const remaining = duration > 0 ? duration - position : Infinity;
  const showUpNext = Boolean(onNext && hasNext && remaining <= UPNEXT_WINDOW_SEC && !upNextDismissed && !error);

  const advance = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onNext?.();
  }, [onNext]);

  useEffect(() => {
    if (!showUpNext || remaining > 0.6) return;
    /* The countdown ran out: next episode, exactly like tapping the card. */
    advance();
  }, [advance, remaining, showUpNext]);

  /* ── render ──────────────────────────────────────────────────────────────── */

  return (
    <View style={styles.root}>
      <View style={styles.stage}>
        <Video
          key={reloadNonce}
          ref={player}
          source={{ uri: sourceUri, headers }}
          style={styles.video}
          paused={paused}
          rate={speed}
          muted={muted}
          volume={volume}
          resizeMode={aspectRatio}
          controls={false}
          playInBackground={false}
          playWhenInactive={false}
          progressUpdateInterval={500}
          onLoad={(data: OnLoadData) => {
            setDuration(data.duration);
            setBuffering(false);
            logInfo("player", "Stream ready.", {
              uri: sourceUri,
              duration: data.duration,
              quality: shownQuality,
              sentReferer: Boolean(headers?.Referer),
            });
            if (startPosition > 0 && positionRef.current < 1) {
              player.current?.seek(startPosition);
              logInfo("player", "Resumed from saved position.", { startPosition });
            }
          }}
          onProgress={(data: OnProgressData) => {
            positionRef.current = data.currentTime;
            setPosition(data.currentTime);
            if (data.seekableDuration) setSeekable(data.seekableDuration);
            onProgress?.(data.currentTime, durationRef.current);
          }}
          onBuffer={(data: OnBufferData) => setBuffering(data.isBuffering)}
          onEnd={() => {
            logInfo("player", "Playback finished.", { uri: sourceUri });
            if (onNext && hasNext) advance();
            else onEnded?.();
          }}
          onError={(data) => {
            const message = data?.error?.errorString || data?.error?.errorCode || "unknown playback error";
            logError("player", "ExoPlayer failed.", new Error(String(message)), {
              uri: sourceUri,
              code: data?.error?.errorCode,
            });
            setError(String(message));
            setBuffering(false);
          }}
        />

        {/* The two gesture halves sit over the picture and UNDER the chrome, so
         * every button still wins the touch where it lives. */}
        {!error ? (
          <>
            <View style={[styles.half, styles.halfLeft]} {...leftPan.panHandlers} />
            <View style={[styles.half, styles.halfRight]} {...rightPan.panHandlers} />
          </>
        ) : null}

        {/* HUD: the transient readout under the finger. */}
        <Animated.View style={[styles.hud, { opacity: hudOpacity }]} pointerEvents="none">
          {hud?.kind === "brightness" ? <Text style={styles.hudIcon}>☀</Text> : null}
          {hud?.kind === "volume" ? <Text style={styles.hudIcon}>{volume > 0 ? "🔊" : "🔇"}</Text> : null}
          {hud?.kind === "jump" ? <Text style={styles.hudIcon}>⏱</Text> : null}
          <Text style={styles.hudText}>{hud?.text}</Text>
        </Animated.View>

        {buffering && !error ? (
          <View style={styles.centered} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.red} />
          </View>
        ) : null}

        {paused && !buffering && !error ? (
          <View style={styles.centerCluster} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back 10 seconds"
              onPress={() => {
                seekBy(-SKIP_SECONDS);
                showHud("jump", `⏪ ${SKIP_SECONDS}s`);
              }}
              style={styles.centerGhost}
            >
              <Text style={styles.centerGhostText}>↺ 10</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Play"
              onPress={() => {
                setPaused(false);
                bumpControls();
              }}
              style={styles.centerPlay}
            >
              <Text style={styles.centerPlayText}>▶</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Forward 10 seconds"
              onPress={() => {
                seekBy(SKIP_SECONDS);
                showHud("jump", `⏩ ${SKIP_SECONDS}s`);
              }}
              style={styles.centerGhost}
            >
              <Text style={styles.centerGhostText}>10 ↻</Text>
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>Playback failed</Text>
            <Text style={styles.errorDetail}>{error}</Text>
            <View style={styles.errorActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Try again"
                onPress={() => {
                  setError(null);
                  setBuffering(true);
                  setReloadNonce((n) => n + 1);
                }}
                style={styles.errorButton}
              >
                <Text style={styles.errorButtonText}>Try again</Text>
              </Pressable>
              {onClose ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Leave the player" onPress={onClose} style={styles.errorGhost}>
                  <Text style={styles.errorGhostText}>Back to the title</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Aspect Ratio"
                onPress={cycleAspect}
                style={styles.chip}
                hitSlop={6}
              >
                <Text style={styles.chipText}>{aspectRatio === "contain" ? "Fit" : aspectRatio === "cover" ? "Fill" : "Zoom"}</Text>
              </Pressable>
            </View>

            <View style={styles.spacerFlex} />
          </View>
        ) : null}

        {showUpNext ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play the next episode: ${nextLabel ?? "Up next"}`}
            onPress={advance}
            style={styles.upNext}
          >
            <View style={styles.upNextBody}>
              <Text style={styles.upNextKicker}>UP NEXT IN {Math.max(0, Math.ceil(remaining))}s</Text>
              <Text style={styles.upNextTitle} numberOfLines={1}>
                {nextLabel ?? "Next episode"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss up next"
              onPress={() => setUpNextDismissed(true)}
              style={styles.upNextDismiss}
            >
              <Text style={styles.upNextDismissText}>✕</Text>
            </Pressable>
          </Pressable>
        ) : null}

        {menu ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setMenu(null)} style={styles.menuScrim}>
            <View style={styles.menuSheet}>
              <Text style={styles.menuTitle}>{menu === "quality" ? "Video quality" : "Playback speed"}</Text>
              {menu === "quality"
                ? (qualities?.length ? qualities : [{ uri: sourceUri, label: shownQuality || "Source" }]).map((option) => {
                    const active = option.uri === sourceUri;
                    return (
                      <Pressable
                        key={`${option.label}-${option.uri.slice(-24)}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Quality ${option.label}`}
                        onPress={() => pickQuality(option)}
                        style={styles.menuRow}
                      >
                        <Text style={[styles.menuRowText, active && styles.menuRowTextActive]}>{option.label}</Text>
                        {active ? <Text style={styles.menuCheck}>✓</Text> : null}
                      </Pressable>
                    );
                  })
                : SPEEDS.map((s) => {
                    const active = s === speed;
                    return (
                      <Pressable
                        key={s}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Speed ${s}x`}
                        onPress={() => {
                          setSpeed(s);
                          setMenu(null);
                          showHud("jump", `${s}×`);
                        }}
                        style={styles.menuRow}
                      >
                        <Text style={[styles.menuRowText, active && styles.menuRowTextActive]}>{s === 1 ? "Normal" : `${s}×`}</Text>
                        {active ? <Text style={styles.menuCheck}>✓</Text> : null}
                      </Pressable>
                    );
                  })}
            </View>
          </Pressable>
        ) : null}

        {/* Chrome. The container is box-none so taps between the top and bottom
         * strips fall through to the gesture halves; the strips themselves take
         * their own touches. */}
        {controlsVisible ? (
          <Animated.View style={[styles.controls, { opacity: chromeOpacity }]} pointerEvents="box-none">
            
            {/* Top Bar (Apple TV Style) */}
            <View style={styles.headerRow}>
              <BlurView intensity={30} tint="dark" style={styles.glassHeader}>
                <Pressable accessibilityRole="button" accessibilityLabel="Leave the player" onPress={onClose} style={styles.chip} hitSlop={6}>
                  <Text style={styles.chipText}>✕</Text>
                </Pressable>
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={muted ? "Unmute" : "Mute"} onPress={() => { setMuted((m) => !m); bumpControls(); }} style={styles.chip} hitSlop={6}>
                  <Text style={styles.chipText}>{muted ? "🔇" : "🔊"}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { setMenu(menu === "speed" ? null : "speed"); bumpControls(); }} style={styles.chip} hitSlop={6}>
                  <Text style={styles.chipText}>{speed === 1 ? "1x" : `${speed}x`}</Text>
                </Pressable>
                {qualities?.length ? (
                  <Pressable accessibilityRole="button" onPress={() => { setMenu(menu === "quality" ? null : "quality"); bumpControls(); }} style={styles.chip} hitSlop={6}>
                    <Text style={styles.chipText}>{shownQuality ?? "HQ"}</Text>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" onPress={cycleAspect} style={styles.chip} hitSlop={6}>
                  <Text style={styles.chipText}>{aspectRatio === "contain" ? "Fit" : aspectRatio === "cover" ? "Fill" : "Zoom"}</Text>
                </Pressable>
              </BlurView>
            </View>

            <View style={styles.spacerFlex} />

            {/* Skip Intro */}
            {title.includes(" - S") && duration > 900 && position > 0 && position < 90 ? (
              <View style={styles.skipRow}>
                <Pressable accessibilityRole="button" accessibilityLabel="Skip Intro" onPress={() => seekBy(90 - position)}>
                  <BlurView intensity={40} tint="dark" style={styles.skipButtonGlass}>
                    <Text style={styles.skipButtonText}>⏭ Skip Intro</Text>
                  </BlurView>
                </Pressable>
              </View>
            ) : null}

            {/* Bottom Floating Glass Pill (Apple UX) */}
            <BlurView intensity={50} tint="dark" style={styles.bottomPill}>
              
              {/* Play/Pause & Nav */}
              <View style={styles.pillActions}>
                <Pressable accessibilityRole="button" onPress={hasPrev ? onPrev : undefined} style={[styles.pillBtn, !hasPrev && {opacity: 0.3}]} hitSlop={10}>
                  <Text style={styles.pillBtnText}>⏮</Text>
                </Pressable>

                <Pressable accessibilityRole="button" onPress={() => { setPaused((p) => !p); bumpControls(); }} style={styles.pillPlayBtn} hitSlop={10}>
                  <Text style={styles.pillPlayText}>{paused ? "▶" : "⏸"}</Text>
                </Pressable>

                <Pressable accessibilityRole="button" onPress={hasNext ? advance : undefined} style={[styles.pillBtn, !hasNext && {opacity: 0.3}]} hitSlop={10}>
                  <Text style={styles.pillBtnText}>⏭</Text>
                </Pressable>
              </View>

              {/* Scrubber */}
              <View style={styles.pillTrackArea}>
                <Text style={styles.time}>{formatTime(position)}</Text>
                <Pressable
                  accessibilityRole="adjustable"
                  accessibilityLabel="Seek bar"
                  onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                  onPress={(e) => seekToRatio(e.nativeEvent.locationX)}
                  style={styles.pillTrackHit}
                >
                  <View style={styles.pillTrack}>
                    <View style={[styles.pillTrackFill, { width: `${ratio * 100}%` }]} />
                    <View style={[styles.pillTrackKnob, { left: `${ratio * 100}%` }]} />
                  </View>
                </Pressable>
                <Text style={styles.time}>{remaining > 0 && remaining < duration ? `-${formatTime(remaining)}` : formatTime(duration)}</Text>
              </View>
            </BlurView>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: "#000", flex: 1 },
  stage: { flex: 1, backgroundColor: "#000" },
  video: { ...StyleSheet.absoluteFillObject },
  /* Full 50/50 split: a narrower pair would leave a dead strip in the middle
   * where taps neither toggle the chrome nor seek. */
  half: { ...StyleSheet.absoluteFillObject, width: "50%" },
  halfLeft: { left: 0 },
  halfRight: { right: 0 },
  centered: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    padding: space.lg,
  },
  centerPlay: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  centerPlayText: { color: colors.text, fontSize: 30, marginLeft: 4 },
  centerCluster: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xl,
  },
  centerGhost: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerGhostText: { color: colors.text, fontSize: type.small, fontWeight: "700" },
  hud: {
    position: "absolute",
    top: "38%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  hudIcon: { color: colors.text, fontSize: 18 },
  hudText: { color: colors.text, fontSize: type.title, fontWeight: "800", fontVariant: ["tabular-nums"] },
  errorTitle: { color: colors.text, fontWeight: "700", fontSize: type.title },
  errorDetail: { color: colors.textDim, fontSize: type.small, textAlign: "center" },
  errorActions: { flexDirection: "row", gap: space.md, marginTop: space.sm, alignItems: "center" },
  errorButton: {
    backgroundColor: colors.red,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.pill,
  },
  errorButtonText: { color: colors.text, fontWeight: "800", fontSize: type.small },
  errorGhost: { paddingHorizontal: space.md, paddingVertical: space.md },
  errorGhostText: { color: colors.textFaint, fontSize: type.small, textDecorationLine: "underline" },
  upNext: {
    position: "absolute",
    right: space.lg,
    bottom: 120,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: "rgba(20,20,20,0.95)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    maxWidth: 320,
  },
  upNextBody: { flex: 1, gap: 2 },
  upNextKicker: { color: colors.red, fontSize: type.tiny, fontWeight: "800", letterSpacing: 1 },
  upNextTitle: { color: colors.text, fontSize: type.small, fontWeight: "700" },
  upNextDismiss: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceHi,
  },
  upNextDismissText: { color: colors.textDim, fontSize: type.tiny, fontWeight: "800" },
  menuScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  menuSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    paddingBottom: space.xxl,
    gap: space.xs,
  },
  menuTitle: { color: colors.text, fontSize: type.title, fontWeight: "800", marginBottom: space.sm },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  menuRowText: { color: colors.textDim, fontSize: type.body },
  menuRowTextActive: { color: colors.text, fontWeight: "800" },
  menuCheck: { color: colors.red, fontSize: type.body, fontWeight: "800" },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    padding: space.lg,
    gap: space.md,
    justifyContent: "space-between",
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
  },
  chipText: { color: colors.text, fontSize: type.tiny, fontWeight: "800" },
  title: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: "700",
    flex: 1,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowRadius: 6,
  },

  glassHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    overflow: "hidden",
    width: "100%",
  },
  skipButtonGlass: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
  },
  bottomPill: {
    flexDirection: "column",
    borderRadius: radius.lg,
    padding: space.lg,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: space.sm,
  },
  pillActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: space.xxl,
    marginBottom: space.md,
  },
  pillBtn: {
    padding: space.sm,
  },
  pillBtnText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  pillPlayBtn: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 5,
  },
  pillPlayText: {
    color: "#000000",
    fontSize: 26,
    fontWeight: "900",
    marginLeft: 3, // visual center for play icon
  },
  pillTrackArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  pillTrackHit: {
    flex: 1,
    paddingVertical: space.sm,
  },
  pillTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "visible",
  },
  pillTrackFill: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
  },
  pillTrackKnob: {
    position: "absolute",
    top: -5,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },

  spacerFlex: { flex: 1 },
  skipRow: { flexDirection: "row", paddingHorizontal: space.lg, marginBottom: space.sm, justifyContent: "flex-end" },
  skipButton: { backgroundColor: "rgba(255, 255, 255, 0.2)", paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  skipButtonText: { color: colors.text, fontSize: type.small, fontWeight: "700" },
  trackRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg },
  lockedContainer: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  unlockButton: { backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: space.xl, paddingVertical: space.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  unlockButtonText: { color: colors.text, fontSize: type.title, fontWeight: "700" },
  trackHit: { paddingVertical: space.sm },
  track: { height: 5, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.22)", overflow: "visible" },
  trackFill: { height: 5, borderRadius: radius.pill, backgroundColor: colors.red },
  trackKnob: {
    position: "absolute",
    top: -4,
    width: 13,
    height: 13,
    marginLeft: -6,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  spacer: { flex: 1 },
  time: { color: colors.textDim, fontSize: type.tiny, fontVariant: ["tabular-nums"] },
  button: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  buttonText: { color: colors.text, fontSize: type.tiny, fontWeight: "700" },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  playText: { color: colors.text, fontSize: 18, fontWeight: "800" },
});
