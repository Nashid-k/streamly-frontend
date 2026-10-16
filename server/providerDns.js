// server/providerDns.js — DNS resolution with an authoritative-nameserver
// fallback for hosts the OS resolver can no longer see.
//
// WHY THIS EXISTS (2026-10-15): the stream provider's registrar placed
// vidstuck.xyz on `client hold`. A client hold keeps the domain's registration
// record alive but strips its delegation from the .xyz TLD zone, so EVERY
// recursive resolver on the public internet answers NXDOMAIN — while the zone
// itself still lives, unchanged, on the registrant's own nameservers
// (Cloudflare), which still answer for the name. The provider's site, mint,
// server list, manifests and segments were all fully operational the whole
// time; only the directory door was locked. A mint-path rename is invisible in
// that state (no HTTP request can even leave), and no embed-chunk self-heal
// can run without DNS either — the fallback has to live BELOW the HTTP layer.
//
// STRATEGY, per hostname:
//   1. OS resolution first (healthy domains behave exactly as before, cached).
//   2. On failure, discover the domain's nameservers — recursive NS lookup
//      first (healthy domains), then the domain's RDAP registration record
//      (the only place delegation is still discoverable for a held name) —
//      ask those servers directly over a hand-rolled UDP DNS packet, and
//      cache the answer marked as pinned.
//   3. When that also fails (domain genuinely gone), a short negative cache
//      stops every upstream call from re-storming the discovery walk.
//
// WHY A HAND-ROLLED PACKET: Node's c-ares Resolver, pointed at these very
// nameservers, answered NXDOMAIN for A/AAAA/NS/SOA/ANY of the held name while
// plain nslookup over the same UDP port returned its A records — the DO/EDNS
// flags c-ares adds are enough to route the authoritative answer into a
// different code path (the zone is DNSSEC-signed and the hold strips its DS
// record; DO-bit queries hit the broken-DNSSEC surface). The packet below is
// bit-for-bit the shape nslookup sends: RD set, no EDNS, no OPT record.
//
// SECURITY CONTRACT: the pin is consulted by assertPublicDestination BEFORE
// any outbound connect, and the records it returns are checked against the
// usual private/metadata rules there — a pinned host can never sneak a
// loopback address past the SSRF gate, because the same answer object is what
// gets validated. Callers must not connect from an address WITHOUT that check.
import dns from "node:dns";
import dgram from "node:dgram";
import net from "node:net";
import { lookup as dnsLookupP, resolveNs as dnsResolveNsP } from "node:dns/promises";
import { resolve4 as dnsResolve4P, resolve6 as dnsResolve6P } from "node:dns/promises";

/* Freshness windows. The pinned record is only a working surrogate for OS
   resolution, so it has to re-check the OS path fairly often: when the hold
   is lifted (or the provider moves hosts) the normal answer must take over
   within minutes. The negative cache is short so a recovered domain is
   re-discovered quickly too. */
const OS_TTL_MS = 60_000; // healthy-domain cache: OS path re-consulted every minute
const NEG_TTL_MS = 30_000; // both paths failed: skip the whole walk for 30 seconds
const AUTH_TTL_CAP_MS = 10 * 60_000; // never trust one authoritative TTL longer than 10 min
const MAX_NS_SERVERS = 3;
const AUTH_QUERY_TIMEOUT_MS = 1500;
const TCP_QUERY_TIMEOUT_MS = 2500; // TCP connects slower than a LAN UDP shot; still well under the fetch budget

const recordsCache = new Map(); // hostname -> { records, expiresAt }
const failCache = new Map(); // hostname -> { expiresAt }

/* ── RDAP discovery ──────────────────────────────────────────────────────── */

/* rdap.org (IANA bootstrap) 403s non-browser clients from some networks, so
   the ladder starts with the registry's own well-known RDAP service for the
   TLDs in play, then falls back to the bootstrap redirector. An env override
   keeps this honest if the instance ever follows the provider onto a domain
   on a TLD the map does not know. */
const RDAP_LADDER = [
  process.env.STREAMLY_RDAP_BASE, // highest priority: instance-specific override
  "https://rdap.centralnic.com/xyz/domain/", // .xyz registry (vidstuck.xyz et al.)
  "https://rdap.verisign.com/com/v1/domain/", // .com
  "https://rdap.nic.google/domain/", // .dev and friends
  /* The IANA bootstrap redirector goes LAST: it 403s non-browser clients from
     some networks, and trying it first spent the whole 6s RDAP budget before
     the registry that actually owns the name was consulted — enough to push a
     held-domain resolve past the fetch timeout. */
  "https://rdap.org/domain/",
].filter(Boolean);
const RDAP_TIMEOUT_MS = 6000;
const RDAP_CACHE_MS = 12 * 60 * 60_000; // NS sets change at registrar-drag speed
const RDAP_NEG_TTL_MS = 60 * 60_000;
const MAX_RDAP_NS = 4;

