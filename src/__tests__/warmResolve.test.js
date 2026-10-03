import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetWarmResolveForTests,
  takeWarmResolve,
  warmResolve,
  warmResolveKey,
} from "../api/warmResolve";
import { DEFAULT_SOURCE_KEY } from "../constants/sources";

/* The warm token is minted for whatever `DEFAULT_SOURCE_KEY` points at, which is
   now `zxc-centaurus` (Server 1). The mock therefore has to answer resolveZxc —
   and this suite asserts that coupling on purpose: the default used to be
   hardcoded to "vidcore" in both warmResolve.js and its test, so moving the
   default silently warmed a server the player would refuse. These tests fail if
   either side hardcodes a key again. */
const { resolveZxcMock, resolveVidcoreMock } = vi.hoisted(() => ({
  resolveZxcMock: vi.fn(),
  resolveVidcoreMock: vi.fn(),
}));

vi.mock("../api/downloadService", () => ({
  downloadService: { resolveZxc: resolveZxcMock, resolveVidcore: resolveVidcoreMock },
}));

const MOVIE_ARGS = { type: "movie", id: "550" };
const TV_ARGS = { type: "tv", id: "108978", season: 1, episode: 1 };

afterEach(() => {
  _resetWarmResolveForTests();
  vi.clearAllMocks();
});

describe("warmResolve", () => {
  it("mints the DEFAULT row's server, not a hardcoded key", () => {
    resolveZxcMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(MOVIE_ARGS);
    expect(resolveZxcMock).toHaveBeenCalledTimes(1);
    expect(resolveZxcMock).toHaveBeenCalledWith(
      { ...MOVIE_ARGS, server: "centaurus" },
      expect.anything(),
    );
    // And it is Server 1 that we actually warmed.
    expect(DEFAULT_SOURCE_KEY).toBe("zxc-centaurus");
    expect(resolveVidcoreMock).not.toHaveBeenCalled();
  });

  it("resolves once and coalesces duplicate calls for the same title", () => {
    resolveZxcMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(MOVIE_ARGS);
    warmResolve(MOVIE_ARGS);
    expect(resolveZxcMock).toHaveBeenCalledTimes(1);
  });

  it("a different title mints its own warm token", () => {
    resolveZxcMock.mockResolvedValue({ variants: [] });
    warmResolve(MOVIE_ARGS);
    warmResolve(TV_ARGS);
    expect(resolveZxcMock).toHaveBeenCalledTimes(2);
  });

  it("never throws from the fire path when resolve fails", async () => {
    resolveZxcMock.mockRejectedValue(new Error("mint died"));
    expect(() => warmResolve(MOVIE_ARGS)).not.toThrow();
    await vi.waitFor(() => expect(resolveZxcMock).toHaveBeenCalled());
    // The poisoned entry is cleared — a fresh call re-fires, not re-rejects.
    resolveZxcMock.mockResolvedValue({ variants: [{ uri: "u", height: 720 }] });
    warmResolve(MOVIE_ARGS);
    expect(resolveZxcMock).toHaveBeenCalledTimes(2);
  });

  it("does not fire when the signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    const result = warmResolve(MOVIE_ARGS, { signal: controller.signal });
    expect(result).toBeNull();
    expect(resolveZxcMock).not.toHaveBeenCalled();
  });
});

describe("takeWarmResolve handover", () => {
  it("hands the token to the player once for the same title and default pick", () => {
    resolveZxcMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    const promise = warmResolve(MOVIE_ARGS);
    const taken = takeWarmResolve(MOVIE_ARGS, { sourceKey: null });
    expect(taken).toBe(promise);
    // One-shot: the player's token-refresh attempt gets null, not a replay.
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: DEFAULT_SOURCE_KEY })).toBeNull();
  });

  it("refuses a manual non-default server pick (it must resolve ITS server)", () => {
    resolveZxcMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(MOVIE_ARGS);
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: "vidsrc" })).toBeNull();
    // The warm entry survives for the default path.
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: null })).not.toBeNull();
  });

  it("refuses a different title (wrong episode tapped)", () => {
    resolveZxcMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(TV_ARGS);
    expect(takeWarmResolve({ ...TV_ARGS, episode: 2 }, { sourceKey: null })).toBeNull();
  });

  it("keys TV titles by season AND episode", () => {
    expect(warmResolveKey(TV_ARGS)).toBe("tv|108978|1|1");
    expect(warmResolveKey({ ...TV_ARGS, episode: 2 })).toBe("tv|108978|1|2");
    expect(warmResolveKey(MOVIE_ARGS)).toBe("movie|550|-");
  });
});