import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PreferencesProvider } from "../context/PreferencesContext";
import { usePreferences } from "../context/preferences";

function PreferenceProbe() {
  const { autoplay, notifications, theme, enableAds, setPreference } = usePreferences();
  return (
    <>
      <output>{`${autoplay}:${notifications}:${theme}:${enableAds}`}</output>
      <button type="button" onClick={() => setPreference("notifications", false)}>
        Disable notifications
      </button>
      <button type="button" onClick={() => setPreference("reduceMotion", true)}>
        Reduce motion
      </button>
      <button type="button" onClick={() => setPreference("theme", "emerald")}>
        Emerald theme
      </button>
      <button type="button" onClick={() => setPreference("enableAds", false)}>
        Disable ads
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

    expect(screen.getByText("true:true:default:true")).toBeInTheDocument();
  });

  it("preserves the player autoplay setting from earlier versions", () => {
    localStorage.setItem("streamly_autoNext", "false");

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(screen.getByText("false:true:default:true")).toBeInTheDocument();
  });

  it("updates the active UI and persists a setting", () => {
    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    act(() => screen.getByText("Disable notifications").click());

    expect(screen.getByText("true:false:default:true")).toBeInTheDocument();
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

    expect(screen.getByText("true:true:emerald:true")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("emerald");
    expect(localStorage.getItem("setting-theme")).toBe('"emerald"');
  });

  it("exposes the ads toggle on the document so it never silently no-ops", () => {
    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(document.documentElement.dataset.adsEnabled).toBe("true");

    act(() => screen.getByText("Disable ads").click());

    expect(screen.getByText("true:true:default:false")).toBeInTheDocument();
    expect(document.documentElement.dataset.adsEnabled).toBe("false");
    expect(localStorage.getItem("setting-enableAds")).toBe("false");
  });

  it("recovers playerControls from corrupt storage instead of breaking toggles", () => {
    localStorage.setItem("setting-playerControls", '"corrupt"');

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    // Defaults survive corrupt storage; the settings UI stays usable.
    expect(screen.getByText("true:true:default:true")).toBeInTheDocument();
  });
});
