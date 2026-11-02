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
  streamResolve: { resolveZxc: resolveZxcMock, resolveRivo: resolveRivoMock },
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
  it("gives every row a unique provider server name", () => {
    const servers = PLAYER_SOURCES.map((s) => s.server);
    expect(servers.every(Boolean)).toBe(true);
    expect(new Set(servers).size).toBe(servers.length);
  });

  it("keeps the default key pointing at the first row — RIVO's multi-audio Server 1", () => {
    expect(sourceByKey(DEFAULT_SOURCE_KEY)).toBeTruthy();
    expect(DEFAULT_SOURCE_KEY).toBe("rivo-1");
    // Server 1 is the row the menu leads with, and the key that means "no pick".
    expect(PLAYER_SOURCES[0].key).toBe(DEFAULT_SOURCE_KEY);
    expect(sourceLabel(DEFAULT_SOURCE_KEY)).toBe("Server 1");
  });
});

describe("sourceByServer", () => {
  it("maps a backend server name back onto its row", () => {
    expect(sourceByServer("atlas")?.key).toBe("zxc-atlas");
    expect(sourceByServer("valstrax")?.key).toBe("zxc-valstrax");
    expect(sourceByServer("orion")?.key).toBe("zxc-orion");
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

  it("resolves with auto:true and no server name", () => {
    resolveZxcMock.mockResolvedValue({ source: {}, variants: [], audioTracks: [] });
    AUTO_SOURCE.resolve({ type: "movie", id: "550" }, { signal: undefined });
    expect(resolveZxcMock).toHaveBeenCalledWith(
      { type: "movie", id: "550", auto: true },
      { signal: undefined },
    );
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

  it("the RIVO row names its own server explicitly — RIVO has no rotation to fall through", () => {
    resolveRivoMock.mockResolvedValue({ source: {}, variants: [], audioTracks: [] });
    const row = sourceByKey("rivo-1");
    expect(row?.provider).toBe("RIVO");
    row.resolve({ type: "movie", id: "550" }, { signal: undefined });
    expect(resolveRivoMock).toHaveBeenCalledWith(
      { type: "movie", id: "550", server: "1" },
      { signal: undefined },
    );
  });
});

describe("sourceLabel", () => {
  it("falls back instead of returning undefined for an unknown key", () => {
    expect(sourceLabel("rivo-1")).toBe("Server 1");
    expect(sourceLabel("zxc-orion")).toBe("Server 2");
    expect(sourceLabel("zxc-atlas")).toBe("Server 3");
    expect(sourceLabel("zxc-valstrax")).toBe("Server 4");
    // ZXC Orion — our multi-audio server from zxcstream — took the Server 2 slot (2026-11-02).
    expect(sourceLabel("__auto__", "Server 1")).toBe("Server 1");
  });
});
