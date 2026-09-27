import React from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";

import { colors, radius, space, type } from "../theme";
import type { MediaItem } from "../api/tmdb";
import { FadeImage, Touchable } from "./motion";

interface PosterCardProps {
  item: Pick<MediaItem, "id" | "title" | "posterUrl" | "imdbRating" | "year">;
  onPress: () => void;
  width?: number;
  showMeta?: boolean;
}

export function PosterCard({ item, onPress, width = 116, showMeta = true }: PosterCardProps) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityLabel={`${item.title}${item.year ? `, ${item.year}` : ""}`}
      style={{ width }}
    >
      <View style={[styles.poster, { width, height: width * 1.5 }]}>
        {item.posterUrl ? (
          <FadeImage uri={item.posterUrl} style={styles.image} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText} numberOfLines={3}>
              {item.title}
            </Text>
          </View>
        )}
      </View>
      {showMeta ? (
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {/* A card with neither a rating nor a year (My List entries) says nothing
           * here rather than printing a bare "—", which read as missing data. */}
          {item.imdbRating || item.year ? (
            <Text style={styles.sub}>
              {item.imdbRating ? `★ ${item.imdbRating.toFixed(1)}` : ""}
              {item.imdbRating && item.year ? "  ·  " : ""}
              {item.year ? item.year : ""}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  poster: {
    borderRadius: radius.md,
    overflow: "hidden",
    // backgroundColor removed for BlurView
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  image: { width: "100%", height: "100%" },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.sm,
    backgroundColor: colors.surfaceHi,
  },
  placeholderText: { color: colors.textFaint, fontSize: type.small, textAlign: "center" },
  meta: { paddingTop: space.xs, gap: 2 },
  title: { color: colors.text, fontSize: type.small, fontWeight: "600" },
  sub: { color: colors.textFaint, fontSize: type.tiny },
});

export function Spinner({ label }: { label?: string }) {
  return (
    <View style={spinnerStyles.wrap}>
      <ActivityIndicator color={colors.text} />
      {label ? <Text style={spinnerStyles.label}>{label}</Text> : null}
    </View>
  );
}

const spinnerStyles = StyleSheet.create({
  wrap: { paddingVertical: space.xl, alignItems: "center", gap: space.sm },
  label: { color: colors.textDim, fontSize: type.small },
});

export function Banner({
  tone,
  title,
  detail,
  actionLabel,
  onAction,
}: {
  tone: "error" | "info";
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <BlurView intensity={30} tint="dark" style={[bannerStyles.wrap, tone === "error" && bannerStyles.error]}>
      <Text style={bannerStyles.title}>{title}</Text>
      {detail ? <Text style={bannerStyles.detail}>{detail}</Text> : null}
      {actionLabel && onAction ? (
        <Touchable onPress={onAction} style={bannerStyles.button} scaleTo={0.94}>
          <Text style={bannerStyles.buttonText}>{actionLabel}</Text>
        </Touchable>
      ) : null}
    </BlurView>
  );
}

const bannerStyles = StyleSheet.create({
  wrap: {
    margin: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    overflow: "hidden",
    // backgroundColor removed for BlurView
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: space.sm,
  },
  error: { borderColor: colors.redDim },
  title: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  detail: { color: colors.textDim, fontSize: type.small, lineHeight: 18 },
  button: {
    marginTop: space.xs,
    alignSelf: "flex-start",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
  },
  buttonText: { color: "#FFFFFF", fontSize: type.small, fontWeight: "700" },
});