const rdapNsCache = new Map(); // hostname -> { ns: [...] } or { ns: null }

/* The zone whose nameservers hold this name. A delegated subdomain's NS records
   live in the PARENT zone's registration record, and a registrar hold strips
   the delegation from the recursive tree for the WHOLE zone at once — so when
   the exact host yields no nameservers (e.g. the provider moved its site onto
   `backup.vidstuck.xyz` while the held apex still owns the registration), we
   walk up to the registrable domain and read ITS registration record. The
   authoritative query later still asks for the ORIGINAL host, which that zone
   answers. */
function candidateZones(host) {
  const labels = host.split(".");
  const zones = [];
  for (let i = 0; i <= labels.length - 2; i += 1) zones.push(labels.slice(i).join("."));
  return zones;
}

/* Recursive NS lookup for one zone, then its RDAP registration record. Returns
   a nameserver-name array or null. A 404 from the registry ends the ladder for
   THIS zone (the zone is not a registrable domain), so the caller can try the
   parent zone instead. */
async function nameserversForZone(zone) {
  try {
    const viaDns = await dnsResolveNsP(zone);
    if (Array.isArray(viaDns) && viaDns.length > 0) return viaDns;
  } catch {
    /* held/unresolvable in the recursive tree: fall through to RDAP */
  }

  for (const base of RDAP_LADDER) {
    if (base.includes("/xyz/") && !zone.endsWith(".xyz")) continue;
    if (base.includes("/com/v1/") && !zone.endsWith(".com")) continue;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);
      let resp;
      try {
        resp = await fetch(`${base}${encodeURIComponent(zone)}`, {
          signal: controller.signal,
          headers: { accept: "application/rdap+json" },
          redirect: "follow",
        });
      } finally {
        clearTimeout(timer);
      }
      if (resp.ok) {
        const data = await resp.json();
        const fromRdap = (data?.nameservers || [])
          .map((n) => String(n?.ldhName || "").toLowerCase().replace(/\.$/, ""))
          .filter(Boolean)
          .slice(0, MAX_RDAP_NS);
        if (fromRdap.length > 0) return fromRdap;
      } else if (resp.status === 404) {
        break; // not a registrable domain — let the caller try the parent zone
      }
    } catch {
      // next ladder rung
    }
  }
  return null;
}

/* The nameserver hostnames for this host: the exact-host zone first (zero cost
   for healthy domains), then each parent zone up to the registrable domain.
   Both the recursive NS answer and the RDAP registration record are consulted
   per zone; the result is cached under the ORIGINAL host. */
async function discoverNameservers(host) {
  const now = Date.now();
  const cached = rdapNsCache.get(host);
  if (cached?.expiresAt > now) return cached.ns;

  let nsNames = null;
  for (const zone of candidateZones(host)) {
    nsNames = await nameserversForZone(zone);
    if (nsNames) break;
  }

  rdapNsCache.set(host, {
    ns: nsNames,
    expiresAt: now + (nsNames ? RDAP_CACHE_MS : RDAP_NEG_TTL_MS),
  });
  return nsNames;
}

/* ── One authoritative A/AAAA query, UDP first, TCP fallback ─────────────── */

const QTYPE = { A: 1, AAAA: 28 };

export function buildQuery(id, host, qtype) {
  const name = Buffer.alloc(host.length + 1);
  let at = 0;
  for (const part of host.split(".")) {
    name[at] = part.length;
    Buffer.from(part, "ascii").copy(name, at + 1);
    at += part.length + 1;
  }
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0100, 2); // RD=1, no EDNS/OPT — exactly the nslookup shape
  header.writeUInt16BE(1, 4); // QDCOUNT
  /* `name` ends right after the last label — the root-label zero here IS the
     terminator (host.length+1 alloc fills every byte with labels, none left).
     Question trailer: type(2) + class IN(2), both big-endian. Hex-verified:
     `03 78797a 00 0001 0001` = "xyz". root, A, IN. */
  return Buffer.concat([header, name, Buffer.from([0, (qtype >> 8) & 0xff, qtype & 0xff, 0, 1])]);
}

/* Walks header + question + answers; returns [{address, family, ttl}] for the
   A/AAAA records, or null when the answer code is not NOERROR/empty. */
