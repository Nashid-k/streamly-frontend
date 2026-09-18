import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PreferencesProvider } from "../context/PreferencesContext";
import { usePreferences } from "../context/preferences";

function PreferenceProbe() {
  const { autoplay, notifications, theme, serverOrder, setPreference } = usePreferences();
  return (
    <>
      <output>{`${autoplay}:${notifications}:${theme}`}</output>
      <output data-testid="server-order">{serverOrder.join(" | ")}</output>
      <button type="button" onClick={() => setPreference("notifications", false)}>
        Disable notifications
      </button>
      <button type="button" onClick={() => setPreference("reduceMotion", true)}>
        Reduce motion
      </button>
      <button type="button" onClick={() => setPreference("theme", "emerald")}>
        Emerald theme
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
      "Server 2 (Fast) | Server 1 | Server 5 (VidCore)",
    );
    // The stored key is rewritten in place so the migration is idempotent.
    expect(localStorage.getItem("setting-serverOrder")).toBe(
      JSON.stringify(["Server 2 (Fast)", "Server 1", "Server 5 (VidCore)"]),
    );
  });

  it("leaves already-current server orders untouched", () => {
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
      "Server 8 (Smashy) | Server 1",
    );
  });
});
