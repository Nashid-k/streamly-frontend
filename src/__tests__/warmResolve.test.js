import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetWarmResolveForTests,
  takeWarmResolve,
  warmResolve,
  warmResolveKey,
} from "../api/warmResolve";
import { DEFAULT_SOURCE_KEY } from "../constants/sources";

/* The warm token is minted through `AUTO_SOURCE` — the SAME mount the player's
   no-pick path resolves through — so a warm handover can never deliver a token
   for a server the player would refuse. That mount now asks Server 1 (RIVO)
   first and only falls through to Server 2 (ZXC Orion, `prefer`) when RIVO has
   no source. These tests fail if either side hardcodes a row again, or if the
   warm leg drifts away from the player's start-of-line order. */
const { resolveZxcMock, resolveRivoMock } = vi.hoisted(() => ({
  resolveZxcMock: vi.fn(),
  resolveRivoMock: vi.fn(),
}));

vi.mock("../api/streamResolve", () => ({
  streamResolve: { resolveZxc: resolveZxcMock, resolveRivo: resolveRivoMock },
}));

const MOVIE_ARGS = { type: "movie", id: "550" };
const TV_ARGS = { type: "tv", id: "108978", season: 1, episode: 1 };

afterEach(() => {
  _resetWarmResolveForTests();
  vi.clearAllMocks();
});

describe("warmResolve", () => {
  it("mints the player's start of line — Server 1 (RIVO) — not a hardcoded row", () => {
    resolveRivoMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(MOVIE_ARGS);
    expect(resolveRivoMock).toHaveBeenCalledTimes(1);
    expect(resolveRivoMock).toHaveBeenCalledWith(
      { ...MOVIE_ARGS, server: "1" },
      expect.anything(),
    );
    // Server 1 answered: no ZXC request is burned on the warm leg.
    expect(resolveZxcMock).not.toHaveBeenCalled();
  });

  it("falls through to Server 2 (Orion, prefer) only when RIVO has no source", async () => {
    resolveRivoMock.mockRejectedValue(new Error("no source"));
    resolveZxcMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    await warmResolve(MOVIE_ARGS).catch(() => {});
    // The warm leg mints exactly what the player will ask for (AUTO_SOURCE), so
    // the handover can never deliver a token for a different row than the one
    // the no-pick path would resolve: Server 2 (Orion) by NAME, not `auto`.
    expect(resolveZxcMock).toHaveBeenCalledWith(
      { ...MOVIE_ARGS, prefer: "orion" },
      expect.anything(),
    );
  });

  it("resolves once and coalesces duplicate calls for the same title", () => {
    resolveRivoMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(MOVIE_ARGS);
    warmResolve(MOVIE_ARGS);
    expect(resolveRivoMock).toHaveBeenCalledTimes(1);
  });

  it("a different title mints its own warm token", () => {
    resolveRivoMock.mockResolvedValue({ variants: [] });
    warmResolve(MOVIE_ARGS);
    warmResolve(TV_ARGS);
    expect(resolveRivoMock).toHaveBeenCalledTimes(2);
  });

  it("never throws from the fire path when resolve fails", async () => {
    resolveRivoMock.mockRejectedValue(new Error("mint died"));
    resolveZxcMock.mockRejectedValue(new Error("mint died"));
    expect(() => warmResolve(MOVIE_ARGS)).not.toThrow();
    await vi.waitFor(() => expect(resolveRivoMock).toHaveBeenCalled());
    // The chain has two legs now (RIVO then ZXC), so give the rejection time to
    // settle and clear the entry before the re-fire.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The poisoned entry is cleared — a fresh call re-fires, not re-rejects.
    resolveRivoMock.mockResolvedValue({ variants: [{ uri: "u", height: 720 }] });
    warmResolve(MOVIE_ARGS);
    expect(resolveRivoMock).toHaveBeenCalledTimes(2);
  });

  it("does not fire when the signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    const result = warmResolve(MOVIE_ARGS, { signal: controller.signal });
    expect(result).toBeNull();
    expect(resolveRivoMock).not.toHaveBeenCalled();
    expect(resolveZxcMock).not.toHaveBeenCalled();
  });
});

describe("takeWarmResolve handover", () => {
  it("hands the token to the player once, only for the no-pick path", () => {
    resolveRivoMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    const promise = warmResolve(MOVIE_ARGS);
    const taken = takeWarmResolve(MOVIE_ARGS, { sourceKey: null });
    expect(taken).toBe(promise);
    // One-shot: the player's token-refresh attempt gets null, not a replay.
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: null })).toBeNull();
  });

  it("refuses ANY manual pick — even the default row (it must resolve ITS server)", () => {
    resolveRivoMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(MOVIE_ARGS);
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: "zxc-andromeda" })).toBeNull();
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: DEFAULT_SOURCE_KEY })).toBeNull();
    // The warm entry survives for the no-pick path.
    expect(takeWarmResolve(MOVIE_ARGS, { sourceKey: null })).not.toBeNull();
  });

  it("refuses a different title (wrong episode tapped)", () => {
    resolveRivoMock.mockResolvedValue({ variants: [{ uri: "u", height: 1080 }] });
    warmResolve(TV_ARGS);
    expect(takeWarmResolve({ ...TV_ARGS, episode: 2 }, { sourceKey: null })).toBeNull();
  });

  it("keys TV titles by season AND episode", () => {
    expect(warmResolveKey(TV_ARGS)).toBe("tv|108978|1|1");
    expect(warmResolveKey({ ...TV_ARGS, episode: 2 })).toBe("tv|108978|1|2");
    expect(warmResolveKey(MOVIE_ARGS)).toBe("movie|550|-");
  });
});