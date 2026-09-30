import { isIP, BlockList } from "node:net";
import dns from "node:dns/promises";

const ALLOWLIST_HINT =
  "If this is a legitimate internal destination, add it to AIGP_EGRESS_ALLOWLIST.";

export class EgressBlockedError extends Error {
  constructor(detail: string) {
    super(`Egress blocked: ${detail}. ${ALLOWLIST_HINT}`);
    this.name = "EgressBlockedError";
  }
}

const BLOCKED = new BlockList();
BLOCKED.addSubnet("127.0.0.0", 8, "ipv4"); // loopback
BLOCKED.addSubnet("10.0.0.0", 8, "ipv4"); // RFC1918
BLOCKED.addSubnet("172.16.0.0", 12, "ipv4"); // RFC1918
BLOCKED.addSubnet("192.168.0.0", 16, "ipv4"); // RFC1918
BLOCKED.addSubnet("169.254.0.0", 16, "ipv4"); // link-local incl. cloud metadata
BLOCKED.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT
BLOCKED.addAddress("0.0.0.0", "ipv4"); // unspecified
BLOCKED.addAddress("::1", "ipv6"); // loopback
BLOCKED.addSubnet("fe80::", 10, "ipv6"); // link-local
BLOCKED.addSubnet("fc00::", 7, "ipv6"); // ULA
BLOCKED.addAddress("::", "ipv6"); // unspecified

export interface EgressAllowlist {
  cidrs: BlockList;
  exactHosts: Set<string>;
  wildcardSuffixes: string[];
}

export function parseAllowlist(raw: string | undefined): EgressAllowlist {
  const cidrs = new BlockList();
  const exactHosts = new Set<string>();
  const wildcardSuffixes: string[] = [];
  for (const rawEntry of (raw ?? "").split(",")) {
    const entry = rawEntry.trim().toLowerCase();
    if (!entry) continue;
    try {
      if (entry.startsWith("*.")) {
        const suffix = entry.slice(1); // "*.corp.local" -> ".corp.local"
        if (suffix.length < 2) throw new Error("empty wildcard suffix");
        wildcardSuffixes.push(suffix);
      } else if (entry.includes("/")) {
        const [addr, prefixRaw] = entry.split("/");
        const family = isIP(addr);
        if (family === 0) throw new Error("CIDR base is not an IP");
        const prefix = Number(prefixRaw);
        if (!Number.isInteger(prefix)) throw new Error("bad prefix");
        cidrs.addSubnet(addr, prefix, family === 4 ? "ipv4" : "ipv6");
      } else if (isIP(entry) !== 0) {
        cidrs.addAddress(entry, isIP(entry) === 4 ? "ipv4" : "ipv6");
      } else {
        exactHosts.add(entry);
      }
    } catch (e) {
      // A typo must not silently open (or close) the guard — log and skip.
      console.error(
        `AIGP_EGRESS_ALLOWLIST: ignoring invalid entry ${JSON.stringify(rawEntry.trim())}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return { cidrs, exactHosts, wildcardSuffixes };
}

let cachedAllowlist: EgressAllowlist | null = null;
let cachedRaw: string | undefined;

function getAllowlist(): EgressAllowlist {
  const raw = process.env.AIGP_EGRESS_ALLOWLIST;
  if (!cachedAllowlist || raw !== cachedRaw) {
    cachedAllowlist = parseAllowlist(raw);
    cachedRaw = raw;
  }
  return cachedAllowlist;
}

function normalizeIp(raw: string): { ip: string; family: 4 | 6 } | null {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  // IPv4-mapped IPv6, dotted form: ::ffff:10.0.0.1
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (dotted) ip = dotted[1];
  // IPv4-mapped IPv6, hex form: ::ffff:a00:1 (WHATWG URL serializes to this)
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    ip = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  const family = isIP(ip);
  if (family === 0) return null;
  return { ip, family: family as 4 | 6 };
}

export function isBlockedIp(rawIp: string): boolean {
  const normalized = normalizeIp(rawIp);
  if (!normalized) return true; // unparseable -> fail safe
  const { ip, family } = normalized;
  const type = family === 4 ? "ipv4" : "ipv6";
  const allow = getAllowlist();
  if (allow.cidrs.check(ip, type)) return false;
  return BLOCKED.check(ip, type);
}

function isHostAllowlisted(host: string): boolean {
  const allow = getAllowlist();
  if (allow.exactHosts.has(host)) return true;
  return allow.wildcardSuffixes.some((s) => host.endsWith(s));
}

export function assertSafeUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // Deliberately do not echo the raw URL — it may embed credentials.
    throw new EgressBlockedError("destination is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new EgressBlockedError(
      `scheme ${url.protocol.replace(/:$/, "")} not allowed (http/https only)`,
    );
  if (url.username || url.password)
    throw new EgressBlockedError(
      "URLs with embedded credentials (userinfo) are not allowed",
    );
  const host = url.hostname.toLowerCase();
  if (normalizeIp(host) && !isHostAllowlisted(host) && isBlockedIp(host))
    throw new EgressBlockedError(
      `destination IP ${host} is in a blocked range`,
    );
  return url;
}

export async function assertSafeHost(rawHost: string): Promise<void> {
  const host = rawHost.trim().toLowerCase();
  if (!host) throw new EgressBlockedError("empty host");
  if (isHostAllowlisted(host)) return;
  if (normalizeIp(host)) {
    if (isBlockedIp(host))
      throw new EgressBlockedError(
        `destination IP ${host} is in a blocked range`,
      );
    return;
  }
  const records = await dns.lookup(host, { all: true, verbatim: true });
  for (const rec of records) {
    if (isBlockedIp(rec.address))
      throw new EgressBlockedError(
        `${host} resolves to ${rec.address}, which is in a blocked range`,
      );
  }
}

export async function assertSafeDestination(rawUrl: string): Promise<URL> {
  const url = assertSafeUrl(rawUrl);
  await assertSafeHost(url.hostname);
  return url;
}

export async function safeFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const parsed = await assertSafeDestination(url);
  const res = await fetch(url, { ...init, redirect: "manual" });
  if (res.status >= 300 && res.status < 400)
    throw new EgressBlockedError(
      `redirect (${res.status}) from ${parsed.hostname} not followed`,
    );
  return res;
}
