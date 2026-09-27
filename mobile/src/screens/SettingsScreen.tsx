import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner } from "../components/PosterCard";
import { Touchable } from "../components/motion";
import { cacheStats, clearCache } from "../api/cache";
import { DEPLOYED_API_BASE, DEFAULT_RELAY_URL, getConfig } from "../config";
import { probeTmdb } from "../api/tmdb";
import { colors, radius, space, type } from "../theme";
import { useSettings, type QualityPreference, type RuntimeSettings } from "../store/settings";
import { useUserData } from "../store/userData";
import { logInfo } from "../utils/logger";

type Probe = { tone: "ok" | "error" | "info"; label: string; detail: string } | null;
type Confirm = "cache" | "history" | "all" | null;

const QUALITY_OPTIONS: { value: QualityPreference; label: string; detail: string }[] = [
  { value: "auto", label: "Auto", detail: "Up to 1080p — the best picture a phone connection holds without stalling." },
  { value: "1080", label: "1080p", detail: "Full HD, pinned." },
  { value: "720", label: "720p", detail: "HD — lighter on slower or metered connections." },
  { value: "480", label: "480p", detail: "Data saver — smallest streams, softest picture." },
];

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "") || "the deployment";
}

/* The settings a streaming app actually needs. Connection plumbing is not one of
 * them: the APK ships wired to the deployed origin (src/config.ts), so the
 * person holding the phone gets playback preferences and data controls - not a
 * form asking for URLs and API keys. The connection fields still exist for
 * forks, collapsed at the bottom where they cannot be mistaken for required. */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, save } = useSettings();
  const { myList, continueWatching, removeProgress, clearAll } = useUserData();
  const [probe, setProbe] = useState<Probe>(null);
  const [testing, setTesting] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [draft, setDraft] = useState<RuntimeSettings>(settings);
  const [cacheInfo, setCacheInfo] = useState<{ entries: number; bytes: number }>({ entries: 0, bytes: 0 });

  /* The advanced draft never fights the hydrate race here: the fields only
   * mount when the disclosure is opened, long after AsyncStorage resolved. */
  useEffect(() => {
    if (showAdvanced) setDraft(settings);
  }, [showAdvanced, settings]);

  const measureCache = useCallback(() => {
    void cacheStats().then(setCacheInfo);
  }, []);

  useEffect(() => {
    measureCache();
  }, [measureCache]);

  const dirty = useMemo(
    () => (Object.keys(draft) as (keyof RuntimeSettings)[]).some((key) => draft[key] !== settings[key]),
    [draft, settings],
  );

  const fmtBytes = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  /* Saves first, then proves it - the probe is the SAME client the rails use
   * (api/tmdb.ts probeTmdb), so a green check cannot lie about which route
   * answered. It exists for the fork case, where the answer is not known. */
  const test = useCallback(async () => {
    save(draft);
    setTesting(true);
    setProbe(null);
    const cfg = getConfig();
    try {
      if (!cfg.hasTmdbAccess) {
        setProbe({
          tone: "error",
          label: "Still unconfigured",
          detail: "Enter a TMDB read key, a /api/tmdb proxy URL, or the deployed Streamly URL above.",
        });
        return;
      }
      const result = await probeTmdb();
      setProbe({
        tone: "ok",
        label: result.via === "proxy" ? "Catalogue reachable through the proxy" : "Catalogue reachable directly",
        detail:
          result.via === "proxy"
            ? "The proxy injected the key server-side; nothing is stored on this device."
            : `Answered by api.themoviedb.org with the stored key.` +
              (cfg.tmdbProxy ? " Note: the proxy did not answer, so this fell back to a direct call." : ""),
      });
    } catch (error) {
      const message = String((error as Error)?.message || error);
      setProbe({
        tone: "error",
        label: message.includes("401")
          ? "TMDB rejected the key (401)"
          : message.includes("404")
            ? "Nothing answered at that path (404) — a proxy URL must end at /api/tmdb"
            : message.includes("429")
              ? "Rate limited (429) — wait a minute and try again"
              : "Could not reach the catalogue",
        detail: message.includes("401")
          ? "Check the v3 read key, or clear the field to use the proxy."
          : `${message}`,
      });
    } finally {
      setTesting(false);
      logInfo("settings", "Ran the catalogue connection test.", {
        hasKey: Boolean(cfg.tmdbApiKey),
        hasProxy: Boolean(cfg.tmdbProxy),
      });
    }
  }, [draft, save]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + space.md,
        paddingBottom: space.xxl,
        paddingHorizontal: space.lg,
        gap: space.md,
      }}
    >
      <Text style={styles.heading}>Settings</Text>

      {/* ── Playback ─────────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Playback</Text>
      <View style={styles.card}>
        <Text style={styles.rowTitle}>Default quality</Text>
        <View style={styles.segmentWrap}>
          {QUALITY_OPTIONS.map((option) => {
            const active = settings.defaultQuality === option.value;
            return (
              <Touchable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Default quality ${option.label}`}
                onPress={() => save({ defaultQuality: option.value })}
                style={[styles.segment, active && styles.segmentActive]}
                scaleTo={0.95}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
              </Touchable>
            );
          })}
        </View>
        <Text style={styles.rowDetail}>{QUALITY_OPTIONS.find((o) => o.value === settings.defaultQuality)?.detail}</Text>
        <Text style={styles.rowHint}>
          Applies from the next title you open. Quality can also be switched inside the player.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleBody}>
            <Text style={styles.rowTitle}>Autoplay next episode</Text>
            <Text style={styles.rowDetail}>
              {settings.autoPlayNext
                ? "When an episode ends, the next one starts after a 12-second up-next card."
                : "Episodes end on the last frame; you pick what plays next."}
            </Text>
          </View>
          <Switch
            value={settings.autoPlayNext}
            onValueChange={(value) => save({ autoPlayNext: value })}
            trackColor={{ false: colors.surfaceHi, true: colors.redDim }}
            thumbColor={settings.autoPlayNext ? colors.red : colors.textFaint}
            accessibilityLabel="Autoplay next episode"
          />
        </View>
      </View>

      {/* ── Data and storage ─────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Data and storage</Text>
      <View style={[styles.card, styles.list]}>
        <View style={styles.dataRow}>
          <Text style={styles.rowTitle}>Catalogue cache</Text>
          <Text style={styles.dataValue}>
            {cacheInfo.entries} rail{cacheInfo.entries === 1 ? "" : "s"} · {fmtBytes(cacheInfo.bytes)}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setConfirm("cache")} style={styles.dataAction}>
          <Text style={[styles.dataActionText, styles.danger]}>Clear cached catalogue</Text>
        </Pressable>

        <View style={[styles.dataRow, styles.dataRowSpaced]}>
          <Text style={styles.rowTitle}>Watch history</Text>
          <Text style={styles.dataValue}>
            {continueWatching.length} resume point{continueWatching.length === 1 ? "" : "s"}
          </Text>
        </View>
        {continueWatching.length ? (
          <Pressable accessibilityRole="button" onPress={() => setConfirm("history")} style={styles.dataAction}>
            <Text style={[styles.dataActionText, styles.danger]}>Remove watch history</Text>
          </Pressable>
        ) : null}

        {myList.length || continueWatching.length ? (
          <>
            <View style={[styles.dataRow, styles.dataRowSpaced]}>
              <Text style={styles.rowTitle}>Everything on this device</Text>
              <Text style={styles.dataValue}>{myList.length} saved · {continueWatching.length} watching</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setConfirm("all")} style={styles.dataAction}>
              <Text style={[styles.dataActionText, styles.danger]}>Remove all</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      {confirm ? (
        <Banner
          tone="info"
          title={
            confirm === "cache"
              ? "Clear the cached catalogue?"
              : confirm === "history"
                ? "Remove all watch history?"
                : "Remove everything saved on this device?"
          }
          detail={
            confirm === "cache"
              ? "Posters and rails reload from the network next time. Nothing you saved is touched."
              : confirm === "history"
                ? "Resume points are deleted; titles you finished stay in My List."
                : "My List, watch history and the catalogue cache are erased. This cannot be undone."
          }
          actionLabel={confirm === "all" ? "Remove everything" : confirm === "cache" ? "Clear cache" : "Remove history"}
          onAction={() => {
            if (confirm === "cache") {
              void clearCache().then(() => {
                measureCache();
                logInfo("settings", "Catalogue cache cleared from Settings.");
              });
            } else if (confirm === "history") {
              continueWatching.forEach((entry) => removeProgress(entry.id));
            } else {
              clearAll();
              void clearCache().then(measureCache);
            }
            setConfirm(null);
          }}
        />
      ) : null}

      {/* ── About ────────────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <View style={styles.dataRow}>
          <Text style={styles.rowTitle}>Streamly</Text>
          <Text style={styles.dataValue}>1.0.0 · Android</Text>
        </View>
        <Text style={styles.rowDetail}>
          A phone-shaped Streamly: the catalogue, search, My List and a native player. The full
          feature set lives on streamlyvercelin.vercel.app in a browser.
        </Text>
      </View>

      {/* ── Fork-only plumbing, deliberately last and collapsed ──────────── */}
      <Touchable
        accessibilityLabel={showAdvanced ? "Hide connection options" : "Show connection options"}
        accessibilityState={{ expanded: showAdvanced }}
        onPress={() => setShowAdvanced((v) => !v)}
        style={styles.disclosure}
        scaleTo={0.98}
      >
        <Text style={styles.disclosureText}>{showAdvanced ? "▾" : "▸"} Connection options</Text>
      </Touchable>
      <Text style={styles.rowHint}>
        For forks and self-hosted copies only. The official app is already connected; nothing here
        needs changing.
      </Text>

      {showAdvanced ? (
        <>
          {field("tmdbApiKey", "TMDB API read key", "e.g. 1a2b3c… (v3 read token)", "Optional. Only to bypass the site's own proxy on networks that block it.", true, draft, setDraft)}
          {field("tmdbProxy", "Catalogue proxy URL", `${getConfig().apiBase}/api/tmdb`, "Optional. Injects the key server-side.", false, draft, setDraft)}
          {field("apiBase", "Streamly deployment URL", DEPLOYED_API_BASE, "Optional. Hosts the catalogue proxy and the stream resolver.", false, draft, setDraft)}
          {field("relayUrl", "Relay URL (playback fallback)", `default: ${DEFAULT_RELAY_URL}`, "Optional. Used only when a source host refuses direct playback.", false, draft, setDraft)}
          <View style={styles.actions}>
            <Touchable
              accessibilityLabel="Save settings"
              disabled={!dirty}
              onPress={() => save(draft)}
              style={[styles.primary, !dirty && styles.disabled]}
              scaleTo={0.95}
            >
              <Text style={styles.primaryText}>Save</Text>
            </Touchable>
            <Touchable accessibilityLabel="Save and test" onPress={test} style={styles.secondary} scaleTo={0.95}>
              <Text style={styles.secondaryText}>{testing ? "Testing…" : "Save & test"}</Text>
            </Touchable>
            <Touchable
              accessibilityLabel="Reset to defaults"
              onPress={() => {
                save({ tmdbApiKey: "", tmdbProxy: "", apiBase: "", relayUrl: "" });
                setDraft({ ...draft, tmdbApiKey: "", tmdbProxy: "", apiBase: "", relayUrl: "" });
              }}
              style={styles.ghost}
              scaleTo={0.97}
            >
              <Text style={styles.ghostText}>Reset</Text>
            </Touchable>
          </View>
          {probe ? <Banner tone={probe.tone === "ok" ? "info" : "error"} title={probe.label} detail={probe.detail} /> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function field(
  key: "tmdbApiKey" | "tmdbProxy" | "apiBase" | "relayUrl",
  label: string,
  placeholder: string,
  hint: string,
  secure: boolean,
  draft: RuntimeSettings,
  setDraft: (updater: (prev: RuntimeSettings) => RuntimeSettings) => void,
) {
  return (
    <View style={styles.field} key={key}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={draft[key]}
        onChangeText={(text) => setDraft((prev) => ({ ...prev, [key]: text }))}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        keyboardType={key === "tmdbApiKey" ? "numbers-and-punctuation" : "url"}
      />
      <Text style={styles.rowHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heading: { color: colors.text, fontSize: type.hero, fontWeight: "800" },
  sectionTitle: {
    color: colors.textDim,
    fontSize: type.tiny,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: space.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  list: { gap: 0 },
  rowTitle: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  rowDetail: { color: colors.textDim, fontSize: type.small, lineHeight: 18 },
  rowHint: { color: colors.textFaint, fontSize: type.tiny, lineHeight: 15 },
  segmentWrap: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  segment: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
  },
  segmentActive: { backgroundColor: colors.red },
  segmentText: { color: colors.textDim, fontSize: type.small, fontWeight: "700" },
  segmentTextActive: { color: colors.text, fontWeight: "800" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  toggleBody: { flex: 1, gap: space.xs },
  dataRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space.md },
  dataRowSpaced: { marginTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dataValue: { color: colors.textFaint, fontSize: type.tiny, fontVariant: ["tabular-nums"] },
  dataAction: { paddingVertical: space.md, alignSelf: "flex-start" },
  dataActionText: { fontSize: type.small, fontWeight: "700" },
  danger: { color: colors.red },
  disclosure: { paddingVertical: space.md, marginTop: space.lg },
  disclosureText: { color: colors.textDim, fontSize: type.small, fontWeight: "700" },
  field: { gap: space.xs, marginTop: space.md },
  label: { color: colors.text, fontSize: type.small, fontWeight: "700" },
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
  actions: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg, flexWrap: "wrap" },
  primary: { backgroundColor: colors.red, paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.pill },
  disabled: { opacity: 0.4 },
  primaryText: { color: colors.text, fontWeight: "800", fontSize: type.body },
  secondary: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.pill, backgroundColor: colors.surfaceHi },
  secondaryText: { color: colors.text, fontWeight: "700", fontSize: type.body },
  ghost: { paddingHorizontal: space.lg, paddingVertical: space.md },
  ghostText: { color: colors.textFaint, fontSize: type.small, textDecorationLine: "underline" },
});
