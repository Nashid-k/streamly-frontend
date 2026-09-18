import { describe, it, expect } from "vitest";
import { PLAYER_SPEEDS } from "../components/playerUIDef";

describe("playerUIDef", () => {
  it("exposes the canonical playback speed ladder", () => {
    expect(PLAYER_SPEEDS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
  });

  it("lists speeds in strictly ascending order", () => {
    for (let i = 1; i < PLAYER_SPEEDS.length; i++) {
      expect(PLAYER_SPEEDS[i]).toBeGreaterThan(PLAYER_SPEEDS[i - 1]);
    }
  });

  it("always includes the natural 1x rate", () => {
    expect(PLAYER_SPEEDS).toContain(1);
  });
});