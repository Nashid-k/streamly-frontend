import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  LEGACY_ENV_VAR,
  LEGACY_STORAGE_KEY,
  parseLegacyFlag,
  readLegacyOverride,
  resolvePlayerVariant,
  shouldUseLegacyPlayer,
} from "../constants/playerFlag";

/* Rollout-flag tests.
 *
 * The dangerous bug in a flag like this is a truthiness mistake, not a missing
 * branch. `Boolean("0")`, `Boolean("false")` and `Boolean("no")` are all true,
 * so the obvious implementation makes an operator who types "false" into a
 * Vercel env field put EVERY viewer on the old player — the precise opposite of
 * what they asked for, with no error anywhere. parseLegacyFlag therefore returns
 * `null` for "not a spelling we know", which is deliberately distinct from
 * `false`, and every test below pins that distinction.
 */

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    has: (k) => map.has(k),
    _map: map,
  };
}

describe("parseLegacyFlag", () => {
  it("reads every documented truthy spelling", () => {
    for (const v of ["1", "true", "TRUE", " yes ", "on", "On"]) {
      expect(parseLegacyFlag(v)).toBe(true);
    }
  });

  it("reads every documented falsy spelling", () => {
    for (const v of ["0", "false", "FALSE", " no ", "off", ""]) {
      expect(parseLegacyFlag(v)).toBe(false);
    }
  });

  it("returns null for an unrecognised value rather than coercing it", () => {
    // The whole point: null means "this source says nothing" so the other
    // source still gets a say. Coercing to false here would make a typo
    // indistinguishable from an explicit "off".
    expect(parseLegacyFlag("maybe")).toBeNull();
    expect(parseLegacyFlag("enabled")).toBeNull();
    expect(parseLegacyFlag(2)).toBeNull();
  });

  it("treats missing values as saying nothing, not as false", () => {
    expect(parseLegacyFlag(null)).toBeNull();
    expect(parseLegacyFlag(undefined)).toBeNull();
  });

  it("never falls into the Boolean(\"false\") === true trap", () => {
    // Stated as an executable assertion because it is the exact failure mode.
    expect(Boolean("false")).toBe(true);
    expect(parseLegacyFlag("false")).toBe(false);
  });
});

describe("readLegacyOverride", () => {
  it("returns null when the key is absent", () => {
    expect(readLegacyOverride(fakeStorage())).toBeNull();
  });

  it("returns the parsed value when the key is present", () => {
    expect(readLegacyOverride(fakeStorage({ [LEGACY_STORAGE_KEY]: "1" }))).toBe(true);
    expect(readLegacyOverride(fakeStorage({ [LEGACY_STORAGE_KEY]: "0" }))).toBe(false);
  });

  it("survives a storage that throws on read (private mode)", () => {
    const hostile = {
      getItem() {
        throw new Error("SecurityError");
      },
    };
    expect(() => readLegacyOverride(hostile)).not.toThrow();
    expect(readLegacyOverride(hostile)).toBeNull();
  });

  it("survives a null storage (no window)", () => {
    expect(readLegacyOverride(null)).toBeNull();
  });
});

describe("resolvePlayerVariant — polarity is the feature", () => {
  it("runs the NEW player when neither source is set", () => {
    const result = resolvePlayerVariant(undefined, fakeStorage());
    expect(result.useLegacy).toBe(false);
    expect(result.reason).toContain("default");
  });

  it("honours the env var when no runtime override exists", () => {
    expect(resolvePlayerVariant("1", fakeStorage()).useLegacy).toBe(true);
    expect(resolvePlayerVariant("0", fakeStorage()).useLegacy).toBe(false);
  });

  it("lets the runtime override WIN over the env var", () => {
    // A person reacting to a live incident typed this most recently, so their
    // choice outranks the deploy config.
    const storage = fakeStorage({ [LEGACY_STORAGE_KEY]: "1" });
    const result = resolvePlayerVariant("0", storage);
    expect(result.useLegacy).toBe(true);
    expect(result.reason).toContain(LEGACY_STORAGE_KEY);
  });

  it("falls through to the env var when the override is unrecognised", () => {
    // Null must not be treated as false, or the fallback source is skipped.
    const storage = fakeStorage({ [LEGACY_STORAGE_KEY]: "maybe" });
    const result = resolvePlayerVariant("1", storage);
    expect(result.useLegacy).toBe(true);
    expect(result.reason).toContain(LEGACY_ENV_VAR);
  });

  it("still runs v2 when an operator typo'd the env var", () => {
    // The failure mode that matters: a typo must not strand everyone on v1.
    expect(resolvePlayerVariant("ture", fakeStorage()).useLegacy).toBe(false);
    expect(resolvePlayerVariant("yes please", fakeStorage()).useLegacy).toBe(false);
  });

  it("cannot be enabled by accident — every path to v1 is explicit", () => {
    expect(shouldUseLegacyPlayer(undefined, fakeStorage())).toBe(false);
    expect(shouldUseLegacyPlayer("0", fakeStorage())).toBe(false);
    expect(shouldUseLegacyPlayer("", fakeStorage())).toBe(false);
    expect(shouldUseLegacyPlayer("off", fakeStorage())).toBe(false);
  });
});

describe("legacy player stays reachable when everything is hostile", () => {
  const originalError = console.error;

  beforeEach(() => {
    // The flag warns through debugLogger; keep the gate output readable.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore();
    console.error.mockRestore();
    originalError;
  });

  it("does not throw when localStorage throws on read", () => {
    const hostile = {
      getItem() {
        throw new Error("SecurityError");
      },
    };
    expect(() => resolvePlayerVariant("1", hostile)).not.toThrow();
    // The env var must still be honoured through a broken storage.
    expect(resolvePlayerVariant("1", hostile).useLegacy).toBe(true);
  });
});
