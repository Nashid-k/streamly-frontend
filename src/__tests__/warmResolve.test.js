import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetWarmResolveForTests,
  takeWarmResolve,
  warmResolve,
  warmResolveKey,
} from "../api/warmResolve";
import { DEFAULT_SOURCE_KEY } from "../constants/sources";

/* The warm token is minted through `AUTO_SOURCE` (no server named), so the
   backend picks the healthiest backend in one round trip. The mock therefore has
   to answer resolveZxc - and this suite asserts `{ auto: true }` on purpose: the
   default used to be a hardcoded row, so moving the default silently warmed a
   server the player would refuse. These tests fail if either side hardcodes a
   row again. */
const { resolveZxcMock } = vi.hoisted(() => ({
  resolveZxcMock: vi.fn(),
}));

vi.mock("../api/streamResolve", () => ({
  streamResolve: { resolveZxc: resolveZxcMock },
}));

const MOVIE_ARGS = { type: "movie", id: "550" };
const TV_ARGS = { type: "tv", id: "108978", season: 1, episode: 1 };

afterEach(() => {
  _resetWarmResolveForTests();
  vi.clearAllMocks();
});

describe("warmResolve", () => {
  it("mints the AUTO path (no server named), not a hardcoded row", () => {
    resolveZxcMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(MOVIE_ARGS);
    expect(resolveZxcMock).toHaveBeenCalledTimes(1);
    expect(resolveZxcMock).toHaveBeenCalledWith(
      { ...MOVIE_ARGS, auto: true },
      expect.anything(),
    );
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
  it("hands the token to the player once, only for the no-pick path", () => {
    resolveZxcMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    const promise = warmResolve(MOVIE_ARGS);
    const taken = takeWarmResolve(MOVIE_ARGS, { sourceKey: null });
    expect(taken).toBe(promise);
    // One-shot: the player's token-refresh attempt gets null, not a replay.
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: null })).toBeNull();
  });

  it("refuses ANY manual pick — even the default row (it must resolve ITS server)", () => {
    resolveZxcMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(MOVIE_ARGS);
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: "zxc-andromeda" })).toBeNull();
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: DEFAULT_SOURCE_KEY })).toBeNull();
    // The warm entry survives for the no-pick path.
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