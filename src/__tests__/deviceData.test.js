import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countDeviceData,
  downloadDeviceData,
  exportDeviceData,
  importDeviceData,
} from "../utils/deviceData";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("aios_my_list", JSON.stringify([{ id: "movie-550" }]));
  localStorage.setItem("aios_continue_watching", JSON.stringify([]));
  localStorage.setItem("setting-seekTime", "10");
  // Device-local auth keys must never enter an export.
  localStorage.setItem("streamly_user", JSON.stringify({ email: "a@b.c" }));
  localStorage.setItem("unrelated_key", "leave-me-alone");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deviceData export/import", () => {
  it("exports exactly the aios_* and setting-* families, never streamly_*", () => {
    const snap = exportDeviceData();
    expect(snap.app).toBe("streamly.device-data");
    expect(Object.keys(snap.data).sort()).toEqual([
      "aios_continue_watching",
      "aios_my_list",
      "setting-seekTime",
    ]);
    // Values stay raw strings — byte-faithful round trip.
    expect(snap.data["aios_my_list"]).toBe(JSON.stringify([{ id: "movie-550" }]));
  });

  it("counts only user-data keys", () => {
    expect(countDeviceData()).toBe(3);
  });

  it("imports a valid file, restores values, and fires the sync events", () => {
    localStorage.clear();
    const events = [];
    const spy = vi.spyOn(window, "dispatchEvent").mockImplementation((e) => {
      events.push(e.type);
      return true;
    });
    const result = importDeviceData(
      JSON.stringify({
        app: "streamly.device-data",
        version: 1,
        data: {
          "aios_my_list": JSON.stringify([{ id: "tv-1399" }]),
          "setting-theme": "emerald",
          "streamly_user": "{}", // wrong family → skipped, never written
        },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(localStorage.getItem("aios_my_list")).toBe(JSON.stringify([{ id: "tv-1399" }]));
    expect(localStorage.getItem("setting-theme")).toBe("emerald");
    expect(localStorage.getItem("streamly_user")).toBeNull();
    expect(events).toContain("aios_sync_mylist");
    expect(events).toContain("aios_sync_preferences");
    spy.mockRestore();
  });

  it("refuses wrong shapes whole — no partial imports", () => {
    localStorage.setItem("aios_my_list", JSON.stringify([{ id: "movie-550" }]));
    for (const bad of [
      "not json{",
      JSON.stringify({ app: "other.app", data: { "aios_x": "1" } }),
      JSON.stringify({ app: "streamly.device-data", data: "nope" }),
      null,
    ]) {
      const result = importDeviceData(bad);
      expect(result.ok).toBe(false);
      expect(result.imported).toBe(0);
    }
    // Nothing was touched by any refusal.
    expect(localStorage.getItem("aios_my_list")).toBe(JSON.stringify([{ id: "movie-550" }]));
  });

  it("downloads via the Blob fallback when no save picker exists", async () => {
    let clicked = null;
    const anchor = {
      href: "",
      download: "",
      click() {
        clicked = { href: this.href, download: this.download };
      },
      remove() {},
    };
    vi.spyOn(document, "createElement").mockImplementation((tag) =>
      tag === "a" ? anchor : document.createElement(tag),
    );
    vi.spyOn(document.body, "appendChild").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    const spy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const result = await downloadDeviceData();
    expect(result.count).toBeGreaterThanOrEqual(3);
    expect(result.filename).toMatch(/^streamly-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(clicked.download).toBe(result.filename);
    expect(clicked.href).toBe("blob:mock");
    spy.mockRestore();
  });
});
