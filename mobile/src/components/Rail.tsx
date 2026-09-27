import React from "react";
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, type } from "../theme";
import type { MediaItem } from "../api/tmdb";

interface RailProps {
  title: string;
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  loading?: boolean;
  cardWidth?: number;
}

/* One horizontal shelf. Sized cards (not a fixed grid) so long titles do not
 * wrap into neighbouring tiles the way they did in the browser build. */
export function Rail({ title, items, onSelect, loading, cardWidth = 116 }: RailProps) {
  if (loading) {
    return (
      <View style={styles.section}>
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  }
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        // Rails keep their own scroll position; never steal the vertical gesture.
        directionalLockEnabled
      >
        {items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${item.title} in ${title}`}
            onPress={() => onSelect(item)}
            style={({ pressed }) => [styles.card, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.poster, { width: cardWidth, height: cardWidth * 1.5 }]}>
              {item.posterUrl ? (
                <ImageBackground
                  source={{ uri: item.posterUrl }}
                  style={styles.image}
                  imageStyle={styles.imageRadius}
                />
              ) : (
                <View style={[styles.image, styles.blank]}>
                  <Text style={styles.blankText} numberOfLines={3}>
                    {item.title}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {item.imdbRating ? `★ ${item.imdbRating.toFixed(1)}` : "—"}
              {item.year ? ` · ${item.year}` : ""}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

interface HeroProps {
  item: MediaItem;
  onPress: () => void;
}

export function Hero({ item, onPress }: HeroProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Featured: ${item.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.hero, { opacity: pressed ? 0.85 : 1 }]}
    >
      <ImageBackground
        source={item.backdropUrl ? { uri: item.backdropUrl } : undefined}
        style={styles.heroImage}
        imageStyle={styles.heroRadius}
      >
        <View style={styles.heroScrim} />
        <View style={styles.heroBody}>
          <Text style={styles.heroKicker}>FEATURED</Text>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.heroMeta} numberOfLines={1}>
            {item.imdbRating ? `★ ${item.imdbRating.toFixed(1)}` : ""}
            {item.year ? `  ·  ${item.year}` : ""}
            {item.genres.length ? `  ·  ${item.genres.slice(0, 3).join(", ")}` : ""}
          </Text>
          <View style={styles.heroActions}>
            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>▶  View details</Text>
            </View>
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.xl, gap: space.md },
  heading: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: "700",
    paddingHorizontal: space.lg,
  },
  loading: { color: colors.textFaint, fontSize: type.small, paddingHorizontal: space.lg },
  strip: { paddingHorizontal: space.lg, gap: space.md },
  card: { width: 116 },
  poster: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  image: { width: "100%", height: "100%" },
  imageRadius: { borderRadius: radius.md },
  blank: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceHi, padding: space.sm },
  blankText: { color: colors.textFaint, fontSize: type.small, textAlign: "center" },
  cardTitle: { color: colors.text, fontSize: type.small, fontWeight: "600", marginTop: space.xs },
  cardSub: { color: colors.textFaint, fontSize: type.tiny },
  hero: { marginHorizontal: space.lg, borderRadius: radius.lg, overflow: "hidden" },
  heroImage: { minHeight: 300, justifyContent: "flex-end" },
  heroRadius: { borderRadius: radius.lg },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
    borderRadius: radius.lg,
  },
  heroBody: { padding: space.lg, gap: space.xs },
  heroKicker: { color: colors.red, fontSize: type.tiny, fontWeight: "800", letterSpacing: 1.4 },
  heroTitle: { color: colors.text, fontSize: type.hero, fontWeight: "800" },
  heroMeta: { color: colors.textDim, fontSize: type.small },
  heroActions: { flexDirection: "row", marginTop: space.sm },
  heroCta: { backgroundColor: colors.red, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill },
  heroCtaText: { color: colors.text, fontWeight: "700", fontSize: type.small },
});
