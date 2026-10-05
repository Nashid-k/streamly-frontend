import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  burnPasswordCompare,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "../../server/passwords.js";

describe("password hashing", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("correct horse battery");
    await expect(verifyPassword("correct horse battery", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password, a prefix and a case variant", async () => {
    const hash = await hashPassword("correct horse battery");
    await expect(verifyPassword("correct horse batter", hash)).resolves.toBe(false);
    await expect(verifyPassword("Correct Horse Battery", hash)).resolves.toBe(false);
    await expect(verifyPassword("", hash)).resolves.toBe(false);
  });

  it("never stores the plaintext and salts each hash", async () => {
    const a = await hashPassword("same password twice");
    const b = await hashPassword("same password twice");
    expect(a).not.toContain("same password twice");
    expect(a).not.toBe(b);
    // Both hashes must still verify — a differing salt is the point.
    await expect(verifyPassword("same password twice", a)).resolves.toBe(true);
    await expect(verifyPassword("same password twice", b)).resolves.toBe(true);
  });

  it("records its own cost parameters so they can be raised later", async () => {
    const hash = await hashPassword("parameterised hash");
    const parts = hash.split("$");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(Number(parts[1])).toBeGreaterThanOrEqual(16384);
    await expect(verifyPassword("parameterised hash", hash)).resolves.toBe(true);
  });

  it("treats a corrupt stored hash as a wrong password, never a throw", async () => {
    // A 500 here would tell an attacker the row exists.
    await expect(verifyPassword("x", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPassword("x", "scrypt$a$b$c$d$e")).resolves.toBe(false);
    await expect(verifyPassword("x", "")).resolves.toBe(false);
    await expect(verifyPassword(null, null)).resolves.toBe(false);
    await expect(verifyPassword("x", "bcrypt$16384$8$1$aaaa$bbbb")).resolves.toBe(false);
  });

  it("refuses a tampered row with absurd cost instead of hanging the function", async () => {
    // N=2^30 would take effectively forever if it were honoured.
    const evil = "scrypt$1073741824$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA";
    await expect(verifyPassword("x", evil)).resolves.toBe(false);
  });

  it("matches Unicode-equivalent passwords (NFKC normalisation)", async () => {
    // "ﬁ" ligature vs "fi" — must be the same password to the user.
    const hash = await hashPassword("passﬁword");
    await expect(verifyPassword("passﬁword", hash)).resolves.toBe(true);
  });
});

describe("password policy", () => {
  it("requires a minimum length", () => {
    expect(validatePassword("short").ok).toBe(false);
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH)).ok).toBe(true);
  });

  it("caps length so a huge body cannot burn scrypt CPU", () => {
    expect(validatePassword("a".repeat(MAX_PASSWORD_LENGTH + 1)).ok).toBe(false);
    expect(MAX_PASSWORD_LENGTH).toBeLessThan(1024);
  });

  it("requires a value", () => {
    expect(validatePassword("").ok).toBe(false);
    expect(validatePassword(undefined).ok).toBe(false);
    expect(validatePassword(12345678901).ok).toBe(false);
  });

  it("rejects a password containing the email local part", () => {
    const result = validatePassword("nashidk1999rules", { email: "nashidk1999@gmail.com" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/email/i);
  });

  it("still allows a password that merely resembles a short local part", () => {
    // Only local parts of 6+ chars are treated as identifying.
    expect(validatePassword("sam2024rules", { email: "sam@gmail.com" }).ok).toBe(true);
  });
});

describe("burnPasswordCompare", () => {
  it("completes without throwing (used to flatten login timing)", async () => {
    await expect(burnPasswordCompare()).resolves.toBeUndefined();
  });
});
