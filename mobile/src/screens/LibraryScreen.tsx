import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PosterCard } from "../components/PosterCard";
import { EmptyState, FadeImage, Skeleton, Touchable } from "../components/motion";
import { colors, radius, space, type } from "../theme";
import type { RootStackParamList } from "../navigation/types";
import { useUserData, type ProgressEntry } from "../store/userData";
import { logInfo } from "../utils/logger";

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { ready, myList, continueWatching, removeProgress, clearAll } = useUserData();

  const open = useCallback(
    (id: string, title: string) => rootNav.navigate("Details", { id, title }),
    [rootNav],
  );

  if (!ready) {
    /* Two shaped blocks instead of a black flash: the first paint stands in for
     * the sections that are about to fill them. */
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.md, paddingHorizontal: space.lg, gap: space.md }]}>
        <Skeleton width="55%" height={28} cornerRadius={6} />
        <Skeleton width="100%" height={72} cornerRadius={radius.md} />
        <Skeleton width="100%" height={72} cornerRadius={radius.md} />
      </View>
    );
  }

  if (!myList.length && !continueWatching.length) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.md, paddingHorizontal: space.lg }]}>
        <Text style={styles.heading}>My Library</Text>
        <EmptyState
          title="Nothing saved yet"
          detail="Tap the star on any title to keep it in My List. Watched titles and their resume points show up here automatically."
        />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxl, paddingHorizontal: space.lg }}
      data={myList}
      keyExtractor={(entry) => entry.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.heading}>My Library</Text>
          {continueWatching.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Continue watching</Text>
              {continueWatching.map((entry: ProgressEntry) => (
                <ContinueCard
                  key={entry.id}
                  entry={entry}
                  onPress={() => open(entry.id, entry.title)}
                  onRemove={() => removeProgress(entry.id)}
                />
              ))}
            </View>
          ) : null}
          {myList.length ? <Text style={styles.sectionTitle}>My List</Text> : null}
        </View>
      }
      ListFooterComponent={
        <Touchable
          accessibilityLabel="Clear local data"
          accessibilityRole="button"
          onPress={() => {
            clearAll();
            logInfo("library", "User cleared all local data.");
          }}
          style={styles.clear}
        >
          <Text style={styles.clearText}>Clear local data</Text>
        </Touchable>
      }
      renderItem={({ item }) => (
        <View style={styles.listRow}>
          <PosterCard
            item={{
              id: item.id,
              title: item.title,
              posterUrl: item.posterUrl,
              imdbRating: null,
              year: null,
            }}
            onPress={() => open(item.id, item.title)}
          />
        </View>
      )}
    />
  );
}

function ContinueCard({
  entry,
  onPress,
  onRemove,
}: {
  entry: ProgressEntry;
  onPress: () => void;
  onRemove: () => void;
}) {
  const pct = entry.durationSec ? Math.min(1, entry.positionSec / entry.durationSec) : 0;
  return (
    <Touchable
      accessibilityLabel={`Resume ${entry.title}`}
      onPress={onPress}
      style={styles.continue}
    >
      <View style={styles.continuePoster}>
        {entry.posterUrl ? <FadeImage uri={entry.posterUrl} style={styles.continuePosterImage} /> : null}
      </View>
      <View style={styles.continueBody}>
        <Text style={styles.continueTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.continueMeta}>
          {entry.type === "tv" && entry.season != null ? `S${entry.season}E${entry.episode}  ·  ` : ""}
          {Math.round(pct * 100)}% watched
        </Text>
        <View style={styles.continueTrack}>
          <View style={[styles.continueFill, { width: `${pct * 100}%` }]} />
        </View>
      </View>
      <Touchable
        accessibilityLabel={`Remove ${entry.title} from continue watching`}
        onPress={onRemove}
        style={styles.remove}
        scaleTo={0.88}
      >
        <Text style={styles.removeText}>✕</Text>
      </Touchable>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heading: { color: colors.text, fontSize: type.hero, fontWeight: "800", marginBottom: space.md },
  header: { gap: space.xs },
  section: { marginTop: space.lg, gap: space.sm },
  sectionTitle: { color: colors.text, fontSize: type.title, fontWeight: "700", marginTop: space.lg },
  continue: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  continuePoster: {
    width: 44,
    height: 66,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceHi,
  },
  continuePosterImage: { width: "100%", height: "100%" },
  continueBody: { flex: 1, gap: space.xs },
  continueTitle: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  continueMeta: { color: colors.textDim, fontSize: type.tiny },
  continueTrack: { height: 4, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.18)" },
  continueFill: { height: 4, borderRadius: radius.pill, backgroundColor: colors.red },
  remove: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceHi },
  removeText: { color: colors.textDim, fontSize: type.small, fontWeight: "800" },
  listRow: { marginTop: space.lg },
  clear: { marginTop: space.xxl, alignSelf: "center", padding: space.md },
  clearText: { color: colors.textFaint, fontSize: type.small, textDecorationLine: "underline" },
});