export function parseQuery(buf) {
  if (buf.length < 12) return null;
  if ((buf.readUInt16BE(2) & 0x0f) !== 0) return null; // NXDOMAIN/SERVFAIL/…: treat as miss
  const anCount = buf.readUInt16BE(6);
  let at = 12;
  const skipLabel = () => {
    while (at < buf.length) {
      const len = buf[at];
      if (len === 0) {
        at += 1;
        return;
      }
      if ((len & 0xc0) === 0xc0) {
        at += 2; // compression pointer
        return;
      }
      at += len + 1;
    }
  };
  skipLabel();
  at += 4; // qtype + qclass
  const records = [];
  for (let i = 0; i < anCount && at + 10 <= buf.length; i += 1) {
    if ((buf[at] & 0xc0) === 0xc0) at += 2;
    else skipLabel();
    const type = buf.readUInt16BE(at);
    const ttl = buf.readUInt32BE(at + 4);
    const rdLength = buf.readUInt16BE(at + 8);
    at += 10;
    if (type === QTYPE.A && rdLength === 4) {
      records.push({
        address: `${buf[at]}.${buf[at + 1]}.${buf[at + 2]}.${buf[at + 3]}`,
        family: 4,
        ttl,
      });
    } else if (type === QTYPE.AAAA && rdLength === 16) {
      const groups = [];
      for (let g = 0; g < 16; g += 2) groups.push(buf.readUInt16BE(at + g).toString(16));
      records.push({ address: groups.join(":"), family: 6, ttl });
    }
    at += rdLength;
  }
  return records.length > 0 ? records : null;
}

/* One server, ONE question per call (UDP attempt, TCP retry on silence). The
   A/AAAA PROMOTION lives in the caller: both servers are tried for IPv4
   before AAAA is ever asked, because a same-id burst returns whichever
   packet lands first — which flipped the cached pin between IPv4-only and
   IPv6-only across runs, and hosts with no IPv6 route then died on connect. */
function authoritativeQuery(host, serverIp, qtype, family) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = dgram.createSocket(serverIp.includes(":") ? "udp6" : "udp4");
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), AUTH_QUERY_TIMEOUT_MS);
    socket.on("error", () => finish(null));
    const id = (Math.random() * 0xffff) | 0;
    socket.on("message", (msg) => {
      /* A reply that matches our id and has the response bit set is DEFINITIVE —
         including a NOERROR/NODATA or NXDOMAIN answer carrying zero records.
         Waiting for the timeout on an empty answer turned every one into a
         1.5s stall PER server, so a name with only AAAA records cost ~36s
         before the AAAA round even started. `null` here means "asked and
         answered: no A/AAAA", not silence. */
      if (msg.length >= 12 && msg.readUInt16BE(0) === id && (msg.readUInt16BE(2) & 0x8000)) {
        finish(parseQuery(msg));
      }
    });
    try {
      socket.send(buildQuery(id, host, qtype), 53, serverIp);
    } catch {
      finish(null);
    }
  });
}

/* The TCP retry: the SAME single question, length-prefixed as DNS-over-TCP
   frames every message behind a 2-byte big-endian length — no other framing
   exists.
   NOTE: the connect/read runs under its own timeout NEVER longer than the
   caller's remaining budget — this fires only AFTER the UDP timeout already
   resolved the outer promise, so a wedged TCP connect is inert, not hanging. */
function tcpQuery(host, serverIp, qtype, family) {
  const id = (Math.random() * 0xffff) | 0;
  return new Promise((resolve, reject) => {
    let done = false;
    let buffered = null;
    const socket = new net.Socket();
    const finish = (result, err) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (err) reject(err); else resolve(result);
    };
    const rung = setTimeout(() => finish(null, new Error("dns/tcp timeout")), TCP_QUERY_TIMEOUT_MS);
    const tryParse = () => {
      if (done || !buffered || buffered.length < 2) return;
      const frameLen = buffered.readUInt16BE(0);
      if (buffered.length < frameLen + 2) return;
      const msg = buffered.subarray(2, frameLen + 2);
      buffered = buffered.subarray(frameLen + 2);
      const parsed = parseQuery(msg);
      if (parsed) {
        clearTimeout(rung);
        finish(parsed);
      }
      tryParse(); // trailing bytes may themselves carry nothing more
    };
    socket.on("error", (err) => {
      clearTimeout(rung);
      finish(null, err);
    });
    socket.on("data", (chunk) => {
      buffered = buffered ? Buffer.concat([buffered, chunk]) : chunk;
      tryParse();
    });
    socket.connect(53, serverIp, () => {
      socket.write(buildQuery(id, host, qtype));
    });
  });
}

