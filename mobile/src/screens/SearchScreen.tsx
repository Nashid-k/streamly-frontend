import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner, PosterCard } from "../components/PosterCard";
import { EmptyState, PosterSkeletonGrid } from "../components/motion";
import { useResource } from "../hooks/useResource";
import * as tmdb from "../api/tmdb";
import { getConfig } from "../config";
import { colors, radius, space, type } from "../theme";
import type { RootStackParamList, TabParamList } from "../navigation/types";
import { useConfigTick } from "../store/settings";

type Props = BottomTabScreenProps<TabParamList, "Search">;

const DEBOUNCE_MS = 350;

export function SearchScreen({ navigation: _navigation }: Props) {
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const configTick = useConfigTick();
  const { hasTmdbAccess } = getConfig();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [debounced, setDebounced] = useState("");

  /* Three columns must fit the row, not overflow it: a fixed 116px card is 372px
   * of card in a 344px row on a 360dp phone, so the width is derived instead. */
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.floor((screenWidth - space.lg * 2 - space.md * 2) / 3);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useResource(
    () => (debounced.length >= 2 ? tmdb.searchMulti(debounced) : Promise.resolve([])),
    [debounced, configTick],
    `Search "${debounced}"`,
  );

  const openDetails = useCallback(
    (id: string, title: string) => rootNav.navigate("Details", { id, title }),
    [rootNav],
  );

  const data = useMemo(() => results.data ?? [], [results.data]);

  if (!hasTmdbAccess) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Banner
          tone="error"
          title="No catalogue source"
          detail="Set a Streamly deployment URL under Settings › Advanced to search."
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Text style={styles.heading}>Search</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => setSubmitted(query.trim())}
        placeholder="Movies, shows, people…"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search TMDB"
      />

      {!debounced ? (
        <EmptyState
          title="Find something to watch"
          detail="Movies, shows and people — at least two characters."
        />
      ) : results.loading ? (
        /* The grid of placeholders holds the exact geometry the results will use,
         * so the answers replace it instead of shoving the page down. */
        <PosterSkeletonGrid cardWidth={cardWidth} />
      ) : (
        <>
          {/* A new query keeps the previous results on screen with a progress line,
              instead of blanking to a spinner: the list stays where the user's eyes
              are and the answer replaces it when it lands. */}
          {results.refreshing ? <Text style={styles.progress}>Searching for “{debounced}”…</Text> : null}
          {results.error && !data.length ? (
            <Banner
              tone="error"
              title="Search failed"
              detail={results.error}
              actionLabel="Retry"
              onAction={results.reload}
            />
          ) : !data.length ? (
            <EmptyState
              title="No results"
              detail={`Nothing matched “${submitted || debounced}”. Check the spelling, or try a shorter phrase.`}
            />
          ) : (
            <FlatList
              data={data}
              keyExtractor={(item) => item.id}
              numColumns={3}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.grid}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <PosterCard item={item} width={cardWidth} onPress={() => openDetails(item.id, item.title)} />
              )}
              ListFooterComponent={
                <Text style={styles.footer}>
                  {results.stale ? "Showing your last results — could not reach TMDB. " : ""}
                  {data.length} result{data.length === 1 ? "" : "s"} for “{debounced}”
                </Text>
              }
            />
          )}
        </>
      )}
    </View>
  );
}

/* Search results use the shared PosterCard; nothing else is needed here. */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg },
  heading: { color: colors.text, fontSize: type.hero, fontWeight: "800", marginBottom: space.md },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: type.body,
  },
  progress: { color: colors.textFaint, fontSize: type.tiny, paddingTop: space.md },
  grid: { paddingTop: space.lg, gap: space.lg },
  gridRow: { gap: space.md, justifyContent: "flex-start" },
  footer: { color: colors.textFaint, fontSize: type.tiny, textAlign: "center", paddingVertical: space.lg },
});
