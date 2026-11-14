import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_FETCH_CHAIN,
  DEFAULT_SEARCH_CHAIN,
  getChain,
  resolveApiKey,
  resolveBaseUrl,
  resolveProxy,
  tierLookup,
} from "../../src/config/resolve.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getChain", () => {
  it("falls back to the keyless search default", () => {
    expect(getChain({}, "search")).toEqual([...DEFAULT_SEARCH_CHAIN]);
  });

  it("falls back to the local fetch default", () => {
    expect(getChain({}, "fetch")).toEqual([...DEFAULT_FETCH_CHAIN]);
  });

  it("reads the search chain from providers", () => {
    expect(getChain({ providers: ["tavily", "exa"] }, "search")).toEqual(["tavily", "exa"]);
  });

  it("reads the fetch chain from fetchProviders", () => {
    expect(getChain({ fetchProviders: ["local"] }, "fetch")).toEqual(["local"]);
  });

  it("trims and deduplicates", () => {
    expect(getChain({ providers: [" exa", "exa", "", "  "] }, "search")).toEqual(["exa"]);
  });

  it("treats an explicitly empty chain as unset", () => {
    expect(getChain({ providers: [] }, "search")).toEqual([...DEFAULT_SEARCH_CHAIN]);
  });
});

describe("tierLookup", () => {
  it("uses the registry tier for the keyless fallbacks", () => {
    const tierOf = tierLookup({}, "search");
    expect(tierOf("exa-free")).toBe(2);
    expect(tierOf("bing")).toBe(2);
  });

  it("defaults everything else to tier one", () => {
    const tierOf = tierLookup({}, "search");
    expect(tierOf("tavily")).toBe(1);
    expect(tierOf("unknown-provider")).toBe(1);
  });

  it("lets config override the registry", () => {
    const tierOf = tierLookup({ tiers: { search: { bing: 3, tavily: 2 } } }, "search");
    expect(tierOf("bing")).toBe(3);
    expect(tierOf("tavily")).toBe(2);
  });

  it("keeps the two capabilities independent", () => {
    const config = { tiers: { search: { local: 5 } } };
    expect(tierLookup(config, "search")("local")).toBe(5);
    expect(tierLookup(config, "fetch")("local")).toBe(1);
  });

  it("ignores a non-numeric override", () => {
    const tierOf = tierLookup({ tiers: { search: { bing: Number.NaN } } }, "search");
    expect(tierOf("bing")).toBe(2);
  });
});

describe("resolveApiKey", () => {
  it("prefers the environment over the file", () => {
    vi.stubEnv("TAVILY_API_KEY", "from-env");
    expect(resolveApiKey("search", "tavily", { apiKeys: { tavily: "from-file" } })).toBe(
      "from-env",
    );
  });

  it("falls back to the file", () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    expect(resolveApiKey("search", "tavily", { apiKeys: { tavily: "from-file" } })).toBe(
      "from-file",
    );
  });

  it("returns nothing for a keyless provider", () => {
    expect(resolveApiKey("search", "bing", { apiKeys: { bing: "ignored" } })).toBeUndefined();
  });

  it("returns nothing when unset", () => {
    vi.stubEnv("EXA_API_KEY", "");
    expect(resolveApiKey("search", "exa", {})).toBeUndefined();
  });
});

describe("resolveBaseUrl", () => {
  it("uses the registry default for a self-hosted provider", () => {
    vi.stubEnv("SEARXNG_URL", "");
    expect(resolveBaseUrl("searxng", {})).toBe("http://localhost:8080");
  });

  it("prefers the environment", () => {
    vi.stubEnv("SEARXNG_URL", "http://env:8080");
    expect(resolveBaseUrl("searxng", { baseUrls: { searxng: "http://file:8080" } })).toBe(
      "http://env:8080",
    );
  });

  it("falls back to the file", () => {
    vi.stubEnv("SEARXNG_URL", "");
    expect(resolveBaseUrl("searxng", { baseUrls: { searxng: "http://file:8080" } })).toBe(
      "http://file:8080",
    );
  });

  it("returns nothing for a provider with no base url concept", () => {
    expect(resolveBaseUrl("tavily", {})).toBeUndefined();
  });
});

describe("resolveProxy", () => {
  it("returns undefined when unset or blank", () => {
    expect(resolveProxy({})).toBeUndefined();
    expect(resolveProxy({ proxy: "   " })).toBeUndefined();
  });

  it("trims a configured proxy", () => {
    expect(resolveProxy({ proxy: " http://127.0.0.1:7890 " })).toBe("http://127.0.0.1:7890");
  });
});
