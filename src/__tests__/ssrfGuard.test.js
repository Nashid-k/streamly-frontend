// The download function will fetch any URL a caller hands it, so these
// predicates are the only thing standing between a public endpoint and the
// platform's internal network (loopback, RFC1918, link-local, the 169.254.169.254
// metadata address, IPv6 ULA). They had no coverage at all before the guard
// moved into server/ssrf.js.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup, default: { lookup } }));

import {
  assertPublicDestination,
  isBlockedHost,
  isPrivateIp,
  isPrivateIpV4,
  isPrivateIpV6,
  ipv4ToInt,
} from "../../server/ssrf.js";

beforeEach(() => {
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
});

describe("isBlockedHost", () => {
  it.each([
    "localhost",
    "db.internal",
    "printer.local",
    "0.0.0.0",
    "::1",
    "[::1]",
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.5",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.169.254",
    "fc00::1",
    "fd12:3456::1",
  ])("blocks %s", (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.15.0.1",
    "172.32.0.1",
    "vidcore.io",
    "www.vidcore.io",
    "moon.quietridge.top",
  ])("allows %s", (host) => {
    expect(isBlockedHost(host)).toBe(false);
  });

  it("blocks an empty hostname instead of allowing it through", () => {
    expect(isBlockedHost("")).toBe(true);
    expect(isBlockedHost(undefined)).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isBlockedHost("LOCALHOST")).toBe(true);
    expect(isBlockedHost("FD00::1")).toBe(true);
  });

  it("leaves names the string list cannot judge (api.localhost) to the DNS pass", async () => {
    // A subdomain of localhost is not matched by the literal list, so the
    // authoritative check is the resolved address: RFC 6761 sends *.localhost
    // to loopback, which isPrivateIp then refuses.
    expect(isBlockedHost("api.localhost")).toBe(false);
    lookup.mockResolvedValue([{ address: "127.0.0.1" }]);
    await expect(assertPublicDestination("http://api.localhost/x")).rejects.toThrow(/blocked host/);
  });
});

describe("ipv4ToInt", () => {
  it("packs octets into an unsigned 32-bit integer", () => {
    expect(ipv4ToInt("0.0.0.0")).toBe(0);
    expect(ipv4ToInt("0.0.0.1")).toBe(1);
    expect(ipv4ToInt("8.8.8.8")).toBe(134744072);
    expect(ipv4ToInt("255.255.255.255")).toBe(4294967295);
  });
});

describe("isPrivateIpV4", () => {
  it.each([
    "0.0.0.0", // 0/8 "this network"
    "0.1.2.3",
    "10.255.255.255",
    "127.0.0.1", // loopback
    "169.254.169.254", // cloud metadata
    "169.254.0.1",
    "172.16.0.1", // RFC1918 172.16/12
    "172.31.255.255",
    "192.168.0.1",
    "100.64.0.1", // CGNAT 100.64/10
    "198.18.0.1", // benchmarking 198.18/15
    "224.0.0.1", // multicast 224/4
    "240.0.0.1", // reserved
    "255.255.255.255",
  ])("blocks %s", (ip) => {
    expect(isPrivateIpV4(ip)).toBe(true);
  });

  it.each(["1.1.1.1", "8.8.8.8", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "198.20.0.1", "223.255.255.255"])(
    "allows %s",
    (ip) => {
      expect(isPrivateIpV4(ip)).toBe(false);
    },
  );
});

describe("isPrivateIpV6", () => {
  it.each(["::", "::1", "fc00::1", "fd00::1", "fe80::1", "fe9f::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"])(
    "blocks %s",
    (ip) => {
      expect(isPrivateIpV6(ip)).toBe(true);
    },
  );

  it.each(["2606:4700:4700::1111", "2a00:1450:4001:81f::200e"])("allows %s", (ip) => {
    expect(isPrivateIpV6(ip)).toBe(false);
  });
});

describe("isPrivateIp", () => {
  it("dispatches on address family", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("2606:4700::1111")).toBe(false);
  });

  it("blocks anything that is not a valid IP, so a hostname cannot slip through", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
    expect(isPrivateIp("example.com")).toBe(true);
    expect(isPrivateIp("")).toBe(true);
  });
});

describe("assertPublicDestination", () => {
  it.each(["file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)"])(
    "refuses the %s scheme",
    async (url) => {
      await expect(assertPublicDestination(url)).rejects.toThrow(/blocked protocol/);
    },
  );

  it.each([
    "http://127.0.0.1/",
    "http://10.0.0.1/admin",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]:8080/",
  ])("refuses the literal internal address in %s", async (url) => {
    await expect(assertPublicDestination(url)).rejects.toThrow(/blocked host/);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("allows a literal public address without a DNS round trip", async () => {
    await expect(assertPublicDestination("https://8.8.8.8/resolve")).resolves.toContain("8.8.8.8");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("allows a hostname whose addresses are all public", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34" }, { address: "2606:2800:220:1::1" }]);
    await expect(assertPublicDestination("https://vidcore.io/embed")).resolves.toContain("vidcore.io");
  });

  it("refuses a public-looking hostname that resolves to loopback", async () => {
    lookup.mockResolvedValue([{ address: "127.0.0.1" }]);
    await expect(assertPublicDestination("https://evil.example/steal")).rejects.toThrow(/blocked host/);
  });

  it("refuses when even one resolved address is internal (DNS rebinding)", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34" }, { address: "169.254.169.254" }]);
    await expect(assertPublicDestination("https://mixed.example/")).rejects.toThrow(/blocked host/);
  });

  it("refuses the integer-encoded loopback the string list cannot see", async () => {
    // http://2130706433/ is 127.0.0.1 to getaddrinfo; the name check never sees
    // an IP, so only the resolved-address pass can catch it.
    lookup.mockResolvedValue([{ address: "127.0.0.1" }]);
    await expect(assertPublicDestination("http://2130706433/")).rejects.toThrow(/blocked host/);
  });

  it("refuses a name that does not resolve", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertPublicDestination("https://nope.invalid/x")).rejects.toThrow(/blocked host/);
  });

  it("refuses a name that resolves to nothing", async () => {
    lookup.mockResolvedValue([]);
    await expect(assertPublicDestination("https://empty.invalid/x")).rejects.toThrow(/blocked host/);
  });
});
