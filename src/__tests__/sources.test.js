// The no-pick path mounts AUTO_SOURCE, whose resolver asks the backend to pick
// a server; the player then maps the echoed server name back onto a real row
// with `sourceByServer`. These tests pin that contract: unique server names,
// the round trip `sourceByServer`, and AUTO_SOURCE staying OUT of the menu.
import { describe, expect, it, vi } from "vitest";

const { resolveZxcMock, resolveRivoMock } = vi.hoisted(() => ({
  resolveZxcMock: vi.fn(),
  resolveRivoMock: vi.fn(),
}));
vi.mock("../api/streamResolve", () => ({
  streamResolve: {
    resolveZxc: resolveZxcMock,
    resolveRivo: resolveRivoMock,
  },
}));

import {
  PLAYER_SOURCES,
  DEFAULT_SOURCE_KEY,
  AUTO_SOURCE,
  sourceByKey,
  sourceByServer,
  sourceLabel,
} from "../constants/sources";

describe("PLAYER_SOURCES", () => {
  it("pins Server 1 to RIVO and keeps the two ZXC rows after it", () => {
    const server1 = sourceByKey("rivo-1");
    expect(PLAYER_SOURCES[0]).toBe(server1);
    expect(server1).toMatchObject({
      label: "Server 1",
      provider: "RIVO",
      server: "1",
    });

    expect(sourceByKey("zxc-valstrax")).toMatchObject({
      label: "Server 2",
      provider: "ZXC Valstrax",
      server: "valstrax",
    });
    expect(sourceByKey("zxc-alatreon")).toMatchObject({
      label: "Server 3",
      provider: "ZXC Alatreon",
      server: "alatreon",
    });
    expect(PLAYER_SOURCES).toHaveLength(3);
  });

  it("gives every row a unique provider server name", () => {
    const servers = PLAYER_SOURCES.map((s) => s.server);
    expect(servers.every(Boolean)).toBe(true);
    expect(new Set(servers).size).toBe(servers.length);
  });

  it("keeps the default key pointing at the first row — RIVO Server 1", () => {
    expect(sourceByKey(DEFAULT_SOURCE_KEY)).toBeTruthy();
    expect(DEFAULT_SOURCE_KEY).toBe("rivo-1");
    // Server 1 is the row the menu leads with, and the key that means "no pick".
    expect(PLAYER_SOURCES[0].key).toBe(DEFAULT_SOURCE_KEY);
    expect(sourceLabel(DEFAULT_SOURCE_KEY)).toBe("Server 1");
  });

  /* The ZXC rows are the provider backends that served the roster on the
     2026-11-15 re-measure: Valstrax and Alatreon. Ursa and Orion were dropped
     the same day at 0/3, so no ZXC row may claim multi audio. RIVO's sibling
     masters are the only measured multi-audio source left. */
  it("tags multi audio only where the row can actually deliver it", () => {
    const zxcRows = PLAYER_SOURCES.filter((row) => row.key.startsWith("zxc-"));
    expect(zxcRows.map((row) => row.server)).toEqual(["valstrax", "alatreon"]);
    expect(zxcRows.filter((row) => /multi audio/i.test(row.tag))).toEqual([]);
    expect(PLAYER_SOURCES.map((row) => row.key)).toEqual([
      "rivo-1",
      "zxc-valstrax",
      "zxc-alatreon",
    ]);
    expect(PLAYER_SOURCES[0].tag).toMatch(/multi audio/i);
    expect(
      PLAYER_SOURCES.filter((row) => /multi audio/i.test(row.tag)).map((row) => row.key),
    ).toEqual(["rivo-1"]);
  });
});

describe("sourceByServer", () => {
  it("maps a backend server name back onto its row", () => {
    expect(sourceByServer("valstrax")?.key).toBe("zxc-valstrax");
    expect(sourceByServer("alatreon")?.key).toBe("zxc-alatreon");
    // Retired backends have no row to re-derive, so the player never highlights
    // a server the viewer cannot pick (Ursa and Orion measured 0/3 on
    // 2026-11-15; Atlas and Daedalus were retired earlier for the same reason).
    expect(sourceByServer("atlas")).toBeNull();
    expect(sourceByServer("ursa")).toBeNull();
    expect(sourceByServer("orion")).toBeNull();
    // Menu numbering is contiguous over the live rows.
    expect(sourceLabel("zxc-valstrax")).toBe("Server 2");
    expect(sourceLabel("zxc-alatreon")).toBe("Server 3");
    expect(sourceLabel("zxc-ursa")).toBe("That server");
  });

  it("returns null for an unknown or absent name", () => {
    expect(sourceByServer("nope")).toBeNull();
    expect(sourceByServer("")).toBeNull();
    expect(sourceByServer(null)).toBeNull();
    expect(sourceByServer(undefined)).toBeNull();
  });
});

