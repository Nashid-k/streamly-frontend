import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Player } from "../components/Player";
import { Banner, Spinner } from "../components/PosterCard";
import { Touchable } from "../components/motion";
import { resolvePlayback, type PlaybackTarget } from "../api/streams";
import { minimalMediaItem } from "../api/tmdb";
import { colors, radius, space, type } from "../theme";
import type { RootStackParamList } from "../navigation/types";
import { useUserData } from "../store/userData";
import { logError, logInfo, logWarn } from "../utils/logger";

type Props = NativeStackScreenProps<RootStackParamList, "Player">;

const SAVE_EVERY_SEC = 5;

/* Turns a resolver/player failure into something a person can act on. The raw
 * message is kept in the log either way; this is the layer that decides whether
 * "Try again" is even worth offering. */
function explainTitle(message: string): string {
  if (/no variants|zero variants|no playable source|no-source/i.test(message)) {
    return "No stream for this title";
  }
  if (/not a Streamly title id/i.test(message)) return "This title cannot be looked up";
  if (/relay|route/i.test(message)) return "Playback source unreachable";
  if (/timed out/i.test(message)) return "The server took too long";
  return "This title will not play";
}

function explainDetail(message: string): string {
  if (/no variants|zero variants|no playable source|no-source/i.test(message)) {
    return (
      "The providers have this title indexed but no playable stream right now — usually " +
      "a region lock or a source that is temporarily down. Nothing is wrong with your device."
    );
  }
  if (/not a Streamly title id/i.test(message)) {
    return "The id for this title is not one the resolver understands. Reinstalling the app will fix it.";
  }
  if (/relay|route/i.test(message)) {
    return "The stream host refused the request and the backup route is down too. Trying again in a minute is usually enough.";
  }
  if (/timed out/i.test(message)) {
    return "The request did not come back in time. Check your connection and try again.";
  }
  return message;
}

export function PlayerScreen({ route, navigation }: Props) {
  const { id, title, type, season, episode, startPosition } = route.params;
  const insets = useSafeAreaInsets();
  const { saveProgress } = useUserData();
  const [target, setTarget] = useState<PlaybackTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
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
        logInfo("player", "Playback source ready.", {
          id,
          type,
          season,
          episode,
          quality: resolved.qualityLabel,
          resolver: resolved.resolver,
          via: resolved.via,
        });
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
  }, [id, type, season, episode, nonce]);

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

  /* "This title will not play" was true of every title in the shipped APK and told
   * the user nothing. The message now says WHICH stage failed, because the fix and
   * the next action differ completely: a bad id or a missing source is not worth
   * retrying, while a timeout or a dead relay is. */
  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

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
            title={explainTitle(error)}
            detail={explainDetail(error)}
            actionLabel="Try again"
            onAction={retry}
          />
          <Pressable
            accessibilityRole="button"
            onPress={close}
            style={({ pressed }) => [styles.backLink, pressed && styles.backLinkPressed]}
          >
            <Text style={styles.backLinkText}>Back to the title</Text>
          </Pressable>
        </View>
      ) : null}

      {target ? (
        <Player
          uri={target.uri}
          headers={target.headers}
          title={type === "tv" && season != null && episode != null ? `${title} · S${season}E${episode}` : title}
          qualityLabel={target.qualityLabel}
          startPosition={startPosition}
          onProgress={handleProgress}
          onEnded={close}
        />
      ) : null}

      <Touchable
        accessibilityLabel="Close player"
        onPress={close}
        style={[styles.close, { top: insets.top + space.sm }]}
        scaleTo={0.88}
      >
        <Text style={styles.closeText}>✕</Text>
      </Touchable>
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
  backLink: { marginTop: space.lg, paddingVertical: space.sm, paddingHorizontal: space.lg },
  backLinkPressed: { opacity: 0.6 },
  backLinkText: { color: colors.textFaint, fontSize: type.small, fontWeight: "600" },
});
