import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

/* Two Settings promises the player did not keep:

   1. Auto Subtitles — "Automatically select subtitles in your preferred
      language when available." Nothing read the toggle, so a viewer who turned
      it on still had to open the CC panel and pick a language by hand on every
      title.
   2. Subtitle style (Font / Text Size / Text Color) — the Settings preview
      changed, the REAL player did not: it hardcoded #fff and its own family,
      so the caption disagreed with the preview on every line. */

vi.mock("../api/subtitleFetcher", () => ({
  SubtitleFetcher: {
    searchAvailableSubtitles: vi.fn(),
    downloadAndDecompress: vi.fn(),
  },
}));

const TRACKS = [
  { language: "English", languageId: "eng", downloadLink: "en.srt" },
  { language: "Hindi", languageId: "hin", downloadLink: "hi.srt" },
];

const SRT = "1\n00:00:00,000 --> 00:00:09,000\nHello caption\n";

const MOUNT_BUDGET_MS = 30_000;

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

const mountPlayer = async (settings = {}) => {
  for (const [key, value] of Object.entries(settings)) {
    localStorage.setItem(`setting-${key}`, JSON.stringify(value));
  }
  const [playerMod, prefsMod, fetcherMod] = await Promise.all([
    import("../components/NativePlayerView"),
    import("../context/PreferencesContext"),
    import("../api/subtitleFetcher"),
  ]);
  const { SubtitleFetcher } = fetcherMod;
  SubtitleFetcher.searchAvailableSubtitles.mockResolvedValue(TRACKS);
  SubtitleFetcher.downloadAndDecompress.mockResolvedValue(SRT);
  const result = render(
    <prefsMod.PreferencesProvider>
      <playerMod.default type="movie" id="550" title="Fight Club" onClose={() => {}} />
    </prefsMod.PreferencesProvider>,
  );
  return { ...result, SubtitleFetcher };
};

describe("Auto Subtitles", { timeout: MOUNT_BUDGET_MS }, () => {
  it("selects the viewer's preferred language without opening the CC panel", async () => {
    const { SubtitleFetcher } = await mountPlayer({
      autoSubtitles: true,
      defaultLanguage: "hi",
    });

    await waitFor(() => {
      expect(SubtitleFetcher.downloadAndDecompress).toHaveBeenCalledWith("hi.srt");
    });
    expect(SubtitleFetcher.downloadAndDecompress).not.toHaveBeenCalledWith("en.srt");
  });

  it("leaves subtitles off when Auto Subtitles is disabled", async () => {
    const { SubtitleFetcher } = await mountPlayer({
      autoSubtitles: false,
      defaultLanguage: "hi",
    });

    // The language list is still fetched (the CC button needs it); only the
    // automatic SELECTION is gated by the setting.
    await waitFor(() => {
      expect(SubtitleFetcher.searchAvailableSubtitles).toHaveBeenCalled();
    });
    expect(SubtitleFetcher.downloadAndDecompress).not.toHaveBeenCalled();
  });
});

describe("Subtitle style reaches the real player", { timeout: MOUNT_BUDGET_MS }, () => {
  it("renders the caption with the font, colour and size chosen in Settings", async () => {
    const { container } = await mountPlayer({
      autoSubtitles: true,
      defaultLanguage: "en",
      subtitleFont: "montserrat",
      subtitleColor: "#ffff00",
      subtitleSize: 150,
    });

    const caption = await waitFor(() => {
      const el = container.querySelector(".np-subtitle");
      expect(el).toBeTruthy();
      return el;
    });

    expect(caption.textContent).toContain("Hello caption");
    // Pre-fix the player hardcoded #fff regardless of the preference.
    expect(caption.style.color).toBe("rgb(255, 255, 0)");
    expect(caption.style.fontFamily).toContain("Montserrat");
    // The Settings size percentage composes onto the in-player clamp range.
    expect(caption.style.fontSize).toContain("1.50");
  });
});
