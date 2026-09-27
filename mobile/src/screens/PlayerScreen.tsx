import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Player } from "../components/Player";
import { Banner, Spinner } from "../components/PosterCard";
import { resolvePlayback, type PlaybackTarget } from "../api/streams";
import { minimalMediaItem } from "../api/tmdb";
import { colors, radius, space, type } from "../theme";
import type { RootStackParamList } from "../navigation/types";
import { useUserData } from "../store/userData";
import { logError, logInfo, logWarn } from "../utils/logger";

type Props = NativeStackScreenProps<RootStackParamList, "Player">;

const SAVE_EVERY_SEC = 5;

export function PlayerScreen({ route, navigation }: Props) {
  const { id, title, type, season, episode, startPosition } = route.params;
  const insets = useSafeAreaInsets();
  const { saveProgress } = useUserData();
  const [target, setTarget] = useState<PlaybackTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastSaved = useRef(0);
  const latest = useRef({ position: startPosition, duration: 0 });

  useEffect(() => {
    let cancelled = false;
    // Landscape is unlocked for playback and re-locked on the way out.
    ScreenOrientation.unlockAsync().catch((error) =>
      logWarn("player", "Could not unlock landscape.", { message: String(error) }),
    );

    (async () => {
      try {
        const resolved = await resolvePlayback(type, id, season ?? undefined, episode ?? undefined);
        if (cancelled) return;
        setTarget(resolved);
        logInfo("player", "Playback source ready.", { id, type, season, episode, quality: resolved.qualityLabel });
      } catch (err) {
        if (cancelled) return;
        setError(String((err as Error)?.message || err));
        logError("player", "Could not prepare playback.", err, { id, type, season, episode });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {
        // Screen may already be gone; nothing to report.
      });
    };
  }, [id, type, season, episode]);

  const handleProgress = useCallback(
    (positionSec: number, durationSec: number) => {
      latest.current = { position: positionSec, duration: durationSec };
      if (positionSec - lastSaved.current < SAVE_EVERY_SEC) return;
      lastSaved.current = positionSec;
      saveProgress(minimalMediaItem(id, title, type), positionSec, durationSec, season, episode);
    },
    [episode, id, saveProgress, season, title, type],
  );

  const close = useCallback(() => {
    saveProgress(
      minimalMediaItem(id, title, type),
      latest.current.position,
      latest.current.duration,
      season,
      episode,
    );
    navigation.goBack();
  }, [episode, id, navigation, saveProgress, season, title, type]);

  return (
    <View style={styles.root}>
      {loading ? (
        <View style={styles.centered}>
          <Spinner label="Resolving stream…" />
        </View>
      ) : null}

      {error ? (
        <View style={styles.centered}>
          <Banner
            tone="error"
            title="This title will not play"
            detail={error}
            actionLabel="Back"
            onAction={close}
          />
        </View>
      ) : null}

      {target ? (
        <Player
          uri={target.uri}
          title={type === "tv" && season != null && episode != null ? `${title} · S${season}E${episode}` : title}
          qualityLabel={target.qualityLabel}
          startPosition={startPosition}
          onProgress={handleProgress}
          onEnded={close}
        />
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close player"
        onPress={close}
        style={[styles.close, { top: insets.top + space.sm }]}
      >
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  close: {
    position: "absolute",
    right: space.lg,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  closeText: { color: colors.text, fontSize: type.body, fontWeight: "800" },
});
