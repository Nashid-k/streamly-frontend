/* The cold-open stage is the player's only honest progress signal. These tests
   pin the transitions and, more importantly, the "do not churn" identity: the
   loader fires per chunk, and an identical reducer result must not re-render. */
import { describe, expect, it } from "vitest";
import {
  formatBytes,
  LOAD_PHASE,
  loadingStageMessage,
  reduceLoadingStage,
} from "../components/player/engine/loadingStage.js";

describe("reduceLoadingStage", () => {
  it("walks connect → probe → first byte → buffered", () => {
    const connected = reduceLoadingStage(null, { type: "connect", server: "Server 1" });
    expect(connected).toEqual({ phase: LOAD_PHASE.CONNECTING, server: "Server 1" });

    const probing = reduceLoadingStage(connected, { type: "probe", server: "Server 1" });
    expect(probing).toEqual({ phase: LOAD_PHASE.PROBING, server: "Server 1" });

    const first = reduceLoadingStage(probing, {
      type: "bytes",
      loaded: 65_536,
      total: 4 * 1024 * 1024,
    });
    expect(first).toEqual({
      phase: LOAD_PHASE.FIRST_BYTE,
      server: "Server 1",
      loaded: 65_536,
      total: 4 * 1024 * 1024,
    });

    const buffered = reduceLoadingStage(first, {
      type: "bytes",
      loaded: 131_072,
      total: 4 * 1024 * 1024,
    });
    expect(buffered.phase).toBe(LOAD_PHASE.BUFFERED);
    expect(buffered.loaded).toBe(131_072);
  });

  it("returns the same object when nothing visible changed", () => {
    const connected = reduceLoadingStage(null, { type: "connect", server: "Server 2" });
    expect(reduceLoadingStage(connected, { type: "connect", server: "Server 2" })).toBe(connected);

    const probing = reduceLoadingStage(connected, { type: "probe", server: "Server 2" });
    expect(reduceLoadingStage(probing, { type: "probe", server: " Server 2 " })).toBe(probing);

    const buffered = reduceLoadingStage(
      reduceLoadingStage(probing, { type: "bytes", loaded: 10, total: 20 }),
      { type: "bytes", loaded: 20, total: 40 },
    );
    expect(reduceLoadingStage(buffered, { type: "bytes", loaded: 20, total: 40 })).toBe(buffered);
  });

  it("updates the label when a failover moves to a different server", () => {
    const first = reduceLoadingStage(null, { type: "probe", server: "Server 1" });
    const second = reduceLoadingStage(first, { type: "probe", server: "Server 2" });
    expect(second.server).toBe("Server 2");
    expect(second).not.toBe(first);
  });

  it("ignores zero, negative and junk byte events", () => {
    const probing = reduceLoadingStage(null, { type: "probe", server: "Server 1" });
    for (const loaded of [0, -1, NaN, "", "junk", undefined]) {
      expect(reduceLoadingStage(probing, { type: "bytes", loaded, total: 100 })).toBe(probing);
    }
  });

  it("keeps the current server when a byte event omits it", () => {
    const probing = reduceLoadingStage(null, { type: "probe", server: "Server 3" });
    const first = reduceLoadingStage(probing, { type: "bytes", loaded: 10, total: 20 });
    expect(first.server).toBe("Server 3");
  });

  it("drops a total smaller than the bytes already received", () => {
    const first = reduceLoadingStage(null, { type: "bytes", loaded: 100, total: 50, server: "S" });
    expect(first.total).toBe(0);
  });

  it("clear returns null; unknown events are ignored", () => {
    const probing = reduceLoadingStage(null, { type: "probe", server: "Server 1" });
    expect(reduceLoadingStage(probing, { type: "clear" })).toBeNull();
    expect(reduceLoadingStage(probing, { type: "mystery" })).toBe(probing);
    expect(reduceLoadingStage(probing, null)).toBe(probing);
  });

  it("never mutates the previous state", () => {
    const probing = Object.freeze({ phase: LOAD_PHASE.PROBING, server: "Server 1" });
    const first = reduceLoadingStage(probing, { type: "bytes", loaded: 10, total: 20 });
    expect(first).not.toBe(probing);
    expect(probing).toEqual({ phase: LOAD_PHASE.PROBING, server: "Server 1" });
  });
});

describe("loadingStageMessage", () => {
  it("names the phase and the server honestly", () => {
    expect(loadingStageMessage({ phase: LOAD_PHASE.CONNECTING, server: "Server 1" })).toBe(
      "Connecting to Server 1…",
    );
    expect(loadingStageMessage({ phase: LOAD_PHASE.CONNECTING, server: null })).toBe("Connecting…");
    expect(loadingStageMessage({ phase: LOAD_PHASE.PROBING, server: "Server 2" })).toBe(
      "Checking Server 2…",
    );
    expect(loadingStageMessage({ phase: LOAD_PHASE.PROBING, server: null })).toBe(
      "Checking the source…",
    );
    expect(loadingStageMessage({ phase: LOAD_PHASE.FIRST_BYTE })).toBe("Starting stream…");
  });

  it("shows byte counts, with the fragment total when it is known", () => {
    expect(
      loadingStageMessage({
        phase: LOAD_PHASE.BUFFERED,
        loaded: 65_536,
        total: 4 * 1024 * 1024,
      }),
    ).toBe("Buffering 64 KB of 4.0 MB…");
    expect(
      loadingStageMessage({ phase: LOAD_PHASE.BUFFERED, loaded: 2048, total: 0 }),
    ).toBe("Buffering 2 KB…");
  });

  it("returns null for no stage or an unknown phase", () => {
    expect(loadingStageMessage(null)).toBeNull();
    expect(loadingStageMessage({ phase: "wat" })).toBeNull();
  });
});

describe("formatBytes", () => {
  it("uses a readable unit and keeps zero honest", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("2 KB");
    expect(formatBytes(1024 * 1024 * 1.5)).toBe("1.5 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });
});
