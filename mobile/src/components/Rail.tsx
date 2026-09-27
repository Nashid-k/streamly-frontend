import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, type } from "../theme";
import type { MediaItem } from "../api/tmdb";
import { FadeImage, FadeIn, PosterSkeletonRail, Scrim, Touchable } from "./motion";

interface RailProps {
  title: string;
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  loading?: boolean;
  cardWidth?: number;
  /* Staggers the shelves so they settle in reading order rather than all at once. */
  index?: number;
}

/* One horizontal shelf. Sized cards (not a fixed grid) so long titles do not
 * wrap into neighbouring tiles the way they did in the browser build. */
export function Rail({ title, items, onSelect, loading, cardWidth = 116, index = 0 }: RailProps) {
  if (loading && !items.length) {
    /* Same geometry as the real shelf, so the layout does not jump twice: once
     * for the placeholder, again when the posters land. */
    return (
      <FadeIn delay={index * 70} style={styles.section}>
        <Text style={styles.heading}>{title}</Text>
        <PosterSkeletonRail cardWidth={cardWidth} />
      </FadeIn>
    );
  }
  if (!items.length) return null;
  return (
    <FadeIn delay={index * 70} style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        // Rails keep their own scroll position; never steal the vertical gesture.
        directionalLockEnabled
      >
        {items.map((item) => (
          <Touchable
            key={item.id}
            onPress={() => onSelect(item)}
            accessibilityLabel={`${item.title} in ${title}`}
            style={styles.card}
          >
            <View style={[styles.poster, { width: cardWidth, height: cardWidth * 1.5 }]}>
              {item.posterUrl ? (
                <FadeImage uri={item.posterUrl} style={styles.image} />
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
          </Touchable>
        ))}
      </ScrollView>
    </FadeIn>
  );
}

interface HeroProps {
  item: MediaItem;
  onPress: () => void;
}

export function Hero({ item, onPress }: HeroProps) {
  return (
    <FadeIn>
      <Touchable
        onPress={onPress}
        accessibilityLabel={`Featured: ${item.title}`}
        style={styles.hero}
        scaleTo={0.985}
      >
        <View style={styles.heroImage}>
          <FadeImage uri={item.backdropUrl} style={styles.heroBackdrop} />
          <Scrim from={0.1} to={0.95} />
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
        </View>
      </Touchable>
    </FadeIn>
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
  blank: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceHi, padding: space.sm },
  blankText: { color: colors.textFaint, fontSize: type.small, textAlign: "center" },
  cardTitle: { color: colors.text, fontSize: type.small, fontWeight: "600", marginTop: space.xs },
  cardSub: { color: colors.textFaint, fontSize: type.tiny },
  hero: { marginHorizontal: space.lg, borderRadius: radius.lg },
  heroImage: {
    minHeight: 300,
    justifyContent: "flex-end",
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  heroBackdrop: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  heroBody: { padding: space.lg, gap: space.xs },
  heroKicker: { color: "rgba(255,255,255,0.8)", fontSize: type.tiny, fontWeight: "800", letterSpacing: 1.4 },
  heroTitle: { color: colors.text, fontSize: type.hero, fontWeight: "800" },
  heroMeta: { color: colors.textDim, fontSize: type.small },
  heroActions: { flexDirection: "row", marginTop: space.sm },
  heroCta: { backgroundColor: "#FFFFFF", paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md },
  heroCtaText: { color: "#000000", fontWeight: "800", fontSize: type.small },
});
