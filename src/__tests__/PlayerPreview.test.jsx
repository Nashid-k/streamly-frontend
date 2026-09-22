import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PlayerPreview from "../components/PlayerPreview";
import { PreferencesProvider } from "../context/PreferencesContext";

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
    // Self-hosted CC-licensed demo clip (CSP: no third-party media origins).
    expect(video.getAttribute("src")).toBe("/demo/player-preview.mp4");
  });

  it("renders the fixed Netflix chrome: red progress bar, time row, subtitle", () => {
    renderPreview({ label: "Netflix" });
    const preview = screen.getByTestId("player-preview");
    expect(preview).toHaveAttribute("data-player-skin", "netflix");
    // Red progress scrubber
    expect(preview.querySelector(".player-preview-progress")).not.toBeNull();
    // Transport controls
    expect(within(preview).getByTitle("Play")).toBeInTheDocument();
    expect(within(preview).getByTitle("Subtitles")).toBeInTheDocument();
    expect(within(preview).getByTitle("Speed")).toBeInTheDocument();
    // time row
    expect(within(preview).getByText("1:47 / 10:34")).toBeInTheDocument();
    // subtitle line
    expect(within(preview).getByText(/Here is what your subtitles will look like/)).toBeInTheDocument();
    // caption chip
    expect(within(preview).getByText("Netflix")).toBeInTheDocument();
  });

  it("renders a subtitle line everywhere (bare mode keeps it)", () => {
    renderPreview({ showChrome: false });
    const preview = screen.getByTestId("player-preview");
    expect(preview).toHaveClass("player-preview--bare");
    expect(within(preview).queryByTitle("Play")).not.toBeInTheDocument();
    expect(within(preview).getByText(/Here is what your subtitles will look like/)).toBeInTheDocument();
  });

  it("styles the subtitle line from live preferences", () => {
    localStorage.setItem("setting-subtitleSize", JSON.stringify(200));
    localStorage.setItem("setting-subtitleColor", JSON.stringify("#ffcc00"));
    renderPreview({ showChrome: false });
    const sub = screen
      .getByTestId("player-preview")
      .querySelector(".player-preview-sub");
    expect(sub.style.color).toBe("rgb(255, 204, 0)");
    expect(sub.style.fontSize).toContain("2");
  });
});