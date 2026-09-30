// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  default: { lookup: lookupMock },
  lookup: lookupMock,
}));

import {
  parseAllowlist,
  isBlockedIp,
  assertSafeUrl,
  assertSafeDestination,
  safeFetch,
  EgressBlockedError,
} from "./guard";

beforeEach(() => {
  lookupMock.mockReset();
  delete process.env.AIGP_EGRESS_ALLOWLIST;
});

afterEach(() => {
  delete process.env.AIGP_EGRESS_ALLOWLIST;
  vi.unstubAllGlobals();
});

describe("isBlockedIp", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.255",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::",
    "::ffff:10.0.0.1",
    // WHATWG URL serializes IPv4-mapped addresses to hex form:
    "::ffff:a00:1",
  ])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111"])(
    "allows public %s",
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    },
  );

  it("treats unparseable input as blocked (fail safe)", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
  });

  it("allowlisted CIDR overrides the blocklist", () => {
    process.env.AIGP_EGRESS_ALLOWLIST = "10.1.2.0/24";
    expect(isBlockedIp("10.1.2.3")).toBe(false);
    expect(isBlockedIp("10.9.9.9")).toBe(true);
  });

  it("allowlisted exact IP overrides the blocklist", () => {
    process.env.AIGP_EGRESS_ALLOWLIST = "127.0.0.1";
    expect(isBlockedIp("127.0.0.1")).toBe(false);
    expect(isBlockedIp("127.0.0.2")).toBe(true);
  });
});

describe("parseAllowlist", () => {
  it("splits CIDRs, exact hosts and wildcard suffixes", () => {
    const al = parseAllowlist("10.0.0.0/8, splunk.internal, *.corp.local");
    expect(al.cidrs.check("10.1.2.3", "ipv4")).toBe(true);
    expect(al.exactHosts.has("splunk.internal")).toBe(true);
    expect(al.wildcardSuffixes).toEqual([".corp.local"]);
  });

  it("ignores malformed entries without opening the guard", () => {
    const al = parseAllowlist("999.1.1.1/8,10.0.0.0/notaprefix, ,10.5.0.0/16");
    expect(al.cidrs.check("10.5.1.1", "ipv4")).toBe(true);
    expect(al.cidrs.check("10.1.1.1", "ipv4")).toBe(false);
  });

  it("returns an empty allowlist for undefined", () => {
    const al = parseAllowlist(undefined);
    expect(al.exactHosts.size).toBe(0);
    expect(al.wildcardSuffixes).toEqual([]);
  });
});

describe("assertSafeUrl", () => {
  it("rejects non-http(s) schemes", () => {
    expect(() => assertSafeUrl("ftp://example.com/x")).toThrow(
      EgressBlockedError,
    );
    expect(() => assertSafeUrl("file:///etc/passwd")).toThrow(/scheme/);
  });

  it("rejects userinfo", () => {
    expect(() => assertSafeUrl("http://user:pass@example.com/")).toThrow(
      /userinfo/,
    );
  });

  it("rejects a literal blocked IPv4 hostname", () => {
    expect(() => assertSafeUrl("http://169.254.169.254/latest")).toThrow(
      /blocked range/,
    );
  });

  it("rejects bracketed IPv6 loopback", () => {
    expect(() => assertSafeUrl("http://[::1]:8080/")).toThrow(/blocked range/);
  });

  it("rejects IPv4-mapped IPv6 literals", () => {
    expect(() => assertSafeUrl("http://[::ffff:10.0.0.1]/")).toThrow(
      /blocked range/,
    );
  });

  it("does not echo the raw URL on parse failure", () => {
    let caught: unknown;
    try {
      assertSafeUrl("http://[secret-value");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EgressBlockedError);
    expect((caught as Error).message).not.toContain("secret-value");
  });

  it("passes public hostname URLs through and returns the parsed URL", () => {
    expect(assertSafeUrl("https://api.example.com/v1").hostname).toBe(
      "api.example.com",
    );
  });

  it("allows a blocked literal IP when allowlisted", () => {
    process.env.AIGP_EGRESS_ALLOWLIST = "127.0.0.1/32";
    expect(assertSafeUrl("http://127.0.0.1:3000/x").hostname).toBe("127.0.0.1");
  });

  it("carries the allowlist hint in every error message", () => {
    let caught: unknown;
    try {
      assertSafeUrl("http://10.0.0.1/");
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toContain("AIGP_EGRESS_ALLOWLIST");
  });
});

describe("assertSafeDestination", () => {
  it("resolves DNS and passes public destinations", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const url = await assertSafeDestination("https://api.example.com/v1");
    expect(url.hostname).toBe("api.example.com");
    expect(lookupMock).toHaveBeenCalledWith("api.example.com", {
      all: true,
      verbatim: true,
    });
  });

  it("blocks when ANY resolved record is private", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    await expect(
      assertSafeDestination("https://rebind.example.com/"),
    ).rejects.toThrow(/resolves to 10\.0\.0\.5/);
  });

  it("skips DNS for wildcard-allowlisted hostnames", async () => {
    process.env.AIGP_EGRESS_ALLOWLIST = "*.corp.local";
    await expect(
      assertSafeDestination("https://splunk.corp.local/hec"),
    ).resolves.toBeInstanceOf(URL);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("wildcard does not match the apex domain", async () => {
    process.env.AIGP_EGRESS_ALLOWLIST = "*.corp.local";
    lookupMock.mockResolvedValue([{ address: "10.0.0.9", family: 4 }]);
    await expect(assertSafeDestination("https://corp.local/")).rejects.toThrow(
      EgressBlockedError,
    );
  });

  it("skips DNS for exact-allowlisted hostnames", async () => {
    process.env.AIGP_EGRESS_ALLOWLIST = "splunk.internal";
    await expect(
      assertSafeDestination("http://splunk.internal:8088/"),
    ).resolves.toBeInstanceOf(URL);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("propagates DNS failure as a normal error, not EgressBlockedError", async () => {
    lookupMock.mockRejectedValue(
      Object.assign(new Error("getaddrinfo ENOTFOUND nope.example.com"), {
        code: "ENOTFOUND",
      }),
    );
    let caught: unknown;
    try {
      await assertSafeDestination("https://nope.example.com/");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(EgressBlockedError);
    expect((caught as Error).message).toContain("ENOTFOUND");
  });
});

describe("safeFetch", () => {
  it("fetches with redirect:'manual' and returns the response", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const res = await safeFetch("https://api.example.com/v1", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1", {
      method: "POST",
      redirect: "manual",
    });
  });

  it("throws EgressBlockedError on a 3xx response", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 302, ok: false }),
    );
    await expect(safeFetch("https://api.example.com/v1")).rejects.toThrow(
      /redirect \(302\)/,
    );
  });

  it("never calls fetch for a blocked destination", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(safeFetch("http://10.0.0.1/x")).rejects.toThrow(
      EgressBlockedError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
