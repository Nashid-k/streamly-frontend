import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PreferencesProvider } from "../context/PreferencesContext";
import { readLegacyMuted, readLegacyVolume, usePreferences } from "../context/preferences";

function PreferenceProbe() {
  const { autoplay, notifications, theme, serverOrder, volume, muted, setPreference } =
    usePreferences();
  return (
    <>
      <output>{`${autoplay}:${notifications}:${theme}`}</output>
      <output data-testid="server-order">{serverOrder.join(" | ")}</output>
      <output data-testid="audio">{`${volume}:${muted}`}</output>
      <button type="button" onClick={() => setPreference("notifications", false)}>
        Disable notifications
      </button>
      <button type="button" onClick={() => setPreference("reduceMotion", true)}>
        Reduce motion
      </button>
      <button type="button" onClick={() => setPreference("theme", "emerald")}>
        Emerald theme
      </button>
      <button type="button" onClick={() => setPreference("volume", 0.5)}>
        Half volume
      </button>
      <button type="button" onClick={() => setPreference("muted", true)}>
        Mute
      </button>
    </>
  );
}

beforeEach(() => localStorage.clear());

describe("PreferencesProvider", () => {
  it("uses the product defaults", () => {
    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(screen.getByText("true:true:default")).toBeInTheDocument();
  });

  it("preserves the player autoplay setting from earlier versions", () => {
    localStorage.setItem("streamly_autoNext", "false");

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(screen.getByText("false:true:default")).toBeInTheDocument();
  });

  it("updates the active UI and persists a setting", () => {
    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    act(() => screen.getByText("Disable notifications").click());

    expect(screen.getByText("true:false:default")).toBeInTheDocument();
    expect(localStorage.getItem("setting-notifications")).toBe("false");
  });

  it("marks the document when reduced motion is enabled", () => {
    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    act(() => screen.getByText("Reduce motion").click());

    expect(document.documentElement.dataset.reduceMotion).toBe("true");
  });

  it("applies the theme to the document and persists it", () => {
    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    act(() => screen.getByText("Emerald theme").click());

    expect(screen.getByText("true:true:emerald")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("emerald");
    expect(localStorage.getItem("setting-theme")).toBe('"emerald"');
  });

  it("retires keys from removed integrations on boot", () => {
    localStorage.setItem("streamly_trakt", "moviebuff");
    localStorage.setItem("streamly_simkl", "animefan");
    localStorage.setItem("setting-enableAds", "false");
    localStorage.setItem("setting-febboxCookie", '"abc123"');

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(localStorage.getItem("streamly_trakt")).toBeNull();
    expect(localStorage.getItem("streamly_simkl")).toBeNull();
    expect(localStorage.getItem("setting-enableAds")).toBeNull();
    expect(localStorage.getItem("setting-febboxCookie")).toBeNull();
    expect(document.documentElement.dataset.adsEnabled).toBeUndefined();
  });

  it("migrates a saved Lisbon-era server order to the restored Server 1–8 labels, position preserved", () => {
    localStorage.setItem(
      "setting-serverOrder",
      JSON.stringify(["Nebula", "Lisbon", "Joy"]),
    );

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("server-order")).toHaveTextContent(
      "Server 2 | Server 1 | Server 5",
    );
    // The stored key is rewritten in place so the migration is idempotent.
    expect(localStorage.getItem("setting-serverOrder")).toBe(
      JSON.stringify(["Server 2", "Server 1", "Server 5"]),
    );
  });

  it("migrates a saved suffixed server order to the plain labels, position preserved", () => {
    localStorage.setItem(
      "setting-serverOrder",
      JSON.stringify(["Server 8 (Smashy)", "Server 1"]),
    );

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("server-order")).toHaveTextContent(
      "Server 8 | Server 1",
    );
    expect(localStorage.getItem("setting-serverOrder")).toBe(
      JSON.stringify(["Server 8", "Server 1"]),
    );
  });

  it("leaves already-current server orders untouched", () => {
    localStorage.setItem(
      "setting-serverOrder",
      JSON.stringify(["Server 3", "Server 1"]),
    );

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("server-order")).toHaveTextContent(
      "Server 3 | Server 1",
    );
  });

  it("migrates the legacy player volume and mute with no data loss", () => {
    localStorage.setItem("streamly-native-volume", "0.3");
    localStorage.setItem("streamly-native-muted", "1");

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("audio")).toHaveTextContent("0.3:true");
  });

  it("keeps a legacy volume of zero instead of treating it as unset", () => {
    localStorage.setItem("streamly-native-volume", "0");

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("audio")).toHaveTextContent("0:false");
  });

  it("lets the folded setting win over the legacy key", () => {
    localStorage.setItem("setting-volume", "0.8");
    localStorage.setItem("streamly-native-volume", "0.2");

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("audio")).toHaveTextContent("0.8:false");
  });

  it("clamps a corrupt stored volume into the playable range", () => {
    localStorage.setItem("setting-volume", "9.5");

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("audio")).toHaveTextContent("1:false");
  });

  it("persists volume and mute as validated settings", () => {
    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    act(() => screen.getByText("Half volume").click());
    expect(screen.getByTestId("audio")).toHaveTextContent("0.5:false");
    expect(localStorage.getItem("setting-volume")).toBe("0.5");

    act(() => screen.getByText("Mute").click());
    expect(screen.getByTestId("audio")).toHaveTextContent("0.5:true");
    expect(localStorage.getItem("setting-muted")).toBe("true");
  });
});

describe("legacy audio readers", () => {
  it("clamps the legacy volume and treats absent as null", () => {
    localStorage.setItem("streamly-native-volume", "2");
    expect(readLegacyVolume(localStorage)).toBe(1);
    localStorage.setItem("streamly-native-volume", "-0.4");
    expect(readLegacyVolume(localStorage)).toBe(0);
    localStorage.setItem("streamly-native-volume", "0.42");
    expect(readLegacyVolume(localStorage)).toBe(0.42);
    localStorage.removeItem("streamly-native-volume");
    expect(readLegacyVolume(localStorage)).toBeNull();
  });

  it("reads legacy mute as '1' and absent as null", () => {
    localStorage.setItem("streamly-native-muted", "1");
    expect(readLegacyMuted(localStorage)).toBe(true);
    localStorage.setItem("streamly-native-muted", "0");
    expect(readLegacyMuted(localStorage)).toBe(false);
    localStorage.removeItem("streamly-native-muted");
    expect(readLegacyMuted(localStorage)).toBeNull();
  });
});