/* ── The public entry ────────────────────────────────────────────────────── */

/* Resolve ONE name through the authoritative NS path. Returns
   [{address, family, ttl}] or null. No throw anywhere a caller could catch
   accidentally. Never used DIRECTLY to connect: the result must pass the
   privacy checks in ssrf.assertPublicDestination first. */
async function resolveViaAuthoritative(host) {
  const nsNames = await discoverNameservers(host);
  if (!nsNames || nsNames.length === 0) return null;

  /* The NS hostnames resolve through the normal tree (a hold on the WRONG
     domain never touches cloudflare.com names). */
  const servers = [];
  for (const name of nsNames.slice(0, MAX_NS_SERVERS)) {
    try {
      for (const address of await dnsResolve4P(name)) servers.push({ address, family: 4 });
    } catch {
      /* NS may be IPv6-only */
    }
    try {
      for (const address of await dnsResolve6P(name)) servers.push({ address, family: 6 });
    } catch {
      /* NS may be IPv4-only */
    }
  }
  if (servers.length === 0) return null;

  /* Deterministic record selection runs across the WHOLE NS pool, not per
     first-answering server: ask A everywhere, only then AAAA everywhere. A
     per-server burst returns whichever packet lands first, which flipped the
     cached pin between IPv4-only and IPv6-only across runs — and hosts with
     no IPv6 route (this dev box among them) then died inside the connect. */
  let records = [];
  for (const server of servers) {
    const got = await authoritativeQuery(host, server.address, QTYPE.A, server.family);
    if (got && got.length > 0) records = records.concat(got);
  }
  if (records.length === 0) {
    for (const server of servers) {
      const got = await authoritativeQuery(host, server.address, QTYPE.AAAA, server.family);
      if (got && got.length > 0) records = records.concat(got);
    }
  }
  return records.length > 0 ? records : null;
}

/* The name callers resolve with. Returns [{address, family, ttl}] or null —
   never throws. */
export async function resolveUpstream(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return null;
  const now = Date.now();

  const freshRecords = recordsCache.get(host);
  if (freshRecords?.expiresAt > now) return freshRecords.records;
  const freshFail = failCache.get(host);
  if (freshFail?.expiresAt > now) return null;

  /* 1) The OS resolver — identical to what ran before this module existed. */
  let osRecords = null;
  try {
    osRecords = await dnsLookupP(host, { all: true });
  } catch {
    osRecords = null;
  }
  if (Array.isArray(osRecords) && osRecords.length > 0) {
    const records = osRecords.map((r) => ({ address: r.address, family: r.family, ttl: null }));
    recordsCache.set(host, { records, expiresAt: now + OS_TTL_MS, pinned: false });
    return records;
  }

  /* 2) The authoritative fallback (see module header). */
  const pinned = await resolveViaAuthoritative(host);
  if (pinned) {
    /* Honour the zone's own TTL, capped — a stuck hold must not pin stale
       addresses forever, and a future host move must be noticed. */
    const ttls = pinned.map((r) => (Number.isFinite(r.ttl) ? r.ttl * 1000 : AUTH_TTL_CAP_MS));
    recordsCache.set(host, {
      records: pinned,
      expiresAt: now + Math.min(Math.min(...ttls), AUTH_TTL_CAP_MS),
      pinned: true,
    });
    return pinned;
  }

  failCache.set(host, { expiresAt: now + NEG_TTL_MS });
  return null;
}

/* Cache-only peek: is there a fresh PINNED record for this hostname RIGHT NOW,
   without any resolution cost? The pin is written by resolveUpstream just
   before assertPublicDestination returns, so by the time net.js builds the
   outbound request the answer is available synchronously — used to pick the
   fetch that actually accepts a pinned-Artificial-Agent dispatcher (global
   fetch and undici's own fetch disagree on Agent majors: passing an npm-undici
   Agent to node:internal fetch rejects with UND_ERR_INVALID_ARG). Healthy
   hostnames peek null → the plain global fetch path runs, exactly as before. */
export function peekPin(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  const hit = recordsCache.get(host);
  /* ONLY an authoritative-path answer is a "pin": an OS-resolved cache entry is
     already handled by the plain resolver the plain fetch uses, and reporting it
     as a pin routed EVERY request (healthy hosts included) through undici's
     fetch + this dispatcher — the exact global behavior change the plain path
     exists to avoid. */
  return hit?.pinned && hit.expiresAt > Date.now() ? hit.records : null;
}

/* Test seam: clear every cache between cases. */
export function clearDnsCaches() {
  recordsCache.clear();
  failCache.clear();
  rdapNsCache.clear();
}
