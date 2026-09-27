import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import React, { useCallback, useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner, Spinner } from "../components/PosterCard";
import { Hero, Rail } from "../components/Rail";
import { useResource } from "../hooks/useResource";
import * as tmdb from "../api/tmdb";
import { getConfig } from "../config";
import { colors, radius, space, type } from "../theme";
import type { RootStackParamList, TabParamList } from "../navigation/types";
import { useUserData } from "../store/userData";
import { useConfigTick } from "../store/settings";

type Props = BottomTabScreenProps<TabParamList, "Home">;

export function HomeScreen(_props: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { continueWatching } = useUserData();
  // Re-renders (and re-queries) the moment Settings changes, so saving a key
  // there turns this screen from "not configured" into a catalogue with no
  // restart and no rebuild.
  const configTick = useConfigTick();
  const { hasTmdbAccess, hasResolver } = getConfig();

  const trending = useResource(() => tmdb.getTrending(), [configTick], "Trending this week");
  const movies = useResource(() => tmdb.getNowPlaying(), [configTick], "Now playing");
  const topRated = useResource(() => tmdb.getTopRated(), [configTick], "Top rated");
  const airing = useResource(() => tmdb.getAiringThisWeek(), [configTick], "Airing today");

  const openDetails = useCallback(
    (id: string, title: string) => navigation.navigate("Details", { id, title }),
    [navigation],
  );

  const hero = useMemo(() => trending.data?.[0] ?? null, [trending.data]);
  const rails = useMemo(
    () =>
      [
        { title: "Now playing", res: movies },
        { title: "Top rated", res: topRated },
        { title: "Airing today", res: airing },
      ].filter((rail) => !rail.res.error),
    [movies, topRated, airing],
  );

  if (!hasTmdbAccess) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Banner
          tone="error"
          title="TMDB is not configured"
          detail={
            "This build has no catalogue credentials baked in. Open the Settings tab and enter a TMDB " +
            "read key, your site's /api/tmdb proxy URL, or simply your deployed Streamly URL — the app " +
            "starts working immediately, with no rebuild."
          }
        />
      </View>
    );
  }

  const allFailed = [trending, movies, topRated, airing].every((r) => r.error);
  const firstError = [trending, movies, topRated, airing].find((r) => r.error)?.error || null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xl }}
      testID="home-scroll"
    >
      {trending.loading && !hero ? <Spinner label="Loading the catalogue…" /> : null}

      {allFailed ? (
        <Banner
          tone="error"
          title="Could not reach TMDB"
          detail={firstError || "Unknown error."}
          actionLabel="Retry"
          onAction={() => {
            trending.reload();
            movies.reload();
            topRated.reload();
            airing.reload();
          }}
        />
      ) : null}

      {hero ? <Hero item={hero} onPress={() => openDetails(hero.id, hero.title)} /> : null}

      {continueWatching.length ? (
        <View style={styles.continue}>
          {continueWatching.slice(0, 6).map((entry) => (
            <ContinueRow key={entry.id} entry={entry} onPress={() => openDetails(entry.id, entry.title)} />
          ))}
        </View>
      ) : null}

      {rails.map((rail) => (
        <Rail
          key={rail.title}
          title={rail.title}
          items={rail.res.data ?? []}
          loading={rail.res.loading}
          onSelect={(item) => openDetails(item.id, item.title)}
        />
      ))}

      {!hasResolver ? (
        <Banner
          tone="info"
          title="Playback needs a deployed resolver"
          detail="The app does not bundle the stream resolver. Add your deployed Streamly URL in Settings to play; browsing works without it."
        />
      ) : null}
    </ScrollView>
  );
}

function ContinueRow({
  entry,
  onPress,
}: {
  entry: { id: string; title: string; posterUrl: string | null; positionSec: number; durationSec: number };
  onPress: () => void;
}) {
  const pct = entry.durationSec ? Math.min(1, entry.positionSec / entry.durationSec) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Resume ${entry.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.continueCard, { opacity: pressed ? 0.7 : 1 }]}
    >
      {entry.posterUrl ? <Image source={{ uri: entry.posterUrl }} style={styles.continuePoster} /> : <View style={[styles.continuePoster, styles.continuePosterBlank]} />}
      <View style={styles.continueBody}>
        <Text style={styles.continueTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <View style={styles.continueTrack}>
          <View style={[styles.continueFill, { width: `${pct * 100}%` }]} />
        </View>
        <Text style={styles.continueSub}>{Math.round(pct * 100)}% watched</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  continue: { marginTop: space.lg, gap: space.sm, paddingHorizontal: space.lg },
  continueCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  continuePoster: { width: 44, height: 66, borderRadius: radius.sm, backgroundColor: colors.surfaceHi },
  continuePosterBlank: { backgroundColor: colors.surfaceHi },
  continueBody: { flex: 1, gap: space.xs },
  continueTitle: { color: colors.text, fontSize: type.small, fontWeight: "700" },
  continueTrack: { height: 4, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.18)" },
  continueFill: { height: 4, borderRadius: radius.pill, backgroundColor: colors.red },
  continueSub: { color: colors.textFaint, fontSize: type.tiny },
});
