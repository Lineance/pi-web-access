import { lookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";

import { Agent } from "undici";

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

/** Manual redirect handling: every hop is re-validated before it is followed. */
export const MAX_REDIRECTS = 5;

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

const NON_PUBLIC = new BlockList();
const GLOBALLY_REACHABLE = new BlockList();

// Allow-listed first: the block list below is wider than the real private space.
GLOBALLY_REACHABLE.addAddress("192.0.0.9", "ipv4");
GLOBALLY_REACHABLE.addAddress("192.0.0.10", "ipv4");
for (const [network, prefix] of [
  ["2001:1::1", 128],
  ["2001:1::2", 128],
  ["2001:1::3", 128],
  ["2001:3::", 32],
  ["2001:4:112::", 48],
  ["2001:20::", 28],
  ["2001:30::", 28],
] as const) {
  GLOBALLY_REACHABLE.addSubnet(network, prefix, "ipv6");
}

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.2", 32],
  ["192.168.0.0", 16],
  // 198.18.0.0/15 (RFC 2544) is intentionally NOT blocked: Clash and mihomo answer
  // every TUN-mode lookup from that range and route the connection transparently,
  // so it is a legitimate destination for a large share of users.
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["100:0:0:1::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv6");
}

/**
 * True for addresses that must never be reached by a user-supplied URL.
 *
 * Conservative on purpose: IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is refused without
 * unwrapping, because a mapped public address reaching a v6-only path is far more
 * surprising than a refused fetch.
 */
export function isNonPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;

  if (family === 6) {
    if (isIpv4MappedIpv6(address)) return true;
    if (GLOBALLY_REACHABLE.check(address, "ipv6")) return false;
    const embedded = nat64EmbeddedIpv4(address);
    if (embedded !== undefined) return isNonPublicIpAddress(embedded);
    return NON_PUBLIC.check(address, "ipv6");
  }

  if (GLOBALLY_REACHABLE.check(address, "ipv4")) return false;
  return NON_PUBLIC.check(address, "ipv4");
}

export function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  return isIP(normalized) !== 0 && isNonPublicIpAddress(normalized);
}

/**
 * Validate a URL before anything contacts the network.
 *
 * Literal addresses are rejected here; names are re-checked after resolution in
 * `assertPublicResolution`, so a hostile DNS answer cannot slip past.
 */
export function parseAndAssertFetchUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}. Only http and https are supported.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("Refusing to fetch a URL with embedded credentials.");
  }
  if (isPrivateOrLoopbackHostname(parsed.hostname)) {
    throw new Error(`Refusing to fetch private/loopback address: ${parsed.hostname}`);
  }
  return parsed;
}

export async function resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

/** Resolve a name and refuse it if any answer is a non-public address. */
export async function assertPublicResolution(
  hostname: string,
  resolver: HostResolver,
): Promise<ResolvedAddress[]> {
  const normalized = normalizeHostname(hostname);
  const family = isIP(normalized);
  const addresses = family === 0 ? await resolver(normalized) : [{ address: normalized, family }];
  if (addresses.length === 0) throw new Error(`Could not resolve URL host: ${normalized}`);

  for (const { address } of addresses) {
    if (isNonPublicIpAddress(address)) {
      throw new Error(
        `Refusing to fetch hostname ${normalized} resolved to private/loopback address: ${address}`,
      );
    }
  }
  return addresses;
}

/**
 * Agent whose DNS lookup refuses non-public answers.
 *
 * Doing the check inside `lookup` closes the gap between "we validated the name"
 * and "the socket connected", which a separate pre-flight lookup leaves open.
 */
export function createSsrfSafeDirectAgent(resolver: HostResolver = resolveHostname): Agent {
  const safeLookup: LookupFunction = (hostname, options, callback) => {
    void assertPublicResolution(hostname, resolver).then(
      (addresses) => {
        if (options.all) {
          callback(null, addresses);
          return;
        }
        const selected = addresses[0];
        if (!selected) {
          callback(new Error(`Could not resolve URL host: ${hostname}`), "", 0);
          return;
        }
        callback(null, selected.address, selected.family);
      },
      (error: unknown) =>
        callback(error instanceof Error ? error : new Error(String(error)), "", 0),
    );
  };
  return new Agent({ connect: { lookup: safeLookup } });
}

export function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
}

/** Expand the eight 16-bit words of an IPv6 address, including `::` and dotted tails. */
function parseIpv6Words(address: string): number[] {
  const [left = "", right = ""] = address.toLowerCase().split("::");
  const parseSide = (side: string): number[] => {
    if (!side) return [];
    const segments = side.split(":");
    const last = segments.at(-1);
    if (last !== undefined && last.includes(".")) {
      segments.pop();
      const bytes = last.split(".").map(Number);
      segments.push(((bytes[0] ?? 0) * 256 + (bytes[1] ?? 0)).toString(16));
      segments.push(((bytes[2] ?? 0) * 256 + (bytes[3] ?? 0)).toString(16));
    }
    return segments.map((segment) => Number.parseInt(segment, 16));
  };
  const leading = parseSide(left);
  const trailing = parseSide(right);
  const fill = address.includes("::")
    ? new Array<number>(Math.max(0, 8 - leading.length - trailing.length)).fill(0)
    : [];
  return [...leading, ...fill, ...trailing];
}

/** `64:ff9b::a.b.c.d` carries an IPv4 address in its last two words. */
function nat64EmbeddedIpv4(address: string): string | undefined {
  const words = parseIpv6Words(address);
  const [first, second] = words;
  if (words.length !== 8 || first !== 0x64 || second !== 0xff9b) return undefined;
  if (words.slice(2, 6).some((word) => word !== 0)) return undefined;
  const high = words[6] ?? 0;
  const low = words[7] ?? 0;
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isIpv4MappedIpv6(address: string): boolean {
  const words = parseIpv6Words(address);
  return (
    words.length === 8 && words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff
  );
}
