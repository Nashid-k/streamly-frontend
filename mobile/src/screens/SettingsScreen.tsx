import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner } from "../components/PosterCard";
import { getConfig, isPreconfigured, DEFAULT_RELAY_URL } from "../config";
import { probeTmdb } from "../api/tmdb";
import { colors, radius, space, type } from "../theme";
import { useSettings, type RuntimeSettings } from "../store/settings";
import { logInfo } from "../utils/logger";

type Probe = { tone: "ok" | "error" | "info"; label: string; detail: string } | null;

/* The fix for "TMDB is not configured" on an installed APK: the credentials are
 * typed here, on the device, and read at request time (src/config.ts) - so a
 * shipped build never needs a rebuild, and a wrong value can be corrected
 * without touching a build machine. The same three values can still be baked in
 * at build time via EXPO_PUBLIC_* (see .env.example); whatever is filled in here
 * wins. */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, save, clearAll } = useSettings();
  const [draft, setDraft] = useState<RuntimeSettings>(settings);
  const [probe, setProbe] = useState<Probe>(null);
  const [testing, setTesting] = useState(false);

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

      {cfg.hasTmdbAccess ? (
        <Banner
          tone="info"
          title="Catalogue connected"
          detail={`Configured: TMDB will be reached ${cfg.tmdbApiKey ? "directly with your key" : `through ${cfg.tmdbProxy}`}. Use "Save & test" below to confirm which route really answers.`}
        />
      ) : (
        <Banner
          tone="error"
          title="TMDB is not configured"
          detail="The app cannot load any catalogue until it knows where TMDB is. Fill in ONE of the first two fields below, or give it your deployed Streamly URL and it will use that site's /api/tmdb proxy for you."
        />
      )}

      {isPreconfigured() ? null : (
        <Text style={styles.note}>
          This build shipped without credentials baked in, which is why you are seeing this. Values are
          stored only on this device.
        </Text>
      )}

      {field(
        "tmdbApiKey",
        "TMDB API read key",
        "e.g. 1a2b3c… (v3 read access token)",
        "From themoviedb.org/settings/api. A read token is designed to be public — it is already readable inside any web bundle.",
        true,
      )}
      {field(
        "tmdbProxy",
        "TMDB proxy URL (optional)",
        "https://your-app.vercel.app/api/tmdb",
        "Leave blank if you entered a key. Set this instead to stay keyless: the proxy injects the key server-side.",
      )}
      {field(
        "apiBase",
        "Deployed Streamly URL",
        "https://your-app.vercel.app",
        "Needed to PLAY anything: the stream resolver lives at <url>/api/downloadify on your deployed site. Also used for the TMDB proxy when the field above is blank.",
      )}
      {field("relayUrl", "Relay URL (advanced)", `default: ${DEFAULT_RELAY_URL}`, "Cloudflare passthrough that adds the Referer/User-Agent the source hosts require. Leave blank for the default.")}

      {probe ? (
        <Banner tone={probe.tone === "ok" ? "info" : "error"} title={probe.label} detail={probe.detail} />
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save settings"
          disabled={!dirty}
          onPress={() => {
            save(draft);
            logInfo("settings", "Saved runtime settings from the device.");
          }}
          style={[styles.primary, !dirty && styles.disabled]}
        >
          <Text style={styles.primaryText}>Save</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Save and test" onPress={test} style={styles.secondary}>
          <Text style={styles.secondaryText}>{testing ? "Testing…" : "Save & test"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear settings" onPress={clearAll} style={styles.ghost}>
          <Text style={styles.ghostText}>Reset</Text>
        </Pressable>
      </View>

      <Text style={styles.diagnostics}>Diagnostics</Text>
      <View style={styles.diagList}>
        <DiagRow label="Catalogue" value={cfg.hasTmdbAccess ? "configured" : "missing"} ok={cfg.hasTmdbAccess} />
        <DiagRow label="Stream resolver" value={cfg.hasResolver ? cfg.apiBase : "missing"} ok={cfg.hasResolver} />
        <DiagRow label="Relay" value={cfg.relayUrl} ok />
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
