import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PreferencesProvider } from "../context/PreferencesContext";
import { usePreferences } from "../context/preferences";

function PreferenceProbe() {
  const { autoplay, notifications, setPreference } = usePreferences();
  return (
    <>
      <output>{`${autoplay}:${notifications}`}</output>
      <button type="button" onClick={() => setPreference("notifications", false)}>
        Disable notifications
      </button>
      <button type="button" onClick={() => setPreference("reduceMotion", true)}>
        Reduce motion
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

    expect(screen.getByText("true:true")).toBeInTheDocument();
  });

  it("preserves the player autoplay setting from earlier versions", () => {
    localStorage.setItem("streamly_autoNext", "false");

    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    expect(screen.getByText("false:true")).toBeInTheDocument();
  });

  it("updates the active UI and persists a setting", () => {
    render(
      <PreferencesProvider>
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    act(() => screen.getByText("Disable notifications").click());

    expect(screen.getByText("true:false")).toBeInTheDocument();
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
});
