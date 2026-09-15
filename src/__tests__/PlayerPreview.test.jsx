import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PlayerPreview from "../components/PlayerPreview";
import { PreferencesProvider } from "../context/PreferencesContext";
import {
  PLAYER_CONTROLS,
  PLAYER_UI_PRESETS,
  resolveUILayout,
} from "../components/playerUIDef";

const renderPreview = (props = {}) =>
  render(
    <PreferencesProvider>
      <PlayerPreview {...props} />
    </PreferencesProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "default";
});

describe("PlayerPreview", () => {
  it("renders the demo video element with muted looping preview attributes", () => {
    const { container } = renderPreview();
    const video = container.querySelector("video.player-preview-video");
    expect(video).toBeInTheDocument();
    // React sets `muted` as a DOM property, not an attribute.
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("autoplay");
    expect(video.getAttribute("src")).toContain("bigbuckbunny");
  });

  it("renders the classic preset chrome: clusters, progress, time row, subtitle", () => {
    renderPreview({ label: "Classic" });
    const preview = screen.getByTestId("player-preview");
    // bottomLeft: playPause, jump (2 buttons), volume
    expect(within(preview).getByTitle("Play / Pause")).toBeInTheDocument();
    expect(within(preview).getByTitle("Back 10s")).toBeInTheDocument();
    expect(within(preview).getByTitle("Forward 10s")).toBeInTheDocument();
    // bottomRight: subtitles/audio/aspect/fullscreen
    expect(within(preview).getByTitle("Subtitles")).toBeInTheDocument();
    expect(within(preview).getByTitle("Fullscreen")).toBeInTheDocument();
    // time row
    expect(within(preview).getByText("1:47 / 10:34")).toBeInTheDocument();
    // subtitle line
    expect(within(preview).getByText(/Here is what your subtitles will look like/)).toBeInTheDocument();
    // caption chip
    expect(within(preview).getByText("Classic")).toBeInTheDocument();
  });

  it("honors hidden (tray + eye-off) controls — Minimal shows no subtitle button", () => {
    const minimal = PLAYER_UI_PRESETS.find((p) => p.id === "minimal");
    renderPreview({
      layout: minimal.layout,
      visibility: { ...minimal.visibility, subtitles: false, jumpForwardBackward: false },
      label: "Minimal",
    });
    const preview = screen.getByTestId("player-preview");
    expect(within(preview).getByTitle("Play / Pause")).toBeInTheDocument();
    expect(within(preview).queryByTitle("Subtitles")).not.toBeInTheDocument();
    expect(within(preview).queryByTitle("Forward 10s")).not.toBeInTheDocument();
  });

  it("moves controls when the layout changes (bottomCenter compact icons)", () => {
    const layout = resolveUILayout({ playPause: "bottomCenter" });
    renderPreview({ layout });
    const preview = screen.getByTestId("player-preview");
    // In the real player, bottomCenter renders compact (muted) icons.
    const center = preview.querySelector(".player-preview-cluster--center");
    expect(center).not.toBeNull();
    expect(within(center).getByTitle("Play / Pause")).toBeInTheDocument();
    // And it no longer sits in the left cluster.
    const left = preview.querySelector(".player-preview-bar .player-preview-cluster:first-child");
    expect(within(left).queryByTitle("Play / Pause")).not.toBeInTheDocument();
  });

  it("volume renders the slider variant only on outer bottom corners", () => {
    // Theater puts volume in bottomRight (slider) — Studio top cluster (icon-only).
    const theater = PLAYER_UI_PRESETS.find((p) => p.id === "theater");
    const { unmount } = renderPreview({ layout: theater.layout, visibility: theater.visibility });
    expect(document.querySelector(".player-preview-volume")).not.toBeNull();
    unmount();

    const studioPreset = PLAYER_UI_PRESETS.find((p) => p.id === "studio");
    renderPreview({ layout: studioPreset.layout, visibility: studioPreset.visibility });
    // Studio preset places volume in topRight → compact icon, no slider.
    expect(document.querySelector(".player-preview-volume")).toBeNull();
  });

  it("hides all chrome in bare mode (Subtitles preview)", () => {
    renderPreview({ showChrome: false });
    const preview = screen.getByTestId("player-preview");
    expect(within(preview).queryByTitle("Play / Pause")).not.toBeInTheDocument();
    expect(within(preview).queryByTitle("Fullscreen")).not.toBeInTheDocument();
    // Subtitle line still renders with live styles.
    expect(within(preview).getByText(/Here is what your subtitles will look like/)).toBeInTheDocument();
  });

  it("renders every on-bar Classic control somewhere in the chrome", () => {
    const classic = PLAYER_UI_PRESETS.find((p) => p.id === "classic");
    renderPreview({ layout: classic.layout, visibility: classic.visibility });
    const preview = screen.getByTestId("player-preview");
    // Verify controls render based on their layout and visibility in Classic
    for (const { key, label } of PLAYER_CONTROLS) {
      if (key === "jumpForwardBackward") {
        expect(within(preview).getByTitle("Back 10s")).toBeInTheDocument();
      } else if (key === "volume") {
        expect(within(preview).getByTitle("Volume")).toBeInTheDocument();
      } else if (classic.layout[key] !== "tray" && classic.visibility[key] !== false) {
        expect(within(preview).getByTitle(label)).toBeInTheDocument();
      } else {
        expect(within(preview).queryByTitle(label)).not.toBeInTheDocument();
      }
    }
  });

  it("applies the stored preset's skin to the preview root", () => {
    localStorage.setItem("setting-playerUIPreset", JSON.stringify("theater"));
    renderPreview();
    const preview = screen.getByTestId("player-preview");
    expect(preview).toHaveAttribute("data-player-skin", "theater");
    // The skin emits its tokens as CSS variables on the same element.
    expect(preview.style.getPropertyValue("--skin-accent")).toBe("#ffce6b");
    expect(preview.style.getPropertyValue("--skin-progress-glow")).not.toBe("none");
  });

  it("lets a presetId prop override the stored skin (Studio preset cards)", () => {
    renderPreview({ presetId: "studio" });
    const preview = screen.getByTestId("player-preview");
    expect(preview).toHaveAttribute("data-player-skin", "studio");
    expect(preview.style.getPropertyValue("--skin-accent")).toBe("#ff3b4e");
  });

  it("resolves custom arrangements to the Classic skin by default", () => {
    localStorage.setItem("setting-playerUIPreset", JSON.stringify("custom"));
    renderPreview();
    expect(screen.getByTestId("player-preview")).toHaveAttribute("data-player-skin", "classic");
  });

  it("preserves chosen playerUISkin when in custom preset mode", () => {
    localStorage.setItem("setting-playerUIPreset", JSON.stringify("custom"));
    localStorage.setItem("setting-playerUISkin", JSON.stringify("apple"));
    renderPreview();
    expect(screen.getByTestId("player-preview")).toHaveAttribute("data-player-skin", "apple");
  });

  it("enables drag-and-drop dropzones across all presets when draggable is true", () => {
    const { container } = renderPreview({ presetId: "theater", draggable: true });
    const dropzones = container.querySelectorAll(".player-preview-cluster");
    expect(dropzones.length).toBeGreaterThan(0);
  });

  it("renders buttons with is-variant-* class according to iconVariants", () => {
    const { container } = renderPreview({
      iconVariants: { fullscreen: "neon", subtitles: "glass" },
    });
    const neonBtn = container.querySelector(".player-preview-btn.is-variant-neon");
    expect(neonBtn).toBeInTheDocument();
    const glassBtn = container.querySelector(".player-preview-btn.is-variant-glass");
    expect(glassBtn).toBeInTheDocument();
  });
});

