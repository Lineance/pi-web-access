import { describe, expect, it } from "vitest";

import {
  assertPublicResolution,
  isNonPublicIpAddress,
  normalizeHostname,
  parseAndAssertFetchUrl,
  type HostResolver,
  type ResolvedAddress,
} from "./ssrf.js";

const resolverAnswering =
  (...addresses: string[]): HostResolver =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })) as ResolvedAddress[];

describe("isNonPublicIpAddress", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "127.1.2.3",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.5",
    "192.168.1.1",
    "198.51.100.5",
    "203.0.113.5",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
  ])("refuses the private or reserved IPv4 address %s", (address) => {
    expect(isNonPublicIpAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34"])(
    "accepts the public IPv4 address %s",
    (address) => {
      expect(isNonPublicIpAddress(address)).toBe(false);
    },
  );

  it("accepts 198.18.0.0/15 so Clash and mihomo fake-ip DNS keeps working", () => {
    expect(isNonPublicIpAddress("198.18.0.1")).toBe(false);
    expect(isNonPublicIpAddress("198.19.255.254")).toBe(false);
  });

  it.each(["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "2001:db8::1", "100::1"])(
    "refuses the non-public IPv6 address %s",
    (address) => {
      expect(isNonPublicIpAddress(address)).toBe(true);
    },
  );

  it("accepts a public IPv6 address", () => {
    expect(isNonPublicIpAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("refuses every IPv4-mapped IPv6 address without unwrapping it", () => {
    expect(isNonPublicIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isNonPublicIpAddress("::ffff:8.8.8.8")).toBe(true);
  });

  it("checks the IPv4 address embedded in a NAT-64 prefix", () => {
    expect(isNonPublicIpAddress("64:ff9b::127.0.0.1")).toBe(true);
    expect(isNonPublicIpAddress("64:ff9b::8.8.8.8")).toBe(false);
  });

  it("honours the allow list that carves public addresses out of a blocked block", () => {
    expect(isNonPublicIpAddress("192.0.0.9")).toBe(false);
    expect(isNonPublicIpAddress("192.0.0.10")).toBe(false);
    expect(isNonPublicIpAddress("2001:1::1")).toBe(false);
  });

  it("treats a non-address as unsafe", () => {
    expect(isNonPublicIpAddress("example.com")).toBe(true);
  });
});

describe("normalizeHostname", () => {
  it("lowercases, strips IPv6 brackets and a trailing dot", () => {
    expect(normalizeHostname("[Example.COM.]")).toBe("example.com");
  });
});

describe("parseAndAssertFetchUrl", () => {
  it("accepts a normal https URL", () => {
    expect(parseAndAssertFetchUrl("https://example.com/a?b=1").hostname).toBe("example.com");
  });

  it("rejects a non-http protocol", () => {
    expect(() => parseAndAssertFetchUrl("file:///etc/passwd")).toThrow(/Unsupported URL protocol/);
  });

  it("rejects embedded credentials", () => {
    expect(() => parseAndAssertFetchUrl("https://user:pass@example.com")).toThrow(
      /embedded credentials/,
    );
  });

  it("rejects a literal loopback address", () => {
    expect(() => parseAndAssertFetchUrl("http://127.0.0.1:8080")).toThrow(/private\/loopback/);
  });

  it("rejects localhost by name", () => {
    expect(() => parseAndAssertFetchUrl("http://localhost:3000")).toThrow(/private\/loopback/);
  });

  it("rejects an unparsable URL", () => {
    expect(() => parseAndAssertFetchUrl("not a url")).toThrow(/Invalid URL/);
  });
});

describe("assertPublicResolution", () => {
  it("passes a name that resolves to a public address", async () => {
    const addresses = await assertPublicResolution("example.com", resolverAnswering("93.184.216.34"));

    expect(addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("refuses a name that resolves to a private address", async () => {
    await expect(assertPublicResolution("evil.test", resolverAnswering("10.0.0.5"))).rejects.toThrow(
      /resolved to private\/loopback/,
    );
  });

  it("refuses when any one answer is private", async () => {
    await expect(
      assertPublicResolution("mixed.test", resolverAnswering("93.184.216.34", "127.0.0.1")),
    ).rejects.toThrow(/127\.0\.0\.1/);
  });

  it("refuses when the name does not resolve", async () => {
    await expect(assertPublicResolution("empty.test", resolverAnswering())).rejects.toThrow(
      /Could not resolve/,
    );
  });

  it("skips the resolver for a literal IPv6 address", async () => {
    const failing: HostResolver = async () => {
      throw new Error("resolver must not be called");
    };

    await expect(assertPublicResolution("2606:4700::1111", failing)).resolves.toEqual([
      { address: "2606:4700::1111", family: 6 },
    ]);
  });
});
