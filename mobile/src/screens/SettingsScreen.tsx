import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner } from "../components/PosterCard";
import { Touchable } from "../components/motion";
import { DEPLOYED_API_BASE, getConfig, DEFAULT_RELAY_URL } from "../config";
import { probeTmdb } from "../api/tmdb";
import { colors, radius, space, type } from "../theme";
import { useSettings, type RuntimeSettings } from "../store/settings";
import { logInfo } from "../utils/logger";

type Probe = { tone: "ok" | "error" | "info"; label: string; detail: string } | null;

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "") || "the deployment";
}

/* Not a setup screen - the APK ships wired to the deployed Streamly origin
 * (see src/config.ts), so this is an escape hatch: a fork, a self-hosted copy, or
 * a direct TMDB key for someone who wants one. Everything in here is optional and
 * stored only on this device; leave it alone and the app behaves like any other
 * streaming app. */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, save, clearAll } = useSettings();
  const [draft, setDraft] = useState<RuntimeSettings>(settings);
  const [probe, setProbe] = useState<Probe>(null);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const dirty = useMemo(
    () => (Object.keys(draft) as (keyof RuntimeSettings)[]).some((key) => draft[key] !== settings[key]),
    [draft, settings],
  );

  /* AsyncStorage hydrates AFTER the first paint, so the form starts empty and
   * would look "empty" to someone who already saved values. Pull them in once
   * they arrive - but never over what the user is currently typing. */
  useEffect(() => {
    if (!dirty) setDraft(settings);
  }, [settings, dirty]);

  const field = useCallback(
    (key: keyof RuntimeSettings, label: string, placeholder: string, hint: string, secure = false) => (
      <View style={styles.field}>
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
        <Text style={styles.hint}>{hint}</Text>
      </View>
    ),
    [draft],
  );

  /* Saves first, then proves it. The probe is the SAME client the rails use
   * (api/tmdb.ts probeTmdb): same config resolution, same proxy-first order, and
   * it reports which route actually answered - a "TMDB reachable" tick that
   * quietly ignored the proxy would be worse than no tick at all. */
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
        label: result.via === "proxy" ? "TMDB reachable through your proxy" : "TMDB reachable directly",
        detail:
          result.via === "proxy"
            ? "The proxy injected the key server-side, so nothing was stored on this device."
            : `Answered by api.themoviedb.org with your read key. Images: ${result.imageBaseUrl ?? "unknown base"}.` +
              (cfg.tmdbProxy ? " Note: your proxy URL did not answer, so this fell back to a direct call." : ""),
      });
    } catch (error) {
      const message = String((error as Error)?.message || error);
      if (message.includes("401")) {
        setProbe({
          tone: "error",
          label: "TMDB rejected the key (401)",
          detail: "Check the v3 read key at themoviedb.org/settings/api, or use the deployed proxy URL instead.",
        });
      } else if (message.includes("404")) {
        setProbe({
          tone: "error",
          label: "Nothing answered at that path (404)",
          detail: "A proxy URL should end at /api/tmdb - an extra /3 or a trailing /movie makes it 404.",
        });
      } else if (message.includes("429")) {
        setProbe({
          tone: "error",
          label: "Rate limited (429)",
          detail: "Too many requests right now. Wait a minute and try again.",
        });
      } else {
        setProbe({
          tone: "error",
          label: "Could not reach TMDB",
          detail: `${message} - the device may be offline, or api.themoviedb.org is blocked on this network.`,
        });
      }
    } finally {
      setTesting(false);
      logInfo("settings", "Ran the TMDB connection test.", {
        hasKey: Boolean(cfg.tmdbApiKey),
        hasProxy: Boolean(cfg.tmdbProxy),
        hasApiBase: Boolean(cfg.apiBase),
      });
    }
  }, [draft, save]);

  const cfg = getConfig();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxl, paddingHorizontal: space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>Settings</Text>

      <Banner
        tone="info"
        title={`Connected to ${hostOf(cfg.apiBase)}`}
        detail="This build is wired to the Streamly deployment - catalogue and playback both work out of the box. Change anything below only if you are running your own copy."
      />

      <Touchable
        accessibilityLabel={showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
        accessibilityState={{ expanded: showAdvanced }}
        onPress={() => setShowAdvanced((v) => !v)}
        style={styles.disclosure}
        scaleTo={0.98}
      >
        <Text style={styles.disclosureText}>{showAdvanced ? "▾" : "▸"} Advanced connection options</Text>
      </Touchable>

      {showAdvanced ? (
        <>
          {field(
            "tmdbApiKey",
            "TMDB API read key",
            "e.g. 1a2b3c… (v3 read access token)",
            "Optional. Only needed to bypass the site's own proxy - which is worth doing on networks where api.themoviedb.org is blocked and the proxy is not.",
            true,
          )}
          {field(
            "tmdbProxy",
            "TMDB proxy URL",
            `${cfg.apiBase}/api/tmdb`,
            "Optional. Defaults to the deployed site's /api/tmdb, which injects the key server-side.",
          )}
          {field(
            "apiBase",
            "Deployed Streamly URL",
            DEPLOYED_API_BASE,
            "Optional. Hosts the catalogue proxy and the stream resolver. Defaults to the official deployment.",
          )}
          {field(
            "relayUrl",
            "Relay URL (playback fallback)",
            `default: ${DEFAULT_RELAY_URL}`,
            "Optional. Only used when a source host refuses direct playback and every URI has to be rewritten.",
          )}
        </>
      ) : null}

      {showAdvanced ? (
        <View style={styles.actions}>
          <Touchable
            accessibilityLabel="Save settings"
            disabled={!dirty}
            onPress={() => {
              save(draft);
              logInfo("settings", "Saved runtime settings from the device.");
            }}
            style={[styles.primary, !dirty && styles.disabled]}
            scaleTo={0.95}
          >
            <Text style={styles.primaryText}>Save</Text>
          </Touchable>
          <Touchable accessibilityLabel="Save and test" onPress={test} style={styles.secondary} scaleTo={0.95}>
            <Text style={styles.secondaryText}>{testing ? "Testing…" : "Save & test"}</Text>
          </Touchable>
          <Touchable accessibilityLabel="Clear settings" onPress={clearAll} style={styles.ghost} scaleTo={0.97}>
            <Text style={styles.ghostText}>Reset to default</Text>
          </Touchable>
        </View>
      ) : null}

      {probe ? (
        <Banner tone={probe.tone === "ok" ? "info" : "error"} title={probe.label} detail={probe.detail} />
      ) : null}

      <Text style={styles.diagnostics}>Diagnostics</Text>
      <View style={styles.diagList}>
        <DiagRow label="Catalogue" value={cfg.hasTmdbAccess ? hostOf(cfg.tmdbProxy) : "missing"} ok={cfg.hasTmdbAccess} />
        <DiagRow label="Playback" value={cfg.hasResolver ? hostOf(cfg.apiBase) : "missing"} ok={cfg.hasResolver} />
        <DiagRow label="Key stored" value={cfg.tmdbApiKey ? "yes (direct TMDB)" : "no (proxy injects it)"} ok />
      </View>
      <Text style={styles.hint}>
        Every failure also lands in logcat: adb logcat | Select-String "[Streamly]".
      </Text>
    </ScrollView>
  );
}

function DiagRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.diagRow}>
      <Text style={styles.diagLabel}>{label}</Text>
      <Text style={[styles.diagValue, ok ? styles.diagOk : styles.diagBad]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heading: { color: colors.text, fontSize: type.hero, fontWeight: "800", marginBottom: space.md },
  note: { color: colors.textFaint, fontSize: type.tiny, marginBottom: space.sm, lineHeight: 15 },
  disclosure: { paddingVertical: space.md },
  disclosureText: { color: colors.textDim, fontSize: type.small, fontWeight: "700" },
  field: { gap: space.xs, marginTop: space.lg },
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
  hint: { color: colors.textFaint, fontSize: type.tiny, lineHeight: 15 },
  actions: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xl, flexWrap: "wrap" },
  primary: { backgroundColor: colors.red, paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.pill },
  disabled: { opacity: 0.4 },
  primaryText: { color: colors.text, fontWeight: "800", fontSize: type.body },
  secondary: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.pill, backgroundColor: colors.surfaceHi },
  secondaryText: { color: colors.text, fontWeight: "700", fontSize: type.body },
  ghost: { paddingHorizontal: space.lg, paddingVertical: space.md },
  ghostText: { color: colors.textFaint, fontSize: type.small, textDecorationLine: "underline" },
  diagnostics: { color: colors.text, fontSize: type.title, fontWeight: "700", marginTop: space.xxl },
  diagList: { marginTop: space.md, gap: space.sm },
  diagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  diagLabel: { color: colors.textDim, fontSize: type.small, width: 110 },
  diagValue: { flex: 1, fontSize: type.tiny },
  diagOk: { color: colors.green, fontWeight: "700" },
  diagBad: { color: colors.red, fontWeight: "700" },
});
