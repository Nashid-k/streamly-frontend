import { describe, it, expect } from "vitest";
import { VideoSourceAdapter } from "../api/videoSourceAdapter";

describe("VideoSourceAdapter ordering", () => {
  it("re-orders servers by the saved preference, appending unknown ones last", () => {
    const ordered = VideoSourceAdapter.getOrderedServers(["Joy", "Lisbon"]);
    expect(ordered.map((s) => s.name).slice(0, 2)).toEqual(["Joy", "Lisbon"]);
    expect(ordered).toHaveLength(8);
  });

  it("falls back to the default rotation for empty input", () => {
    const ordered = VideoSourceAdapter.getOrderedServers([]);
    expect(ordered.map((s) => s.name)[0]).toBe("Lisbon");
  });
});

describe("VideoSourceAdapter ordered-list helpers (custom player)", () => {
  const ordered = VideoSourceAdapter.getOrderedServers(["Joy", "Lisbon"]);

  it("counts the passed list, falling back to the base list", () => {
    expect(VideoSourceAdapter.count(ordered)).toBe(8);
    expect(VideoSourceAdapter.count([])).toBe(VideoSourceAdapter.getServers().length);
    expect(VideoSourceAdapter.count(undefined)).toBe(VideoSourceAdapter.getServers().length);
  });

  it("resolves stream URLs against the passed list, not the static order", () => {
    // Index 0 in this order is Joy (vidcore), not Lisbon (cinesrc).
    const url = VideoSourceAdapter.resolveStreamUrl(ordered, 0, "123", null, null, null);
    expect(url).toContain("vidcore.io");
    // Index 1 is Lisbon.
    expect(VideoSourceAdapter.resolveStreamUrl(ordered, 1, "123", null, null, null)).toContain("cinesrc.st");
  });

  it("bounds out-of-range indices to the first entry", () => {
    const first = VideoSourceAdapter.entryAt(ordered, 99);
    expect(first.name).toBe("Joy");
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