describe("AUTO_SOURCE", () => {
  it("is a menu sentinel — never one of the selectable rows", () => {
    expect(PLAYER_SOURCES.some((s) => s.key === AUTO_SOURCE.key)).toBe(false);
    // And it is not resolvable as a real row.
    expect(sourceByKey(AUTO_SOURCE.key)).toBeNull();
  });

  it("resolves the no-pick start point at Server 1 (RIVO) first", async () => {
    resolveRivoMock.mockResolvedValue({ source: {}, variants: [], audioTracks: [] });
    // The player passes the film's TMDB language through: RIVO's Server 1 lists
    // one master per language and does not put the original first.
    const result = await AUTO_SOURCE.resolve(
      { type: "movie", id: "550", originalLanguage: "ml" },
      { signal: undefined },
    );
    // No pick -> Server 1 leads the line, so the stream starts there…
    expect(resolveRivoMock).toHaveBeenCalledWith(
      { type: "movie", id: "550", originalLanguage: "ml", server: "1" },
      { signal: undefined },
    );
    // The row is named, so `sourceByServer` can still re-derive Server 1 when
    // the backend echoes its own server label.
    expect(result).toEqual({ source: {}, variants: [], audioTracks: [], server: "1" });
  });

  it("falls through to Server 2 (Valstrax, prefer) only when RIVO has no source for the title", async () => {
    resolveRivoMock.mockRejectedValue(new Error("no source"));
    resolveZxcMock.mockResolvedValue({ source: {}, variants: [], audioTracks: [] });
    const result = await AUTO_SOURCE.resolve({ type: "movie", id: "550" }, { signal: undefined });
    // Menu order, not the backend's health pick: Server 1 -> Server 2 -> its own
    // rotation. `auto` would jump straight to whichever backend wins, which is
    // exactly how the no-pick path used to surface a late row ("Server 7").
    expect(resolveZxcMock).toHaveBeenCalledWith(
      { type: "movie", id: "550", prefer: "valstrax" },
      { signal: undefined },
    );
    expect(result).toEqual({ source: {}, variants: [], audioTracks: [] });
  });
});

describe("manual server rows", () => {
  it("ZXC rows send `prefer` (not `server`) so a dead pick falls through in one round trip", () => {
    resolveZxcMock.mockResolvedValue({ source: {}, variants: [], audioTracks: [] });
    const zxcRows = PLAYER_SOURCES.filter((row) => row.key.startsWith("zxc-"));
    expect(zxcRows.length).toBeGreaterThan(0);
    for (const row of zxcRows) {
      row.resolve({ type: "movie", id: "550" }, { signal: undefined });
      expect(resolveZxcMock).toHaveBeenLastCalledWith(
        { type: "movie", id: "550", prefer: row.server },
        { signal: undefined },
      );
    }
    // No ZXC row ever sends the strict single-server form any more.
    for (const callArgs of resolveZxcMock.mock.calls) {
      expect(callArgs[0].server).toBeUndefined();
    }
  });

  it("the RIVO row names its own server explicitly — RIVO has no ZXC fallback", () => {
    resolveRivoMock.mockResolvedValue({ source: {}, variants: [], audioTracks: [] });
    const row = sourceByKey("rivo-1");
    expect(row?.provider).toBe("RIVO");
    row.resolve({ type: "movie", id: "550" }, { signal: undefined });
    expect(resolveRivoMock).toHaveBeenCalledWith(
      { type: "movie", id: "550", server: "1" },
      { signal: undefined },
    );
  });

  it("never replays a RIVO miss on a ZXC row", async () => {
    resolveRivoMock.mockClear();
    resolveZxcMock.mockClear();
    resolveRivoMock.mockRejectedValue(new Error("no source"));
    resolveZxcMock.mockResolvedValue({ source: {}, variants: [], audioTracks: [] });
    const row = sourceByKey("rivo-1");
    await expect(row.resolve({ type: "movie", id: "550" }, { signal: undefined })).rejects.toThrow(
      "no source",
    );
    expect(resolveRivoMock).toHaveBeenCalledTimes(1);
    expect(resolveZxcMock).not.toHaveBeenCalled();
  });
});

describe("sourceLabel", () => {
  it("falls back instead of returning undefined for an unknown key", () => {
    expect(sourceLabel("rivo-1")).toBe("Server 1");
    expect(sourceLabel("zxc-valstrax")).toBe("Server 2");
    expect(sourceLabel("zxc-alatreon")).toBe("Server 3");
    expect(sourceLabel("zxc-orion")).toBe("That server");
    // A retired key no longer resolves, so its fallback names the menu, not a
    // backend that cannot deliver.
    expect(sourceLabel("__auto__", "Server 1")).toBe("Server 1");
  });
});
