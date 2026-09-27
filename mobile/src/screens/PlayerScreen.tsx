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
  const { id, title, type, season, episode, startPosition, episodeNumbers } = route.params;
  const insets = useSafeAreaInsets();
  const { saveProgress } = useUserData();
  const [target, setTarget] = useState<PlaybackTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const lastSaved = useRef(0);
  const latest = useRef({ position: startPosition, duration: 0 });

  /* Aired-episode stepping: the list arrives from DetailsScreen, so prev/next
   * and the Up-Next auto-advance never walk into an unaired or absent episode. */
  const episodes = episodeNumbers ?? [];
  const currentIndex = episode != null ? episodes.indexOf(episode) : -1;
  const prevEpisode = currentIndex > 0 ? episodes[currentIndex - 1] : null;
  const nextEpisode = currentIndex >= 0 && currentIndex < episodes.length - 1 ? episodes[currentIndex + 1] : null;

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
      /* NO brightness restore here, deliberately. The drag gesture sets an
       * ACTIVITY-scoped brightness (expo-brightness on Android), which the OS
       * drops by itself when this screen's activity tears down - and calling
       * back into a native module from cleanup races the activity detach
       * (expo-brightness resolves `throwingActivity`, which THROWS once the
       * activity is going away). That race is a hard crash on exit, for a call
       * that would have been a no-op anyway. The same reasoning keeps every
       * other native teardown call out of this cleanup. */
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

  /* Episode switch = save the outgoing episode where it stopped, then re-resolve
   * with the new episode number and a zero start. setParams re-runs the resolve
   * effect; the Player keeps its own auto-advance guard so this fires once. */
  const goToEpisode = useCallback(
    (target: number) => {
      saveProgress(
        minimalMediaItem(id, title, type),
        latest.current.position,
        latest.current.duration,
        season,
        episode,
      );
      logInfo("player", "Stepping to another episode.", { from: episode, to: target, season });
      /* Drop the old stream BEFORE re-resolving: keeping it would mean a failed
       * re-resolve leaves the previous episode playing behind the error banner. */
      setTarget(null);
      setError(null);
      setLoading(true);
      navigation.setParams({ episode: target, startPosition: 0 });
    },
    [episode, id, navigation, saveProgress, season, title, type],
  );

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
          qualities={target.qualities}
          startPosition={startPosition}
          onProgress={handleProgress}
          onClose={close}
          hasNext={nextEpisode != null}
          hasPrev={prevEpisode != null}
          nextLabel={nextEpisode != null ? `Episode ${nextEpisode}` : null}
          onNext={nextEpisode != null ? () => goToEpisode(nextEpisode) : undefined}
          onPrev={prevEpisode != null ? () => goToEpisode(prevEpisode) : undefined}
        />
      ) : null}

      {/* While the stream is resolving (or has failed) there is no player chrome
       * to leave from, so an explicit ✕ is the only way out. Once the player is
       * up, its own ▼ chip owns leaving. */}
      {!target ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close player"
          onPress={close}
          style={[styles.close, { top: insets.top + space.sm }]}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      ) : null}
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
