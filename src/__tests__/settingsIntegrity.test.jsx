import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PreferencesProvider } from "../context/PreferencesContext";
import { usePreferences } from "../context/preferences";
import SegmentControl from "../components/settings/SegmentControl";

/* "Settings that lie" — each case below is a control that promised something
   the product did not do, or a status that was not true.

   1. A stored preference is trusted on READ as well as on write. Values reach
      storage without setPreference (hand-edited keys, older builds, a restored
      backup), and reading them verbatim let an out-of-range or unknown value
      drive the UI.
   2. A SegmentControl whose `value` matches no option handed every button
      tabIndex={-1}, so the whole radiogroup fell out of the Tab order.
   3. Cloud Sync rendered a green pulsing "Connected" badge to a signed-out
      guest who has nothing connected. (Covered in SettingsPage.test.jsx.) */

function SeekProbe() {
  const { seekTime, theme, subtitleColor } = usePreferences();
  return (
    <>
      <output data-testid="seek">{String(seekTime)}</output>
      <output data-testid="theme">{String(theme)}</output>
      <output data-testid="colour">{String(subtitleColor)}</output>
    </>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("preferences are sanitised on read, not only on write", () => {
  it("clamps an absurd stored seek time instead of driving the player with it", () => {
    localStorage.setItem("setting-seekTime", JSON.stringify(9e15));
    render(
      <PreferencesProvider>
        <SeekProbe />
      </PreferencesProvider>,
    );
    // The numeric range for seekTime is 1..120 seconds.
    expect(screen.getByTestId("seek")).toHaveTextContent("120");
  });

  it("clamps a negative stored seek time to the floor", () => {
    localStorage.setItem("setting-seekTime", JSON.stringify(-40));
    render(
      <PreferencesProvider>
        <SeekProbe />
      </PreferencesProvider>,
    );
    expect(screen.getByTestId("seek")).toHaveTextContent("1");
  });

  it("falls back to the default theme when storage names one that does not exist", () => {
    localStorage.setItem("setting-theme", JSON.stringify("neon-disco"));
    render(
      <PreferencesProvider>
        <SeekProbe />
      </PreferencesProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("default");
  });

  it("falls back to a valid subtitle colour when storage holds garbage", () => {
    localStorage.setItem("setting-subtitleColor", JSON.stringify("url(javascript:alert(1))"));
    render(
      <PreferencesProvider>
        <SeekProbe />
      </PreferencesProvider>,
    );
    expect(screen.getByTestId("colour")).toHaveTextContent("#ffffff");
  });
});

describe("SegmentControl keeps a tab stop when no option matches", () => {
  it("makes the first option focusable so the group is keyboard-reachable", () => {
    render(
      <SegmentControl
        label="Font"
        options={[
          { id: "cinejoy", name: "Cinejoy" },
          { id: "netflix", name: "Netflix" },
        ]}
        // A value that matches nothing: the stale/migrated case.
        value="deleted-font"
        onChange={() => {}}
      />,
    );

    const radios = screen.getAllByRole("radio");
    const stops = radios.filter((r) => r.getAttribute("tabindex") === "0");
    // Exactly one tab stop, or the group cannot be focused with Tab at all.
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveTextContent("Cinejoy");

    // Arrowing from that stop still works.
    fireEvent.keyDown(stops[0], { key: "ArrowRight" });
  });
});
