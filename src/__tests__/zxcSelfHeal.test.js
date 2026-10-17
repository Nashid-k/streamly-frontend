// Why the player can silence a provider rename WITHOUT a redeploy.
//
// The provider renames its mint path and rotates the obfuscated param names on
// its own schedule (see zxcMintPath.test.js for the measured history). Every
// rename 404s the mint and takes out all servers at once. `api/stream.js` now
// re-derives the contract from the provider's OWN shipped client chunk when the
// mint fails in a contract-shaped way (404 / non-JSON body), caches it, and
// retries — so the next rename self-heals instead of needing this repo edited.
//
// Hermetic: fetch is stubbed, no test may reach a provider.
import { describe, it, expect, beforeEach, vi } from "vitest";

// Hermetic DNS: the SSRF pass resolves the provider origin through
// resolveUpstream, whose OS lookup cannot answer for that host in this
// environment. Every name resolves public here; the SSRF rules themselves are
// covered by ssrfGuard.test.js, and the fetch mock below is what this suite
// exercises. Same pattern as streamHandler.test.js.
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup, default: { lookup } }));

const { default: handler, clearZxcDiscoveryCache, clearZxcTitleMetaCache, clearZxcResolveCache, zxcContractSeed, deriveZxcContractFromChunks } = await import("../../api/stream.js");

// Read the seed from the module so a provider rename (rewritten by the
// sync-zxc-contract step) can NEVER strand this suite. The seed is what the
// handler tries first, so the stub must match it — not a frozen literal.
const SEED_MINT = zxcContractSeed().mintPath; // the seeded contract (a human last read this)
const NEW_MINT = "/backend/totallynewmint"; // what the "renamed" chunk advertises
// Host-agnostic: the handler builds this from ZXC_ORIGIN, which moves when the
// provider migrates. The assertion only needs to prove the embed PAGE was read,
// so match the path, not the (rotating) origin.
const EMBED = "/embed/movie/27205";

/* A fresh contract + a synthetic chunk shaped exactly like the real minified
   client: the field destructure BEFORE the `.post(...)`, the param literals
   declared as one `let <alias>="<hex>",…` run, and the body/query using the
   aliases as computed keys. Only names/literals differ from production. */
const A = {
  tmdbId: "1111111111111111111111111111",
  mediaType: "2222222222222222222222222222",
  path: "3333333333333333333333333333",
  season: "4444444444444444444444444444",
  episode: "5555555555555555555555555555",
  ts: "6666666666666666666666666666",
  token: "7777777777777777777777777777",
  title: "8888888888888888888888888888",
  year: "9999999999999999999999999999",
  date: "aaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  imdb: "bbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  latest: "cccccccccccccccccccccccccccc",
};
const NEW_MINT_PATH = "/backend/totallynewmint";

const CHUNK_SRC = [
  `let za="${A.tmdbId}",zb="${A.mediaType}",zc="${A.path}",zd="${A.season}",ze="${A.episode}",`,
  `zf="${A.ts}",zg="${A.token}",zh="${A.title}",zi="${A.year}",zj="${A.date}",zk="${A.imdb}",zl="${A.latest}";`,
  `function q(){let{media_type:t,tmdbId:r,season:i,episode:n,imdbId:o,path:l,title:u,year:d,date:c,latestDate:f}=e;`,
  `return{queryFn:async()=>{let{data:e}=await X.post("${NEW_MINT_PATH}",{[za]:r,[zb]:t,[zc]:l,[zd]:i,[ze]:n});`,
  `let h=new URLSearchParams({[za]:r,[zc]:l,[zb]:t,[zf]:String(e.ts),[zg]:e.token,[zh]:u,[zi]:d,[zj]:c});`,
  `"tv"===t&&(h.set(zd,String(i)),h.set(ze,String(n)),f&&h.set("${A.latest}",f));`,
  `o&&h.set("${A.imdb}",o);return h}}}}`,
].join("");

const json = (payload) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
const html = (body) => new Response(body, { status: 200, headers: { "content-type": "text/html" } });

const EMBED_HTML = `<!doctype html><html><body><script src="/_next/static/chunks/xxx.js"></script></body></html>`;

let requests;
let details;
let serversResponse;
let mintStatus;

function installFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = String(typeof input === "string" ? input : input?.url || input);
    requests.push(url);
    if (url.includes("/backend/tmdb/details/")) return json(details);
    if (url.includes(NEW_MINT_PATH)) return json({ token: "newtok", ts: "1800000000" });
    if (url.includes(SEED_MINT)) {
      return new Response("<html><body>404</body></html>", { status: mintStatus });
    }
    if (url.includes("/embed/")) return html(EMBED_HTML);
    if (url.includes("/_next/static/chunks/")) return html(CHUNK_SRC);
    if (url.includes("/backend_/sources/")) return json(serversResponse);
    if (url.includes(".m3u8")) {
      return new Response("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:13\n#EXTINF:12.0,\nhttps://93.184.216.34/s0\n#EXT-X-ENDLIST\n", {
        status: 200,
        headers: { "content-type": "application/vnd.apple.mpegurl" },
      });
    }
    return new Response("upstream unreachable", { status: 502 });
  }));
}

function makeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    status(c) { res.statusCode = c; return res; },
    setHeader(k, v) { res.headers[k.toLowerCase()] = v; return res; },
    json(p) { res.body = p; return res; },
    send(p) { res.body = p; return res; },
    end() { return res; },
  };
  return res;
}

async function resolve({ server = "atlas" } = {}) {
  const res = makeRes();
  await handler(
    { method: "POST", body: { action: "resolvezxc", type: "movie", id: "27205", server }, headers: { "x-forwarded-for": "203.0.113.9" } },
    res,
  );
  return JSON.parse(res.body);
}

