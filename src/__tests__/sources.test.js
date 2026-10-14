// The no-pick path mounts AUTO_SOURCE, whose resolver asks the backend to pick
// a server; the player then maps the echoed server name back onto a real row
// with `sourceByServer`. These tests pin that contract: unique server names,
// the round trip `sourceByServer`, and AUTO_SOURCE staying OUT of the menu.
import { describe, expect, it, vi } from "vitest";

const { resolveZxcMock } = vi.hoisted(() => ({ resolveZxcMock: vi.fn() }));
vi.mock("../api/streamResolve", () => ({ streamResolve: { resolveZxc: resolveZxcMock } }));

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

  it("keeps the default key pointing at a real row — the provider's Server 1", () => {
    expect(sourceByKey(DEFAULT_SOURCE_KEY)).toBeTruthy();
    expect(DEFAULT_SOURCE_KEY).toBe("zxc-orion");
    // The provider's own roster puts Orion first; Server 1 must be that row.
    expect(PLAYER_SOURCES[0].key).toBe(DEFAULT_SOURCE_KEY);
  });
});

describe("sourceByServer", () => {
  it("maps a backend server name back onto its row", () => {
    expect(sourceByServer("centaurus")?.key).toBe("zxc-centaurus");
    expect(sourceByServer("andromeda")?.key).toBe("zxc-andromeda");
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

describe("sourceLabel", () => {
  it("falls back instead of returning undefined for an unknown key", () => {
    expect(sourceLabel("zxc-orion")).toBe("Server 1");
    expect(sourceLabel("zxc-centaurus")).toBe("Server 3");
    expect(sourceLabel("__auto__", "Server 1")).toBe("Server 1");
  });
});
