import { describe, it, expect } from "vitest";
import { VideoSourceAdapter } from "../api/videoSourceAdapter";

describe("VideoSourceAdapter ordering", () => {
  it("re-orders servers by the saved preference, appending unknown ones last", () => {
    const ordered = VideoSourceAdapter.getOrderedServers(["Server 5 (VidCore)", "Server 1"]);
    expect(ordered.map((s) => s.name).slice(0, 2)).toEqual(["Server 5 (VidCore)", "Server 1"]);
    expect(ordered).toHaveLength(8);
  });

  it("falls back to the default rotation for empty input", () => {
    const ordered = VideoSourceAdapter.getOrderedServers([]);
    expect(ordered.map((s) => s.name)[0]).toBe("Server 1");
  });

  it("restores the original player-dropdown labels Server 1 … Server 8", () => {
    const names = VideoSourceAdapter.getServers().map((s) => s.name);
    expect(names).toEqual([
      "Server 1",
      "Server 2 (Fast)",
      "Server 3 (HD)",
      "Server 4 (Backup)",
      "Server 5 (VidCore)",
      "Server 6 (Peachify)",
      "Server 7 (VidUp)",
      "Server 8 (Smashy)",
    ]);
  });
});

describe("CineSrc embed URLs follow the integration docs", () => {
  it("builds the movie embed from the TMDB id", () => {
    const url = VideoSourceAdapter.resolveStreamUrl(VideoSourceAdapter.getServers(), 0, "245891", null, null, null);
    expect(url).toMatch(/^https:\/\/cinesrc\.st\/embed\/movie\/245891\?/);
    expect(url).toContain("color=%230A84FF");
    expect(url).toContain("autoplay=true");
    expect(url).toContain("controls=false");
  });

  it("builds the TV embed with s/e params and keeps autonext off for app-owned navigation", () => {
    const url = VideoSourceAdapter.resolveStreamUrl(VideoSourceAdapter.getServers(), 0, "1396", "1", "1", null);
    expect(url).toMatch(/^https:\/\/cinesrc\.st\/embed\/tv\/1396\?s=1&e=1/);
    expect(url).toContain("autonext=false");
    // autoskip is not hardcoded here — the player appends it from the
    // Auto-Skip Intro preference at load time.
    expect(url).not.toContain("autoskip");
    expect(url).not.toContain("autonext=null");
  });
});

describe("VideoSourceAdapter ordered-list helpers (custom player)", () => {
  const ordered = VideoSourceAdapter.getOrderedServers(["Server 5 (VidCore)", "Server 1"]);

  it("counts the passed list, falling back to the base list", () => {
    expect(VideoSourceAdapter.count(ordered)).toBe(8);
    expect(VideoSourceAdapter.count([])).toBe(VideoSourceAdapter.getServers().length);
    expect(VideoSourceAdapter.count(undefined)).toBe(VideoSourceAdapter.getServers().length);
  });

  it("resolves stream URLs against the passed list, not the static order", () => {
    // Index 0 in this order is Server 5 (vidcore), not Server 1 (cinesrc).
    const url = VideoSourceAdapter.resolveStreamUrl(ordered, 0, "123", null, null, null);
    expect(url).toContain("vidcore.io");
    // Index 1 is Server 1.
    expect(VideoSourceAdapter.resolveStreamUrl(ordered, 1, "123", null, null, null)).toContain("cinesrc.st");
  });

  it("bounds out-of-range indices to the first entry", () => {
    const first = VideoSourceAdapter.entryAt(ordered, 99);
    expect(first.name).toBe("Server 5 (VidCore)");
  });

  it("ships only iframe servers after the Direct/NetMirror retirement", () => {
    // Every server in the rotation must render through an iframe — no direct
    // extraction entries remain.
    for (const entry of ordered) {
      expect(typeof entry.url).toBe("function");
      expect(entry.direct).toBeUndefined();
      expect(entry.netmirror).toBeUndefined();
    }
  });
});
