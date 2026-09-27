import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner, PosterCard, Spinner } from "../components/PosterCard";
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
          title="TMDB is not configured"
          detail="Add a TMDB read key (or your deployed Streamly URL) in the Settings tab to search."
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
        <View style={styles.hintWrap}>
          <Text style={styles.hint}>Type at least two characters. Search hits TMDB directly.</Text>
        </View>
      ) : results.loading ? (
        <Spinner label={`Searching for "${debounced}"…`} />
      ) : results.error ? (
        <Banner
          tone="error"
          title="Search failed"
          detail={results.error}
          actionLabel="Retry"
          onAction={results.reload}
        />
      ) : !data.length ? (
        <View style={styles.hintWrap}>
          <Text style={styles.hint}>
            {submitted ? `No results for "${submitted}".` : `No results for "${debounced}".`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <PosterCard item={item} onPress={() => openDetails(item.id, item.title)} />
          )}
          ListFooterComponent={
            <Text style={styles.footer}>
              {data.length} result{data.length === 1 ? "" : "s"} for “{debounced}”
            </Text>
          }
        />
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
  hintWrap: { paddingVertical: space.xl, alignItems: "center" },
  hint: { color: colors.textFaint, fontSize: type.small, textAlign: "center" },
  grid: { paddingTop: space.lg, gap: space.lg },
  gridRow: { gap: space.md, justifyContent: "flex-start" },
  footer: { color: colors.textFaint, fontSize: type.tiny, textAlign: "center", paddingVertical: space.lg },
});
