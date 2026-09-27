/* Shared motion, feedback and loading primitives.
 *
 * WHY PLAIN Animated AND NOT REANIMATED. Reanimated is the better tool, but it is
 * a native module: adding it means a config plugin, a prebuild and a full native
 * rebuild, and it would put the app's release gate behind a dependency change for
 * effects that the built-in Animated API already runs on the UI thread. Everything
 * here animates only `opacity` and `transform`, so `useNativeDriver` is always on
 * and none of it can drop a frame on the JS thread.
 *
 * What the app was missing before this existed: content appeared instantly with no
 * settle, presses only dimmed, and every load printed the word "Loading". Those are
 * the three things that make a native app feel cheap, and all three are here. */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { colors, motion, radius, space, type } from "../theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* ── entrance ────────────────────────────────────────────────────────────── */

/* Fades and lifts a block into place. `delay` staggers siblings so a screen's
 * sections arrive in reading order instead of all at once. */
export function useEnter(delayMs = 0) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.enter,
      delay: delayMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delayMs]);

  return {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [motion.rise, 0],
        }),
      },
    ],
  };
}

export function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const enter = useEnter(delay);
  return <Animated.View style={[enter, style]}>{children}</Animated.View>;
}

/* ── press feedback ───────────────────────────────────────────────────────── */

export interface TouchableProps {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link" | "tab" | "radio" | "menu" | "checkbox" | "switch" | "imagebutton" | "adjustable" | "summary" | "alert" | "combobox" | "header" | "search" | "spinbutton" | "list" | "menuitem" | "progressbar" | "timer" | "toolbar";
  accessibilityState?: { selected?: boolean; disabled?: boolean; checked?: boolean; expanded?: boolean };
  testID?: string;
  hitSlop?: number;
  scaleTo?: number;
}

/* Every tappable thing in the app. The scale spring is the part that reads as
 * "native": dimming alone is what a <div> does, but a touch that pushes back is
 * what a finger expects. */
export function Touchable({
  onPress,
  children,
  style,
  pressedStyle,
  disabled,
  scaleTo = 0.97,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityState,
  testID,
  hitSlop,
}: TouchableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const spring = useCallback(
    (to: number) => {
      Animated.spring(scale, {
        toValue: to,
        useNativeDriver: true,
        speed: 40,
        bounciness: 4,
      }).start();
    },
    [scale],
  );

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled: disabled || accessibilityState?.disabled }}
      testID={testID}
      hitSlop={hitSlop}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => spring(scaleTo)}
      onPressOut={() => spring(1)}
      style={[style, { transform: [{ scale }], opacity: disabled ? 0.5 : 1 }, pressedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

/* ── loading ─────────────────────────────────────────────────────────────── */

/* A pulsing block in the shape of the content it stands in for. Replaces the
 * "Loading…" text that used to sit where a shelf of posters was about to be, which
 * made the layout jump twice: once for the text, again for the posters. */
export function Skeleton({
  width,
  height,
  cornerRadius = radius.md,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  cornerRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0.32)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.68,
          duration: motion.shimmer,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.32,
          duration: motion.shimmer,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: cornerRadius, backgroundColor: colors.surfaceHi, opacity: pulse }, style]}
    />
  );
}

/* A shelf of skeleton posters, matching Rail's real card geometry so nothing
 * reflows when the data lands. */
export function PosterSkeletonRail({ count = 4, cardWidth = 116 }: { count?: number; cardWidth?: number }) {
  return (
    <View style={styles.skeletonStrip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: cardWidth }}>
          <Skeleton width={cardWidth} height={cardWidth * 1.5} />
          <Skeleton width={cardWidth * 0.82} height={10} cornerRadius={4} style={styles.skeletonLine} />
          <Skeleton width={cardWidth * 0.5} height={8} cornerRadius={4} style={styles.skeletonLine} />
        </View>
      ))}
    </View>
  );
}

export function SkeletonBlock({
  height,
  cornerRadius = radius.md,
  style,
}: {
  height: number;
  cornerRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <Skeleton width="100%" height={height} cornerRadius={cornerRadius} style={style} />;
}

/* The search grid's stand-in, matching the real three-column geometry so the
 * results replace the placeholder without a reflow. */
export function PosterSkeletonGrid({ count = 9, cardWidth = 104 }: { count?: number; cardWidth?: number }) {
  return (
    <View style={styles.skeletonGrid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: cardWidth }}>
          <Skeleton width={cardWidth} height={cardWidth * 1.5} />
          <Skeleton width={cardWidth * 0.82} height={10} cornerRadius={4} style={styles.skeletonLine} />
        </View>
      ))}
    </View>
  );
}

/* ── images ───────────────────────────────────────────────────────────────── */

/* Posters and backdrops arrive over the network, so without this they pop in at
 * full opacity mid-scroll. Fading them in also hides the decode hitch on the
 * first frame of a long list. */
export function FadeImage({
  uri,
  style,
  resizeMode = "cover",
}: {
  uri: string | null;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch";
}) {
  const shown = useRef(new Animated.Value(0)).current;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    shown.setValue(0);
    setFailed(false);
  }, [uri, shown]);

  if (!uri || failed) return null;

  return (
    <Animated.Image
      source={{ uri }}
      resizeMode={resizeMode}
      style={[style, { opacity: shown }]}
      onLoad={() => {
        Animated.timing(shown, {
          toValue: 1,
          duration: motion.fade,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }}
      onError={() => setFailed(true)}
    />
  );
}

/* ── scrim ────────────────────────────────────────────────────────────────── */

/* RN has no CSS gradient without another dependency, so the cinematic fade over a
 * backdrop is built from stacked bands. Four steps are indistinguishable from a
 * gradient once it is sitting under text, and unlike a real gradient they cost
 * nothing to render. */
export function Scrim({ steps = 4, from = 0.15, to = 0.92 }: { steps?: number; from?: number; to?: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: steps }, (_, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            /* Each band covers an equal slice of the height and the opacities
             * ramp, so the composite darkens toward the bottom. */
            height: `${((i + 1) / steps) * 100}%`,
            backgroundColor: colors.bg,
            opacity: from + ((to - from) * (i + 1)) / steps,
          }}
        />
      ))}
    </View>
  );
}

/* ── small shared bits ────────────────────────────────────────────────────── */

export function SectionHeading({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.heading, style]}>{children}</Text>;
}

export function EmptyState({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {detail ? <Text style={styles.emptyDetail}>{detail}</Text> : null}
      {actionLabel && onAction ? (
        <Touchable onPress={onAction} style={styles.emptyAction}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonStrip: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg },
  skeletonGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.md, paddingTop: space.lg },
  skeletonLine: { marginTop: space.xs },
  heading: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: "700",
    paddingHorizontal: space.lg,
  },
  empty: { alignItems: "center", paddingVertical: space.xxl, paddingHorizontal: space.xl, gap: space.sm },
  emptyTitle: { color: colors.text, fontSize: type.body, fontWeight: "700", textAlign: "center" },
  emptyDetail: { color: colors.textFaint, fontSize: type.small, textAlign: "center", lineHeight: 19 },
  emptyAction: {
    marginTop: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
  },
  emptyActionText: { color: colors.text, fontSize: type.small, fontWeight: "700" },
});
