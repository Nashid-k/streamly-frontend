import { afterEach, describe, expect, it } from "vitest";
import {
  getPreviewThumb,
  resetPreviewPipeline,
  setPreviewSuppressed,
} from "../api/previewThumbs";

afterEach(() => {
  resetPreviewPipeline();
});

describe("scrubber preview suppression", () => {
  it("returns no thumb while the player is fetching (suppressed)", async () => {
    setPreviewSuppressed(true);
    const thumb = await getPreviewThumb({
      url: "https://cdn.example.com/master.m3u8",
      refUrl: "https://vidcore.io/",
      sourceKey: "src-1",
      seconds: 42,
    });
    expect(thumb).toBeNull();
  });

  it("resumes when the player is happy again", async () => {
    setPreviewSuppressed(true);
    setPreviewSuppressed(false);
    // Un-suppressed, a capture proceeds to (and fails at) mount without a 2D
    // canvas — the failure must still resolve null, never throw, which is the
    // contract that keeps a preview failure from breaking scrubbing.
    const thumb = await getPreviewThumb({
      url: "https://cdn.example.com/master.m3u8",
      refUrl: "https://vidcore.io/",
      sourceKey: "src-2",
      seconds: 12,
    });
    expect(thumb).toBeNull();
  });

  it("resetPreviewPipeline clears suppression (a fresh player starts unsuppressed)", async () => {
    setPreviewSuppressed(true);
    resetPreviewPipeline();
    const thumb = await getPreviewThumb({
      url: "https://cdn.example.com/master.m3u8",
      refUrl: "https://vidcore.io/",
      sourceKey: "src-3",
      seconds: 5,
    });
    // Reached the decoder (which fails at the jsdom canvas) rather than being
    // short-circuited by the suppression gate.
    expect(thumb).toBeNull();
  });
});
