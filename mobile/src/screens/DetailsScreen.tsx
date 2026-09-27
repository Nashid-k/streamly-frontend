import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useMemo, useState } from "react";
import { BlurView } from "expo-blur";
import {
  ImageBackground,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner } from "../components/PosterCard";
import {
  EmptyState,
  FadeImage,
  FadeIn,
  SkeletonBlock,
  Touchable,
} from "../components/motion";
import { useResource } from "../hooks/useResource";
import * as tmdb from "../api/tmdb";
import { colors, radius, space, type } from "../theme";
import type { RootStackParamList } from "../navigation/types";
import { useUserData } from "../store/userData";
import { logInfo, logWarn } from "../utils/logger";

type Props = NativeStackScreenProps<RootStackParamList, "Details">;

export function DetailsScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const { isInMyList, toggleMyList, continueWatching } = useUserData();
  const [season, setSeason] = useState<number | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);

  const detail = useResource(() => tmdb.getDetail(id), [id], `Details for ${id}`);
  const activeSeason = season ?? detail.data?.seasons[0]?.seasonNumber ?? 1;
  const episodes = useResource(
    () => (detail.data?.isSeries ? tmdb.getEpisodes(id, activeSeason) : Promise.resolve([])),
    [id, activeSeason, detail.data?.isSeries],
    `Season ${activeSeason} of ${id}`,
  );

  const saved = useMemo(() => continueWatching.find((entry) => entry.id === id) || null, [continueWatching, id]);
  const inList = isInMyList(id);

  const play = useCallback(
    (episodeNumber: number | null) => {
      if (!detail.data) return;
      navigation.navigate("Player", {
        id,
        title: detail.data.title,
        type: detail.data.type,
        season: detail.data.isSeries ? activeSeason : null,
        episode: detail.data.isSeries ? episodeNumber : null,
        startPosition: saved?.positionSec ?? 0,
        /* The player steps prev/next and auto-advances through the AIRED list,
         * not through episode+1, which can be unaired or missing. */
        episodeNumbers: detail.data.isSeries ? playableEpisodes.map((ep) => ep.episodeNumber) : null,
      });
    },
    [activeSeason, detail.data, id, navigation, saved?.positionSec],
  );

  if (detail.loading) {
    /* Shaped blocks in the geometry of the page that is coming: a backdrop, a
     * title line, a meta line, the action pill, the synopsis. The old full-screen
     * spinner made every title open on a blank black page. */
    return (
      <View style={styles.loadingRoot}>
        <SkeletonBlock height={260} cornerRadius={0} />
        <View style={styles.loadingBody}>
          <SkeletonBlock height={26} style={styles.loadingW70} />
          <SkeletonBlock height={12} style={styles.loadingW40} />
          <SkeletonBlock height={44} style={styles.loadingW55} />
          <SkeletonBlock height={72} style={styles.loadingW90} />
        </View>
      </View>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <Banner
        tone="error"
        title="Could not load this title"
        detail={detail.error || "TMDB returned nothing for this id."}
        actionLabel="Retry"
        onAction={detail.reload}
      />
    );
  }

  const data = detail.data;
  const playableEpisodes = (episodes.data ?? []).filter((ep) => tmdb.isEpAired(ep));

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: 60 }}
      testID="details-scroll"
    >
      {/* Hero settles first, the body follows: one entrance instead of everything
       * popping at once. */}
      <FadeIn>
        <View>
          {data.backdropUrl ? (
            <ImageBackground source={{ uri: data.backdropUrl }} style={styles.backdrop} imageStyle={styles.backdropImage}>
              <View style={styles.backdropScrim} />
            </ImageBackground>
          ) : (
            <View style={[styles.backdrop, styles.backdropBlank]} />
          )}
          <View style={[styles.headerRow, { paddingTop: insets.top + space.md }]}>
            <Touchable
              accessibilityLabel="Go back"
              onPress={() => navigation.goBack()}
              style={styles.iconButton}
              hitSlop={8}
              scaleTo={0.9}
            >
              <Text style={styles.iconText}>‹</Text>
            </Touchable>
            <View style={styles.spacer} />
            <Touchable
              accessibilityLabel={inList ? "Remove from My List" : "Add to My List"}
              onPress={() => toggleMyList(data)}
              style={styles.iconButton}
              hitSlop={8}
              scaleTo={0.9}
            >
              <Text style={styles.iconText}>{inList ? "★" : "☆"}</Text>
            </Touchable>
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={60} style={styles.body}>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.meta}>
          {data.imdbRating ? `★ ${data.imdbRating.toFixed(1)}` : "No rating"}
          {data.year ? `  ·  ${data.year}` : ""}
          {data.runtimeMins ? `  ·  ${data.runtimeMins}m` : ""}
          {data.genres.length ? `  ·  ${data.genres.slice(0, 3).join(", ")}` : ""}
        </Text>
        {data.tagline ? <Text style={styles.tagline}>{data.tagline}</Text> : null}

        <View style={styles.actions}>
          <Touchable
            accessibilityLabel={saved ? "Resume" : "Play"}
            onPress={() => play(selectedEpisode ?? playableEpisodes[0]?.episodeNumber ?? null)}
            style={styles.play}
            scaleTo={0.96}
          >
            <Text style={styles.playText}>▶  {saved ? "Resume" : "Play"}</Text>
          </Touchable>
          {data.trailerKey ? (
            <Touchable
              accessibilityLabel="Open trailer"
              onPress={() => {
                const url = `https://www.youtube.com/watch?v=${data.trailerKey}`;
                logInfo("details", "Opening trailer in the system player.", { url });
                Linking.openURL(url).catch((error) =>
                  logWarn("details", "No app or browser could open the trailer URL.", { url, message: String(error) }),
                );
              }}
              style={styles.secondary}
              scaleTo={0.96}
            >
              <Text style={styles.secondaryText}>Trailer</Text>
            </Touchable>
          ) : null}
        </View>



        {saved ? (
          <Text style={styles.resumeNote}>
            Resume point saved at {Math.floor(saved.positionSec / 60)}m {Math.floor(saved.positionSec % 60)}s
            {saved.season ? ` · S${saved.season}E${saved.episode}` : ""}
          </Text>
        ) : null}

        <Text style={styles.overview}>{data.description || "No synopsis available."}</Text>

        {data.cast.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cast</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.castStrip}>
              {data.cast.map((person) => (
                <View key={person.id} style={styles.castCard}>
                  <View style={styles.castImage}>
                    {person.profileUrl ? <FadeImage uri={person.profileUrl} style={styles.castImageFill} /> : null}
                  </View>
                  <Text style={styles.castName} numberOfLines={1}>
                    {person.name}
                  </Text>
                  <Text style={styles.castRole} numberOfLines={1}>
                    {person.character}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {data.isSeries ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Episodes</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonStrip}>
              {data.seasons.map((s) => (
                <Touchable
                  key={s.seasonNumber}
                  accessibilityRole="button"
                  accessibilityState={{ selected: s.seasonNumber === activeSeason }}
                  onPress={() => {
                    setSeason(s.seasonNumber);
                    setSelectedEpisode(null);
                  }}
                  style={[styles.seasonChip, s.seasonNumber === activeSeason && styles.seasonChipActive]}
                  scaleTo={0.93}
                >
                  <Text style={[styles.seasonText, s.seasonNumber === activeSeason && styles.seasonTextActive]}>
                    S{s.seasonNumber}
                  </Text>
                </Touchable>
              ))}
            </ScrollView>

            {episodes.loading ? (
              /* Episode-row-shaped blocks: the list keeps its height when the real
               * rows land instead of jumping from a spinner to a full season. */
              <View style={styles.episodeSkeletons}>
                <SkeletonBlock height={78} />
                <SkeletonBlock height={78} />
                <SkeletonBlock height={78} />
              </View>
            ) : null}
            {episodes.error ? (
              <Banner
                tone="error"
                title="Episodes failed to load"
                detail={episodes.error}
                actionLabel="Retry"
                onAction={episodes.reload}
              />
            ) : null}
            {!episodes.loading && !episodes.error && !playableEpisodes.length ? (
              <EmptyState
                title="No aired episodes yet"
                detail="Newer episodes appear here once they air."
              />
            ) : null}

            {(episodes.data ?? []).map((ep) => {
              const isAired = tmdb.isEpAired(ep);
              const selected = (selectedEpisode ?? playableEpisodes[0]?.episodeNumber) === ep.episodeNumber;
              return (
                <Touchable
                  key={`${ep.seasonNumber}-${ep.episodeNumber}`}
                  accessibilityLabel={isAired ? `Play episode ${ep.episodeNumber}: ${ep.title}` : `Unaired episode ${ep.episodeNumber}: ${ep.title}`}
                  onPress={() => {
                    if (!isAired) return;
                    setSelectedEpisode(ep.episodeNumber);
                    play(ep.episodeNumber);
                  }}
                  style={[
                    styles.episode,
                    selected && styles.episodeSelected,
                    !isAired && { opacity: 0.5 },
                  ]}
                  scaleTo={isAired ? 0.98 : 1}
                >
                  <View style={styles.episodeThumb}>
                    {ep.thumbnailUrl ? <FadeImage uri={ep.thumbnailUrl} style={styles.episodeImage} /> : null}
                    <Text style={styles.episodeNumber}>E{ep.episodeNumber}</Text>
                  </View>
                  <View style={styles.episodeBody}>
                    <Text style={styles.episodeTitle} numberOfLines={1}>
                      {ep.title}
                    </Text>
                    <Text style={styles.episodeMeta} numberOfLines={1}>
                      {!isAired ? (
                        <Text style={styles.unairedChip}>Airs {ep.airDate}</Text>
                      ) : (
                        <>
                          {ep.durationMins ? `${ep.durationMins}m` : ""}
                          {ep.airDate ? `  ·  aired ${ep.airDate}` : ""}
                        </>
                      )}
                    </Text>
                    {ep.overview ? (
                      <Text style={styles.episodeOverview} numberOfLines={2}>
                        {ep.overview}
                      </Text>
                    ) : (
                      <Text style={[styles.episodeOverview, styles.muted]} numberOfLines={2}>
                        No description yet.
                      </Text>
                    )}
                  </View>
                </Touchable>
              );
            })}
          </View>
        ) : null}
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loadingRoot: { flex: 1, backgroundColor: colors.bg },
  loadingBody: { padding: space.lg, gap: space.md },
  loadingW40: { width: "40%" },
  loadingW55: { width: "55%" },
  loadingW70: { width: "70%" },
  loadingW90: { width: "90%" },
  backdrop: { height: 260, justifyContent: "flex-end" },
  backdropImage: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  backdropBlank: { backgroundColor: colors.surface },
  backdropScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.55)" },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  iconButtonBlur: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: { color: colors.text, fontSize: 20, lineHeight: 24 },
  spacer: { flex: 1 },
  body: { padding: space.lg, gap: space.sm },
  title: { color: colors.text, fontSize: type.hero, fontWeight: "800" },
  meta: { color: colors.textDim, fontSize: type.small },
  tagline: { color: colors.textFaint, fontSize: type.small, fontStyle: "italic" },
  actions: { flexDirection: "row", gap: space.md, marginTop: space.sm },
  play: { backgroundColor: "#FFFFFF", paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.md },
  playText: { color: "#000000", fontWeight: "800", fontSize: type.body, textAlign: "center" },
  secondary: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.15)" },
  secondaryText: { color: colors.text, fontWeight: "700", fontSize: type.body },
  resumeNote: { color: colors.green, fontSize: type.tiny, fontWeight: "700" },
  overview: { color: colors.textDim, fontSize: type.body, lineHeight: 20, marginTop: space.sm },
  section: { marginTop: space.xl, gap: space.md },
  sectionTitle: { color: colors.text, fontSize: type.title, fontWeight: "700" },
  castStrip: { gap: space.md },
  castCard: { width: 88, gap: space.xs },
  castImage: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceHi,
  },
  castImageFill: { width: "100%", height: "100%" },
  castName: { color: colors.text, fontSize: type.tiny, fontWeight: "700" },
  castRole: { color: colors.textFaint, fontSize: type.tiny },
  seasonStrip: { gap: space.sm },
  seasonChip: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: colors.surface },
  seasonChipActive: { backgroundColor: colors.red },
  seasonText: { color: colors.textDim, fontSize: type.small, fontWeight: "700" },
  seasonTextActive: { color: colors.text },
  episodeSkeletons: { gap: space.sm },
  episode: {
    flexDirection: "row",
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  episodeSelected: { backgroundColor: colors.surface, borderColor: colors.redDim },
  episodeThumb: { width: 108, height: 62, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.surfaceHi },
  episodeImage: { width: "100%", height: "100%" },
  episodeNumber: {
    position: "absolute",
    left: 4,
    bottom: 4,
    color: colors.text,
    fontSize: type.tiny,
    fontWeight: "800",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 4,
    borderRadius: 4,
    overflow: "hidden",
  },
  episodeBody: { flex: 1, gap: 2 },
  episodeTitle: { color: colors.text, fontSize: type.small, fontWeight: "700" },
  episodeMeta: { color: colors.textFaint, fontSize: type.tiny },
  episodeOverview: { color: colors.textDim, fontSize: type.tiny, lineHeight: 15 },
  muted: { color: colors.textFaint, fontSize: type.small },
  unairedChip: { color: colors.green, fontWeight: "700" },
});
