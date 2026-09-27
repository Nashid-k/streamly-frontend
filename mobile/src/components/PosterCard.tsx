import React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, type } from "../theme";
import type { MediaItem } from "../api/tmdb";

interface PosterCardProps {
  item: Pick<MediaItem, "id" | "title" | "posterUrl" | "imdbRating" | "year">;
  onPress: () => void;
  width?: number;
  showMeta?: boolean;
}

export function PosterCard({ item, onPress, width = 116, showMeta = true }: PosterCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${item.year ? `, ${item.year}` : ""}`}
      onPress={onPress}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.poster, { width, height: width * 1.5 }]}>
        {item.posterUrl ? (
          <Image source={{ uri: item.posterUrl }} style={styles.image} resizeMode="cover" />
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
          <Text style={styles.sub}>
            {item.imdbRating ? `★ ${item.imdbRating.toFixed(1)}` : "—"}
            {item.year ? `  ·  ${item.year}` : ""}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  poster: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
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
      <ActivityIndicator color={colors.red} />
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
    <View style={[bannerStyles.wrap, tone === "error" && bannerStyles.error]}>
      <Text style={bannerStyles.title}>{title}</Text>
      {detail ? <Text style={bannerStyles.detail}>{detail}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={bannerStyles.button}>
          <Text style={bannerStyles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  wrap: {
    margin: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
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
  buttonText: { color: colors.text, fontSize: type.small, fontWeight: "700" },
});
