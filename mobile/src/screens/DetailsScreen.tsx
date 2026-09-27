import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useMemo, useState } from "react";
import {
  Image,
  ImageBackground,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner, Spinner } from "../components/PosterCard";
import { useResource } from "../hooks/useResource";
import * as tmdb from "../api/tmdb";
import { getConfig } from "../config";
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
      });
    },
    [activeSeason, detail.data, id, navigation, saved?.positionSec],
  );

  if (detail.loading) return <Spinner label="Loading title…" />;

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
      <View>
        {data.backdropUrl ? (
          <ImageBackground source={{ uri: data.backdropUrl }} style={styles.backdrop} imageStyle={styles.backdropImage}>
            <View style={styles.backdropScrim} />
          </ImageBackground>
        ) : (
          <View style={[styles.backdrop, styles.backdropBlank]} />
        )}
        <View style={[styles.headerRow, { paddingTop: insets.top + space.md }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Text style={styles.iconText}>‹</Text>
          </Pressable>
          <View style={styles.spacer} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={inList ? "Remove from My List" : "Add to My List"}
            onPress={() => toggleMyList(data)}
            style={styles.iconButton}
          >
            <Text style={styles.iconText}>{inList ? "★" : "☆"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.meta}>
          {data.imdbRating ? `★ ${data.imdbRating.toFixed(1)}` : "No rating"}
          {data.year ? `  ·  ${data.year}` : ""}
          {data.runtimeMins ? `  ·  ${data.runtimeMins}m` : ""}
          {data.genres.length ? `  ·  ${data.genres.slice(0, 3).join(", ")}` : ""}
        </Text>
        {data.tagline ? <Text style={styles.tagline}>{data.tagline}</Text> : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? "Resume" : "Play"}
            onPress={() => play(selectedEpisode ?? playableEpisodes[0]?.episodeNumber ?? null)}
            style={({ pressed }) => [styles.play, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.playText}>▶  {saved ? "Resume" : "Play"}</Text>
          </Pressable>
          {data.trailerKey ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open trailer"
              onPress={() => {
                const url = `https://www.youtube.com/watch?v=${data.trailerKey}`;
                logInfo("details", "Opening trailer in the system player.", { url });
                Linking.openURL(url).catch((error) =>
                  logWarn("details", "No app or browser could open the trailer URL.", { url, message: String(error) }),
                );
              }}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Trailer</Text>
            </Pressable>
          ) : null}
        </View>

        {!getConfig().hasResolver ? (
          <Banner
            tone="info"
            title="Playback is not configured"
            detail="The stream resolver lives on the Streamly deployment rather than in the app, so it needs a reachable origin. Browsing works without it."
          />
        ) : null}

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
                  {person.profileUrl ? (
                    <Image source={{ uri: person.profileUrl }} style={styles.castImage} />
                  ) : (
                    <View style={[styles.castImage, styles.castBlank]} />
                  )}
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
                <Pressable
                  key={s.seasonNumber}
                  accessibilityRole="button"
                  accessibilityState={{ selected: s.seasonNumber === activeSeason }}
                  onPress={() => {
                    setSeason(s.seasonNumber);
                    setSelectedEpisode(null);
                  }}
                  style={[styles.seasonChip, s.seasonNumber === activeSeason && styles.seasonChipActive]}
                >
                  <Text style={[styles.seasonText, s.seasonNumber === activeSeason && styles.seasonTextActive]}>
                    S{s.seasonNumber}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {episodes.loading ? <Spinner label={`Loading season ${activeSeason}…`} /> : null}
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
              <Text style={styles.muted}>No aired episodes in this season yet.</Text>
            ) : null}

            {playableEpisodes.map((ep) => {
              const selected = (selectedEpisode ?? playableEpisodes[0]?.episodeNumber) === ep.episodeNumber;
              return (
                <Pressable
                  key={`${ep.seasonNumber}-${ep.episodeNumber}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Play episode ${ep.episodeNumber}: ${ep.title}`}
                  onPress={() => {
                    setSelectedEpisode(ep.episodeNumber);
                    play(ep.episodeNumber);
                  }}
                  style={({ pressed }) => [styles.episode, selected && styles.episodeSelected, { opacity: pressed ? 0.75 : 1 }]}
                >
                  <View style={styles.episodeThumb}>
                    {ep.thumbnailUrl ? (
                      <Image source={{ uri: ep.thumbnailUrl }} style={styles.episodeImage} />
                    ) : (
                      <View style={[styles.episodeImage, styles.episodeBlank]} />
                    )}
                    <Text style={styles.episodeNumber}>E{ep.episodeNumber}</Text>
                  </View>
                  <View style={styles.episodeBody}>
                    <Text style={styles.episodeTitle} numberOfLines={1}>
                      {ep.title}
                    </Text>
                    <Text style={styles.episodeMeta} numberOfLines={1}>
                      {ep.durationMins ? `${ep.durationMins}m` : ""}
                      {ep.airDate ? `  ·  aired ${ep.airDate}` : ""}
                    </Text>
                    {ep.overview ? (
                      <Text style={styles.episodeOverview} numberOfLines={2}>
                        {ep.overview}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  backdrop: { height: 260, justifyContent: "flex-end" },
  backdropImage: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  backdropBlank: { backgroundColor: colors.surface },
  backdropScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.55)" },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  iconText: { color: colors.text, fontSize: 20, lineHeight: 24 },
  spacer: { flex: 1 },
  body: { padding: space.lg, gap: space.sm },
  title: { color: colors.text, fontSize: type.hero, fontWeight: "800" },
  meta: { color: colors.textDim, fontSize: type.small },
  tagline: { color: colors.textFaint, fontSize: type.small, fontStyle: "italic" },
  actions: { flexDirection: "row", gap: space.md, marginTop: space.sm },
  play: { backgroundColor: colors.red, paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.pill },
  playText: { color: colors.text, fontWeight: "800", fontSize: type.body },
  secondary: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.pill, backgroundColor: colors.surfaceHi },
  secondaryText: { color: colors.text, fontWeight: "700", fontSize: type.body },
  resumeNote: { color: colors.green, fontSize: type.tiny, fontWeight: "700" },
  overview: { color: colors.textDim, fontSize: type.body, lineHeight: 20, marginTop: space.sm },
  section: { marginTop: space.xl, gap: space.md },
  sectionTitle: { color: colors.text, fontSize: type.title, fontWeight: "700" },
  castStrip: { gap: space.md },
  castCard: { width: 88, gap: space.xs },
  castImage: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.surfaceHi },
  castBlank: { backgroundColor: colors.surfaceHi },
  castName: { color: colors.text, fontSize: type.tiny, fontWeight: "700" },
  castRole: { color: colors.textFaint, fontSize: type.tiny },
  seasonStrip: { gap: space.sm },
  seasonChip: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: colors.surface },
  seasonChipActive: { backgroundColor: colors.red },
  seasonText: { color: colors.textDim, fontSize: type.small, fontWeight: "700" },
  seasonTextActive: { color: colors.text },
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
  episodeBlank: { backgroundColor: colors.surfaceHi },
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
});
