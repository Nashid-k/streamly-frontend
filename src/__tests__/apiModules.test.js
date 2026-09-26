// Link-check for every Vercel function in api/, plus every shared module in
// server/.
//
// The server tree is invisible to the unit tests (they all import from src/), so a
// bad import — a name that no longer exists in the shared module, a moved file,
// a typo'd path — ships silently and takes the whole endpoint down at runtime
// with an ESM link error. Importing each entry point here is what makes those
// failures show up in CI instead of in production.
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Vercel builds EVERY .js file under api/ as its own serverless function — a
// shared helper dropped in api/lib/ is deployed, publicly invokable, and counts
// against the quota. The Hobby plan allows 12 per deployment, so a helper file
// added under api/ can fail the whole build with no local signal. Keeping the
// helpers in server/ (bundled into each function through the import graph) is
// what makes that impossible; these two tests keep it that way.
const HOBBY_FUNCTION_LIMIT = 12;

// vitest runs with cwd at the project root, so the server tree is addressed
// from there rather than from import.meta.url (which is not a file: URL here).
const API_DIR = join(process.cwd(), "api");
const SERVER_DIR = join(process.cwd(), "server");

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith(".js")) out.push(join(entry.parentPath, entry.name));
  }
  return out;
}

const API_FUNCTIONS = jsFiles(API_DIR).map((f) => relative(API_DIR, f).split(sep).join("/"));
const SERVER_MODULES = jsFiles(SERVER_DIR).map((f) => relative(SERVER_DIR, f).split(sep).join("/"));

describe("api/ module graph", () => {
  it.each([...API_FUNCTIONS, ...SERVER_MODULES.map((m) => `../server/${m}`)])(
    "%s loads and exposes its handler",
    async (file) => {
      const mod = await import(`../../api/${file}`);
      const hasHandler = typeof mod.default === "function" || Object.values(mod).some((v) => typeof v === "function");
      expect(hasHandler).toBe(true);
    },
  );
});

describe("Vercel function budget", () => {
  it(`stays within the Hobby limit of ${HOBBY_FUNCTION_LIMIT} functions`, () => {
    expect(API_FUNCTIONS.length).toBeLessThanOrEqual(HOBBY_FUNCTION_LIMIT);
  });

  it("keeps every api/ function at the top level (no helper modules)", () => {
    const nested = API_FUNCTIONS.filter((f) => f.includes("/"));
    expect(nested).toEqual([]);
  });
});
