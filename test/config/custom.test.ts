import { describe, expect, it } from "vitest";

import { readCustomProviders } from "../../src/config/custom.js";
import { buildCatalog } from "../../src/providers/catalog.js";

const searchEntry = { url: "https://api.example.com/s", resultsPath: "data" };

describe("readCustomProviders", () => {
  it("returns nothing for an absent block", () => {
    const result = readCustomProviders(undefined);

    expect(result.additions.search.size).toBe(0);
    expect(result.additions.fetch.size).toBe(0);
    expect(result.issues).toEqual([]);
  });

  it("compiles both sides", () => {
    const result = readCustomProviders({
      search: { "my-engine": searchEntry },
      fetch: { "my-reader": { url: "https://r.example.com/{url}" } },
    });

    expect(result.issues).toEqual([]);
    expect([...result.additions.search.keys()]).toEqual(["my-engine"]);
    expect([...result.additions.fetch.keys()]).toEqual(["my-reader"]);
  });

  it("reports an unknown section instead of ignoring it", () => {
    const result = readCustomProviders({ seach: {} });

    expect(result.issues).toEqual([
      {
        side: "search",
        name: "customProviders",
        message: 'unknown section "seach"; expected "search" or "fetch"',
      },
    ]);
  });

  it("keeps the good entries when one is broken", () => {
    const result = readCustomProviders({
      search: { bad: { url: "https://e.com" }, good: searchEntry },
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.name).toBe("bad");
    expect([...result.additions.search.keys()]).toEqual(["good"]);
  });

  it("rejects a name declared on both sides", () => {
    const result = readCustomProviders({
      search: { both: searchEntry },
      fetch: { both: { url: "https://r.example.com/{url}" } },
    });

    expect(result.issues).toEqual([
      {
        side: "fetch",
        name: "both",
        message: "declared on both sides; use a distinct name for search and fetch",
      },
    ]);
    expect(result.additions.fetch.has("both")).toBe(false);
    expect(result.additions.search.has("both")).toBe(true);
  });

  it("reports a section that is not an object", () => {
    const result = readCustomProviders({ search: ["nope"] });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.message).toContain("must be an object");
  });
});

describe("buildCatalog", () => {
  it("keeps built-ins when there is nothing custom", () => {
    const catalog = buildCatalog(readCustomProviders(undefined).additions);

    expect(catalog.searchMeta("tavily")?.tier).toBe(1);
    expect(catalog.fetchMeta("local")?.tier).toBe(1);
    expect(catalog.fetchSpec("local")).toBeUndefined();
  });

  it("exposes a custom provider through both meta and spec lookups", () => {
    const catalog = buildCatalog(
      readCustomProviders({ search: { "my-engine": searchEntry } }).additions,
    );

    expect(catalog.searchMeta("my-engine")?.name).toBe("my-engine");
    expect(catalog.searchSpec("my-engine")?.resultsPath).toBe("data");
    expect(catalog.searchNames()).toContain("my-engine");
    expect(catalog.fetchMeta("my-engine")).toBeUndefined();
  });

  it("keeps the two sides apart", () => {
    const catalog = buildCatalog(
      readCustomProviders({ fetch: { "my-reader": { url: "https://r/{url}" } } }).additions,
    );

    expect(catalog.fetchMeta("my-reader")?.name).toBe("my-reader");
    expect(catalog.searchMeta("my-reader")).toBeUndefined();
  });

  it("keeps built-in fetch specs when custom fetch providers exist", () => {
    // Regression: the additions branch used to consult only the custom map, so
    // declaring any custom fetch reader disabled firecrawl, jina and the rest.
    const catalog = buildCatalog(
      readCustomProviders({ fetch: { "my-reader": { url: "https://r/{url}" } } }).additions,
    );

    expect(catalog.fetchSpec("firecrawl")?.textPath).toBe("data.markdown");
    expect(catalog.fetchSpec("jina")).toBeDefined();
    expect(catalog.fetchSpec("zenrows")).toBeDefined();
    expect(catalog.fetchSpec("my-reader")).toBeDefined();
  });
});
