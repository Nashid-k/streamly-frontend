// The no-pick ("auto") resolve path. Before this work the CLIENT walked
// PLAYER_SOURCES row by row, so a dead preferred server (Centaurus's delivery
// host answers HTTP 427) cost a full resolve round trip before the player could
// even try the next one. `auto` moves that walk onto the server: one request,
// health-ordered backends, and a server already known to be down is skipped
// outright. An explicit pick must still try ONLY the chosen server — never
// silently play a different one behind the viewer's back.
import { describe, expect, it, beforeEach, vi } from "vitest";

const mod = await import("../../api/stream.js");
const { default: handler } = mod;
const MINT_PATH = mod.zxcContractSeed().mintPath;
const SERVER_PARAM = mod.zxcContractSeed().params.path;

const b64 = (u) => Buffer.from(u, "utf8").toString("base64");
const json = (payload) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });

const MPD = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT20S" minBufferTime="PT4S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011">
  <Period id="P1" duration="PT20S">
    <AdaptationSet contentType="video" mimeType="video/mp4" segmentAlignment="true" startWithSAP="1">
      <Representation id="v0" bandwidth="800000" width="1920" height="1080" frameRate="24" codecs="avc1.4d401e">
        <SegmentTemplate timescale="24000" duration="120000" initialization="https://93.184.216.34/init-$RepresentationID$.m4s" media="https://93.184.216.34/$RepresentationID$/seg-$Number%05d$.m4s" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

let mpdStatus = {};
let mintedServers = [];
let emptyLinks = false;

function makeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader(key, value) {
      res.headers[key.toLowerCase()] = value;
      return res;
    },
    json(payload) {
      res.body = JSON.stringify(payload);
      return res;
    },
    send(payload) {
      res.body = payload;
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
}

async function call(body) {
  const res = makeRes();
  await handler(
    {
      method: "POST",
      body: { action: "resolvezxc", type: "movie", id: "12345", ...body },
      headers: { "x-forwarded-for": "203.0.113.9" },
    },
    res,
  );
  return JSON.parse(res.body);
}

beforeEach(() => {
  mod.clearZxcMpdCache();
  mod.clearZxcTitleMetaCache();
  mod.clearZxcServerHealth();
  mpdStatus = {};
  mintedServers = [];
  emptyLinks = false;
  let lastServer = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const url = String(typeof input === "string" ? input : input?.url || input);
      if (url.includes("/backend/tmdb/details/")) return json({ title: "Stub", release_date: "2024-01-01", imdb_id: "" });
      if (url.includes(MINT_PATH)) {
        let body = {};
        try {
          body = init?.body ? JSON.parse(init.body) : {};
        } catch {
          body = {};
        }
        lastServer = body[SERVER_PARAM] || lastServer;
        mintedServers.push(lastServer);
        return json({ token: "tok", ts: "1700000000" });
      }
      if (url.includes("/backend/servers/")) {
        return json({
          success: true,
          links: emptyLinks
            ? []
            : [{ link: b64(`https://93.184.216.34/${lastServer}.mpd`), type: "dash", resolution: 1080 }],
        });
      }
      if (url.endsWith(".mpd")) {
        const status = mpdStatus[url] ?? 200;
        if (status !== 200) return new Response("nope", { status });
        return new Response(MPD, { status: 200, headers: { "content-type": "application/dash+xml" } });
      }
      return new Response("upstream unreachable", { status: 502 });
    }),
  );
});

describe("ZXC automatic failover", () => {
  it("falls through to a live backend when the preferred server's delivery host is hard-down", async () => {
    mpdStatus = { "https://93.184.216.34/orion.mpd": 427 };
    const r = await call({ auto: true });
    expect(r.ok).toBe(true);
    expect(r.server).toBe("andromeda");
    // orion (the provider's Server 1) was attempted, cooled, then andromeda served it.
    expect(mintedServers).toEqual(["orion", "andromeda"]);
  });

  it("skips a server already in cooldown on the next automatic resolve", async () => {
    mpdStatus = { "https://93.184.216.34/orion.mpd": 427 };
    await call({ auto: true }); // cools orion
    mod.clearZxcMpdCache(); // the MPD cache only — health deliberately survives
    mintedServers = [];
    const r = await call({ auto: true });
    expect(r.ok).toBe(true);
    expect(r.server).toBe("andromeda");
    // orion is cooling, so it is not attempted at all this time.
    expect(mintedServers).toEqual(["andromeda"]);
  });

  it("a soft miss does NOT cool a server (a title absent on every backend)", async () => {
    emptyLinks = true;
    const r = await call({ auto: true });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("no-source");
    // Every backend was walked (soft misses keep the rotation alive), and the
    // next resolve must still be free to try orion first.
    mintedServers = [];
    const r2 = await call({ auto: true });
    expect(r2.ok).toBe(false);
    expect(mintedServers[0]).toBe("orion");
  });

  it("a hard-down backend ends the walk early instead of draining every server", async () => {
    mpdStatus = {
      "https://93.184.216.34/orion.mpd": 427,
      "https://93.184.216.34/andromeda.mpd": 427,
      "https://93.184.216.34/centaurus.mpd": 427,
    };
    const r = await call({ auto: true });
    expect(r.ok).toBe(false);
    // Three hard failures is the cap — atlas and meow are never attempted.
    expect(mintedServers).toEqual(["orion", "andromeda", "centaurus"]);
  });

  it("an explicit pick still tries ONLY the chosen server, even if it is dead", async () => {
    mpdStatus = { "https://93.184.216.34/centaurus.mpd": 427 };
    const r = await call({ server: "centaurus" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("no-source");
    // It must not silently resolve another row behind the viewer's back.
    expect(mintedServers).toEqual(["centaurus"]);
  });
});
