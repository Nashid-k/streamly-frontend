// Link-check for every Vercel function in api/.
//
// The api/ tree is invisible to the unit tests (they all import from src/), so a
// bad import — a name that no longer exists in the shared module, a moved file,
// a typo'd path — ships silently and takes the whole endpoint down at runtime
// with an ESM link error. Importing each entry point here is what makes those
// failures show up in CI instead of in production.
import { describe, it, expect } from "vitest";

const ENTRY_POINTS = [
  "auth.js",
  "downloadify.js",
  "groq.js",
  "publicCollections.js",
  "sync.js",
  "tmdb.js",
  "lib/db.js",
  "lib/googleVerify.js",
  "lib/logger.js",
  "lib/net.js",
  "lib/publicCollections.js",
  "lib/rateLimit.js",
  "lib/ssrf.js",
  "lib/syncToken.js",
];

describe("api/ module graph", () => {
  it.each(ENTRY_POINTS)("%s loads and exposes its handler", async (file) => {
    const mod = await import(`../../api/${file}`);
    const hasHandler = typeof mod.default === "function" || Object.values(mod).some((v) => typeof v === "function");
    expect(hasHandler).toBe(true);
  });
});