const serversUrl = () => requests.find((u) => u.includes("/backend_/sources/")) || "";

beforeEach(() => {
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
  requests = [];
  details = { title: "Inception", release_date: "2010-07-15", imdb_id: "tt0000000" };
  serversResponse = {
    success: true,
    links: [{ link: Buffer.from("https://93.184.216.34/a.m3u8").toString("base64"), type: "hls", resolution: 0 }],
  };
  mintStatus = 404;
  clearZxcDiscoveryCache();
  clearZxcTitleMetaCache();
  clearZxcResolveCache();
  installFetch();
});

describe("ZXC mint self-heal", () => {
  it("re-derives the contract from the provider chunk and retries the mint", async () => {
    const r = await resolve({ server: "atlas" });

    // The seed path was tried and 404'd first.
    expect(requests.some((u) => u.includes(SEED_MINT))).toBe(true);
    // Discovery actually read the embed page and a chunk.
    expect(requests.some((u) => u.includes(EMBED))).toBe(true);
    expect(requests.some((u) => u.includes("/_next/static/chunks/"))).toBe(true);
    // The RETRY hit the renamed path.
    expect(requests.some((u) => u.includes(NEW_MINT_PATH))).toBe(true);
    // And the recovered contract drove the servers query (new tmdb param name).
    expect(serversUrl()).toContain(A.tmdbId);
    expect(serversUrl()).toContain("Inception");
    expect(r.ok).toBe(true);
  });

  it("does NOT run discovery on a non-contract failure (5xx)", async () => {
    mintStatus = 500;
    const r = await resolve({ server: "atlas" });
    expect(r.ok).toBe(false);
    expect(requests.some((u) => u.includes("/embed/"))).toBe(false);
  });

  it("stays broken (not worse) when the chunk yields no usable contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(typeof input === "string" ? input : input?.url || input);
      requests.push(url);
      if (url.includes("/backend/tmdb/details/")) return json(details);
      if (url.includes(SEED_MINT)) return new Response("<html>404</html>", { status: 404 });
      if (url.includes("/embed/")) return html(EMBED_HTML);
      if (url.includes("/_next/static/chunks/")) return html("var x=1;");
      return new Response("upstream unreachable", { status: 502 });
    }));
    const r = await resolve({ server: "atlas" });
    expect(r.ok).toBe(false);
    expect(serversUrl()).toBe("");
  });
});

describe("ZXC contract derivation — the CURRENT `FIELD_MAP` bundle shape", () => {
  /* The live bundle no longer declares the params as a `let uo="…",ul="…"` run;
     it exports a literal `FIELD_MAP` object whose keys ARE the field names, and
     the mint body uses computed keys off it (`{[FIELD_MAP.id]: tmdbId}`). The
     alias-based heuristic finds nothing there, so a dedicated parser reads the
     object. These are the REAL current values (re-verified against
     zxcstream.cc's shipped chunk), pinned so a silent regression to the old
     parser is loud. */
  const FIELD_MAP_CHUNK =
    'const FIELD_MAP={id:"a7f39c821d604e5b9c1e547b",fToken:"a1b2c3d4e5f6",'
    + 'mediaType:"c281b306d28147a35632e816b",path:"6b491e7258d392e7561a9384c",'
    + 'season:"d8427b59c38a2f957c3613e85b",episode:"91c6e4a753d1f785c92346b713d",'
    + 'ts:"61d9a5274c8e3b29f38c291e6",token:"c492f7a183d601e436c538a716d",'
    + 'title:"5e28c9147a306d1e29f3674b392a1",year:"b731e6c94f08675f8341c306e",'
    + 'date:"e1649321a39e5814b3027",imdbId:"f35a8c1943265e871c4933a725f",'
    + 'latestDate:"e92543416ad739e5814b3027"};'
    + 'function q(){return{queryFn:async()=>{let{data:e}=await X.post("/backend/fucku",'
    + '{[FIELD_MAP.id]:r,[FIELD_MAP.mediaType]:t,[FIELD_MAP.path]:l})}}}';

  it("reads the literal field-named params and the FIELD_MAP-fed mint path", () => {
    const c = deriveZxcContractFromChunks([FIELD_MAP_CHUNK]);
    expect(c).toBeTruthy();
    expect(c.mintPath).toBe("/backend/fucku");
    expect(c.params).toEqual({
      tmdbId: "a7f39c821d604e5b9c1e547b",
      mediaType: "c281b306d28147a35632e816b",
      path: "6b491e7258d392e7561a9384c",
      season: "d8427b59c38a2f957c3613e85b",
      episode: "91c6e4a753d1f785c92346b713d",
      ts: "61d9a5274c8e3b29f38c291e6",
      token: "c492f7a183d601e436c538a716d",
      title: "5e28c9147a306d1e29f3674b392a1",
      year: "b731e6c94f08675f8341c306e",
      date: "e1649321a39e5814b3027",
    });
    expect(c.imdbParam).toBe("f35a8c1943265e871c4933a725f");
    expect(c.latestDateParam).toBe("e92543416ad739e5814b3027");
  });

  it("ignores a `FIELD_MAP`-shaped object whose core params are incomplete", () => {
    const partial = 'const FIELD_MAP={id:"a7f39c821d604e5b9c1e547b",fToken:"a1b2c3"};';
    // No mint post AND missing params → no derived contract, so the caller keeps
    // its working seed instead of replacing it with a broken one.
    expect(deriveZxcContractFromChunks([partial])).toBeNull();
  });
});
