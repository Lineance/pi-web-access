import { notImplemented } from "../not-implemented.js";

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

/** Manual redirect handling: every hop is re-validated before it is followed. */
export const MAX_REDIRECTS = 5;

/**
 * True for addresses that must never be reached by a user-supplied URL:
 * private, loopback, link-local, CGNAT, multicast, reserved, and the IPv6
 * equivalents including NAT-64 embedded and IPv4-mapped forms.
 *
 * `198.18.0.0/15` is deliberately treated as public: Clash and mihomo answer every
 * TUN-mode lookup from that range and route the connection transparently.
 */
export function isNonPublicIpAddress(address: string): boolean {
  void address;
  return notImplemented("SSRF address classification");
}

export function parseAndAssertFetchUrl(raw: string): URL {
  void raw;
  return notImplemented("URL validation");
}

export async function assertPublicResolution(
  hostname: string,
  resolver: HostResolver,
): Promise<ResolvedAddress[]> {
  void hostname;
  void resolver;
  return notImplemented("DNS-level address validation");
}
