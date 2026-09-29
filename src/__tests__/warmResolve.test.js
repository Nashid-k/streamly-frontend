import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetWarmResolveForTests,
  takeWarmResolve,
  warmResolve,
  warmResolveKey,
} from "../api/warmResolve";

const { resolveVidcoreMock } = vi.hoisted(() => ({ resolveVidcoreMock: vi.fn() }));

vi.mock("../api/downloadService", () => ({
  downloadService: { resolveVidcore: resolveVidcoreMock },
}));

const MOVIE_ARGS = { type: "movie", id: "550" };
const TV_ARGS = { type: "tv", id: "108978", season: 1, episode: 1 };

afterEach(() => {
  _resetWarmResolveForTests();
  vi.clearAllMocks();
});

describe("warmResolve", () => {
  it("resolves VidCore once and coalesces duplicate calls for the same title", () => {
    resolveVidcoreMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(MOVIE_ARGS);
    warmResolve(MOVIE_ARGS);
    expect(resolveVidcoreMock).toHaveBeenCalledTimes(1);
    expect(resolveVidcoreMock).toHaveBeenCalledWith(MOVIE_ARGS, expect.anything());
  });

  it("a different title mints its own warm token", () => {
    resolveVidcoreMock.mockResolvedValue({ variants: [] });
    warmResolve(MOVIE_ARGS);
    warmResolve(TV_ARGS);
    expect(resolveVidcoreMock).toHaveBeenCalledTimes(2);
  });

  it("never throws from the fire path when resolve fails", async () => {
    resolveVidcoreMock.mockRejectedValue(new Error("mint died"));
    expect(() => warmResolve(MOVIE_ARGS)).not.toThrow();
    await vi.waitFor(() => expect(resolveVidcoreMock).toHaveBeenCalled());
    // The poisoned entry is cleared — a fresh call re-fires, not re-rejects.
    resolveVidcoreMock.mockResolvedValue({ variants: [{ uri: "u", height: 720 }] });
    warmResolve(MOVIE_ARGS);
    expect(resolveVidcoreMock).toHaveBeenCalledTimes(2);
  });

  it("does not fire when the signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    const result = warmResolve(MOVIE_ARGS, { signal: controller.signal });
    expect(result).toBeNull();
    expect(resolveVidcoreMock).not.toHaveBeenCalled();
  });
});

describe("takeWarmResolve handover", () => {
  it("hands the token to the player once for the same title and default pick", () => {
    resolveVidcoreMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    const promise = warmResolve(MOVIE_ARGS);
    const taken = takeWarmResolve(MOVIE_ARGS, { sourceKey: null });
    expect(taken).toBe(promise);
    // One-shot: the player's token-refresh attempt gets null, not a replay.
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: "vidcore" })).toBeNull();
  });

  it("refuses a manual non-default server pick (it must resolve ITS server)", () => {
    resolveVidcoreMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(MOVIE_ARGS);
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: "vidsrc" })).toBeNull();
    // The warm entry survives for the default path.
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: null })).not.toBeNull();
  });

  it("refuses a different title (wrong episode tapped)", () => {
    resolveVidcoreMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(TV_ARGS);
    expect(takeWarmResolve({ ...TV_ARGS, episode: 2 }, { sourceKey: null })).toBeNull();
  });

  it("keys TV titles by season AND episode", () => {
    expect(warmResolveKey(TV_ARGS)).toBe("tv|108978|1|1");
    expect(warmResolveKey({ ...TV_ARGS, episode: 2 })).toBe("tv|108978|1|2");
    expect(warmResolveKey(MOVIE_ARGS)).toBe("movie|550|-");
  });
});
