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
  fToken: "dddddddddddddddddddddddd",
  salt: "13572468",
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

/* The CURRENT bundle shape: a `FIELD_MAP` object plus a `generateFrontendToken`
   helper. The mint needs the fToken pair (sha512 of ts:salt:tmdbId), so a
   parser that reads the object but not the salt would mint without it and every
   row would still answer 400. */
const FIELD_RUNTIME_CHUNK = [
  `let r="${A.salt}",i={id:"${A.tmdbId}",fToken:"${A.fToken}",ts:"${A.ts}",token:"${A.token}",title:"${A.title}",year:"${A.year}",season:"${A.season}",episode:"${A.episode}",imdbId:"${A.imdb}",path:"${A.path}",mediaType:"${A.mediaType}",date:"${A.date}",latestDate:"${A.latest}"};`,
  'function n(t){let i=Date.now();return{xt:e.default.createHash("sha512").update(`${i}:${r}:${t}`).digest("hex").slice(0,64),rt:i}}',
  `function q(){return{queryFn:async()=>{let{data:e}=await X.post("${NEW_MINT_PATH}",{[FIELD_MAP.id]:r,[FIELD_MAP.mediaType]:t,[FIELD_MAP.path]:l})}}}`,
].join("");

const json = (payload) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
const html = (body) => new Response(body, { status: 200, headers: { "content-type": "text/html" } });

const EMBED_HTML = `<!doctype html><html><body><script src="/_next/static/chunks/xxx.js"></script></body></html>`;

let requests;
let mintPayloads;
let details;
let serversResponse;
let mintStatus;

function installFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url || input);
    requests.push(url);
    if (url.includes("/backend/tmdb/details/")) return json(details);
    if (url.includes(NEW_MINT_PATH)) {
      const body = init?.body ? JSON.parse(init.body) : null;
      mintPayloads.push(body);
      return json({ token: "newtok", ts: "1800000000" });
    }
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
  mintPayloads = [];
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

  it("re-derives on a rotated param set (400), not only a renamed path", async () => {
    mintStatus = 400;
    const r = await resolve({ server: "atlas" });
    expect(requests.some((u) => u.includes(EMBED))).toBe(true);
    expect(requests.some((u) => u.includes("/_next/static/chunks/"))).toBe(true);
    expect(requests.some((u) => u.includes(NEW_MINT_PATH))).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("mints the fToken pair and replays it on the sources query", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = String(typeof input === "string" ? input : input?.url || input);
      requests.push(url);
      if (url.includes("/backend/tmdb/details/")) return json(details);
      if (url.includes(NEW_MINT_PATH)) {
        mintPayloads.push(init?.body ? JSON.parse(init.body) : null);
        return json({ token: "newtok", ts: "1800000000" });
      }
      if (url.includes(SEED_MINT)) return new Response("<html>404</html>", { status: 404 });
      if (url.includes("/embed/")) return html(EMBED_HTML);
      if (url.includes("/_next/static/chunks/")) return html(FIELD_RUNTIME_CHUNK);
      if (url.includes("/backend_/sources/")) return json(serversResponse);
      if (url.includes(".m3u8")) {
        return new Response("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:13\n#EXTINF:12.0,\nhttps://93.184.216.34/s0\n#EXT-X-ENDLIST\n", {
          status: 200,
          headers: { "content-type": "application/vnd.apple.mpegurl" },
        });
      }
      return new Response("upstream unreachable", { status: 502 });
    }));

    const r = await resolve({ server: "atlas" });
    expect(r.ok).toBe(true);
    const body = mintPayloads.find((b) => b && b[A.fToken]);
    expect(body).toBeTruthy();
    // The mint needs mediaType + path AS WELL AS the fToken pair; any one of
    // the three missing answers 400 "Invalid request".
    expect(body[A.mediaType]).toBe("movie");
    expect(body[A.path]).toBe("atlas");
    expect(body[A.fToken]).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof body[A.ts]).toBe("number");
    // The sources query must replay the SAME fToken the mint validated.
    expect(serversUrl()).toContain(body[A.fToken]);
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

  it("re-mints and retries when the sources call 400s under the live contract", async () => {
    // Contract A has no fToken; the provider rotates to B (with fToken) between
    // the mint and the sources query. The native resolver must re-derive ONCE,
    // re-mint under B, and retry — not report no-source for a contract it can
    // already read from the chunk.
    const B = {
      tmdbId: "a1b2c3d4e5f60718293a4b5c",
      mediaType: "b2c3d4e5f60718293a4b5c6d",
      path: "c3d4e5f60718293a4b5c6d7e",
      season: "d4e5f60718293a4b5c6d7e8f",
      episode: "e5f60718293a4b5c6d7e8f90",
      ts: "f60718293a4b5c6d7e8f9012",
      token: "0718293a4b5c6d7e8f901234",
      title: "18293a4b5c6d7e8f90123456",
      year: "293a4b5c6d7e8f9012345678",
      date: "3a4b5c6d7e8f901234567890",
      imdb: "4b5c6d7e8f90123456789012",
      latest: "5c6d7e8f9012345678901234",
      fToken: "6d7e8f901234567890123456",
      salt: "24681357",
    };
    const NEW_MINT_PATH_B = "/backend/secondmint";
    const CHUNK_B = [
      `let r="${B.salt}",i={id:"${B.tmdbId}",fToken:"${B.fToken}",ts:"${B.ts}",token:"${B.token}",title:"${B.title}",year:"${B.year}",season:"${B.season}",episode:"${B.episode}",imdbId:"${B.imdb}",path:"${B.path}",mediaType:"${B.mediaType}",date:"${B.date}",latestDate:"${B.latest}"};`,
      'function n(t){let i=Date.now();return{xt:e.default.createHash("sha512").update(`${i}:${r}:${t}`).digest("hex").slice(0,64),rt:i}}',
      `function q(){return{queryFn:async()=>{let{data:e}=await X.post("${NEW_MINT_PATH_B}",{[FIELD_MAP.id]:r,[FIELD_MAP.mediaType]:t,[FIELD_MAP.path]:l})}}}`,
    ].join("");

    let chunkRound = 0;
    let sourcesCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = String(typeof input === "string" ? input : input?.url || input);
      requests.push(url);
      if (url.includes("/backend/tmdb/details/")) return json(details);
      if (url.includes(NEW_MINT_PATH_B)) {
        mintPayloads.push(init?.body ? JSON.parse(init.body) : null);
        return json({ token: "btok", ts: "1800000001" });
      }
      if (url.includes(NEW_MINT_PATH)) {
        mintPayloads.push(init?.body ? JSON.parse(init.body) : null);
        return json({ token: "atok", ts: "1800000000" });
      }
      if (url.includes(SEED_MINT)) return new Response("<html>404</html>", { status: 404 });
      if (url.includes("/embed/")) return html(EMBED_HTML);
      if (url.includes("/_next/static/chunks/")) {
        const source = chunkRound === 0 ? CHUNK_SRC : CHUNK_B;
        chunkRound += 1;
        return html(source);
      }
      if (url.includes("/backend_/sources/")) {
        sourcesCalls += 1;
        // The first sources call is the retired A contract; the retry is B.
        if (sourcesCalls === 1) return new Response("missing params", { status: 400 });
        return json(serversResponse);
      }
      if (url.includes(".m3u8")) {
        return new Response("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:13\n#EXTINF:12.0,\nhttps://93.184.216.34/s0\n#EXT-X-ENDLIST\n", {
          status: 200,
          headers: { "content-type": "application/vnd.apple.mpegurl" },
        });
      }
      return new Response("upstream unreachable", { status: 502 });
    }));

    const r = await resolve({ server: "atlas" });
    expect(r.ok).toBe(true);
    const sources = requests.filter((u) => u.includes("/backend_/sources/"));
    expect(sources.length).toBe(2);
    expect(new URL(sources[0]).searchParams.get(A.tmdbId)).toBe("27205");
    expect(new URL(sources[1]).searchParams.get(B.tmdbId)).toBe("27205");
    // One discovery for the seed 404, one FORCED discovery for the sources 400.
    expect(requests.filter((u) => u.includes("/embed/")).length).toBe(2);
  });

  it("does not retry a mint when discovery confirms the same contract", async () => {
    // A 400 that is not drift (e.g. provider-side validation) must not spend the
    // whole mint path twice: one prefetch attempt + one re-mint from
    // zxcServerLinks is the ceiling, not a third retry inside zxcMint.
    const seed = zxcContractSeed();
    const SEED_CHUNK = [
      `let r="${seed.fTokenSalt}",i={id:"${seed.params.tmdbId}",fToken:"${seed.params.fToken}",ts:"${seed.params.ts}",token:"${seed.params.token}",title:"${seed.params.title}",year:"${seed.params.year}",season:"${seed.params.season}",episode:"${seed.params.episode}",imdbId:"${seed.imdbParam}",path:"${seed.params.path}",mediaType:"${seed.params.mediaType}",date:"${seed.params.date}",latestDate:"${seed.latestDateParam}"};`,
      'function n(t){let i=Date.now();return{xt:e.default.createHash("sha512").update(`${i}:${r}:${t}`).digest("hex").slice(0,64),rt:i}}',
      `function q(){return{queryFn:async()=>{let{data:e}=await X.post("${seed.mintPath}",{[FIELD_MAP.id]:r,[FIELD_MAP.mediaType]:t,[FIELD_MAP.path]:l})}}}`,
    ].join("");

    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(typeof input === "string" ? input : input?.url || input);
      requests.push(url);
      if (url.includes("/backend/tmdb/details/")) return json(details);
      if (url.includes(SEED_MINT)) return new Response("<html>400</html>", { status: 400 });
      if (url.includes("/embed/")) return html(EMBED_HTML);
      if (url.includes("/_next/static/chunks/")) return html(SEED_CHUNK);
      if (url.includes("/backend_/sources/")) return json(serversResponse);
      return new Response("upstream unreachable", { status: 502 });
    }));

    const r = await resolve({ server: "atlas" });
    expect(r.ok).toBe(false);
    expect(requests.filter((u) => u.includes(SEED_MINT)).length).toBe(2);
    expect(requests.filter((u) => u.includes("/embed/")).length).toBe(1);
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
    'let r="23423653",i={id:"a7f39c821d604e5b91e547b",fToken:"e83c4b719a52105479c1635a",'
    + 'mediaType:"c81b306d28147a35632e816b",path:"6b491e258d392e7561a9384c",'
    + 'season:"d8427b5c38a2f957c3613e85b",episode:"91c6ea753d1f785c92346b713d",'
    + 'ts:"61d9a5274c8e3b2f38c291e6",token:"c492f7a183d01e436c538a716d",'
    + 'title:"5e28c9147a06d1e29f3674b392a1",year:"b731e6c94f8675f8341c306e",'
    + 'date:"e164931a39e5814b3027",imdbId:"f35a81943265e871c4933a725f",'
    + 'latestDate:"e9543416ad739e5814b3027"};'
    + 'function n(t){let i=Date.now();return{xt:e.default.createHash("sha512").update(`${i}:${r}:${t}`).digest("hex").slice(0,64),rt:i}}'
    + 'function q(){return{queryFn:async()=>{let{data:e}=await X.post("/backend/fucku",'
    + '{[FIELD_MAP.id]:r,[FIELD_MAP.mediaType]:t,[FIELD_MAP.path]:l})}}}';

  it("reads the literal field-named params and the FIELD_MAP-fed mint path", () => {
    const c = deriveZxcContractFromChunks([FIELD_MAP_CHUNK]);
    expect(c).toBeTruthy();
    expect(c.mintPath).toBe("/backend/fucku");
    expect(c.params).toEqual({
      tmdbId: "a7f39c821d604e5b91e547b",
      mediaType: "c81b306d28147a35632e816b",
      path: "6b491e258d392e7561a9384c",
      season: "d8427b5c38a2f957c3613e85b",
      episode: "91c6ea753d1f785c92346b713d",
      fToken: "e83c4b719a52105479c1635a",
      ts: "61d9a5274c8e3b2f38c291e6",
      token: "c492f7a183d01e436c538a716d",
      title: "5e28c9147a06d1e29f3674b392a1",
      year: "b731e6c94f8675f8341c306e",
      date: "e164931a39e5814b3027",
    });
    expect(c.imdbParam).toBe("f35a81943265e871c4933a725f");
    expect(c.latestDateParam).toBe("e9543416ad739e5814b3027");
    expect(c.fTokenSalt).toBe("23423653");
  });

  it("ignores a `FIELD_MAP`-shaped object whose core params are incomplete", () => {
    const partial = 'const FIELD_MAP={id:"a7f39c821d604e5b9c1e547b",fToken:"a1b2c3"};';
    // No mint post AND missing params → no derived contract, so the caller keeps
    // its working seed instead of replacing it with a broken one.
    expect(deriveZxcContractFromChunks([partial])).toBeNull();
  });

  it("reads the contract from a single-quoted bundle too", () => {
    // Minifiers can flip quote style without touching the structure; a parser
    // that only accepts `"` would silently lose the whole contract.
    const single = FIELD_MAP_CHUNK.replace(/"/g, "'");
    expect(deriveZxcContractFromChunks([single])).toEqual(deriveZxcContractFromChunks([FIELD_MAP_CHUNK]));
  });
});
