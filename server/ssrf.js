// server/ssrf.js — outbound-request allow-list for the download function.
// Every upstream URL (and every redirect hop) must pass assertPublicDestination
// before the function is allowed to fetch it: a public hostname may still
// resolve to a loopback/link-local/metadata address, which would turn this
// server into a proxy for internal-only endpoints.
import { lookup } from "node:dns/promises";
import net from "node:net";

function isBlockedHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "169.254.169.254" || h.startsWith("169.254.")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^\[?f[cd][0-9a-f]{2}:/i.test(h)) return true;
  return false;
}

function ipv4ToInt(ip) {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIpV4(ip) {
  const n = ipv4ToInt(ip);
  // 0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10, 198.18/15,
  // 224/4 multicast + higher reserved, 255.255.255.255.
  if (n === 0xffffffff) return true;
  if ((n >>> 24) === 0) return true;
  if ((n >>> 24) === 127) return true;
  if ((n >>> 24) === 10) return true;
  if ((n >>> 16) === 0xa9fe) return true; // 169.254.0.0/16 link-local + metadata
  if ((n >>> 20) === 0xac1) return true; // 172.16.0.0/12
  if ((n >>> 16) === 0xc0a8) return true; // 192.168.0.0/16
  if ((n >>> 22) === 0x191) return true; // 100.64.0.0/10 CGNAT (100.64-100.127)
  if ((n >>> 16) >= 0xc612 && (n >>> 16) <= 0xc613) return true; // 198.18.0.0/15 benchmarking
  if ((n >>> 28) >= 0xe) return true; // 224.0.0.0/4 multicast and above
  return false;
}

function isPrivateIpV6(ip) {
  const lower = String(ip).toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (/^f[cd][0-9a-f]{2}/.test(lower)) return true; // fc00::/7 ULA
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  const v4 = lower.split(":").pop();
  if (v4 && v4.includes(".")) return isPrivateIpV4(v4);
  return false;
}

function isPrivateIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateIpV4(ip);
  if (v === 6) return isPrivateIpV6(ip);
  return true; // unparseable hostname masquerading as IP -> block
}

/* SSRF hardening — DNS-resolving destination check. The string blocklist above
   catches "169.254.169.254" and friends, but NOT literal encodings:
   "http://2130706433/" (127.0.0.1) or "http://0177.0.0.1/" — getaddrinfo may
   interpret them as loopback and a name-based check never sees the IP. We
   therefore resolve the hostname (all addresses) and require every address to
   be a public IP. Called for the FIRST hop AND every redirect target. */
async function assertPublicDestination(urlStr) {
  const u = new URL(urlStr);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("blocked protocol");
  const hostname = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname) throw new Error("blocked host");
  if (isBlockedHost(hostname)) throw new Error(`blocked host: ${hostname}`);

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error(`blocked host: ${hostname}`);
    return u.toString();
  }

  let records;
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    throw new Error(`blocked host: ${hostname}`);
  }
  if (!records || records.length === 0) throw new Error(`blocked host: ${hostname}`);
  for (const record of records) {
    if (isPrivateIp(record.address)) throw new Error(`blocked host: ${hostname}`);
  }
  return u.toString();
}

export {
  assertPublicDestination,
  isBlockedHost,
  isPrivateIp,
  isPrivateIpV4,
  isPrivateIpV6,
  ipv4ToInt,
};
