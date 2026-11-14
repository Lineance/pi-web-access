import { describe, expect, it } from "vitest";

import { compileSearchProvider } from "../../../../src/providers/search/custom/compile.js";

const base = {
  url: "https://api.example.com/search",
  resultsPath: "data.items",
};

describe("compileSearchProvider", () => {
  it("compiles a POST provider with a substituted body", () => {
    const result = compileSearchProvider("my-engine", {
      ...base,
      method: "POST",
      body: { q: "{query}", limit: "{maxResults}" },
      fields: { title: "name", url: "link", snippet: "summary" },
      auth: { header: "authorization", prefix: "Bearer " },
      keyEnv: "MY_KEY",
      tier: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.meta).toEqual({
      name: "my-engine",
      label: "my-engine",
      keyless: false,
      envVar: "MY_KEY",
      envOnly: true,
      tier: 3,
    });
    expect(result.spec.body?.("cats", 4)).toEqual({ q: "cats", limit: 4 });
    expect(result.spec.resultsPath).toBe("data.items");
    expect(result.spec.authHeaderName).toBe("authorization");
    expect(result.spec.authPrefix).toBe("Bearer ");
  });

  it("defaults to tier one and reports the provider as keyless without auth", () => {
    const result = compileSearchProvider("bare", base);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.tier).toBe(1);
    expect(result.meta.keyless).toBe(true);
    expect(result.meta.envOnly).toBeUndefined();
    expect(result.spec.method).toBe("GET");
  });

  it("compiles a GET provider with query parameters", () => {
    const result = compileSearchProvider("getter", {
      ...base,
      query: { q: "{query}", count: "{maxResults}" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.method).toBe("GET");
    expect(result.spec.queryParams?.("cats", 2)).toEqual({ q: "cats", count: "2" });
  });

  it("refuses to shadow a built-in provider", () => {
    const result = compileSearchProvider("tavily", base);

    expect(result).toEqual({
      ok: false,
      message: 'shadows the built-in search provider "tavily"',
    });
  });

  it("refuses an invalid name", () => {
    expect(compileSearchProvider("bad name", base)).toEqual({
      ok: false,
      message: "name must be alphanumeric, dot, dash or underscore",
    });
  });

  it("requires resultsPath", () => {
    const result = compileSearchProvider("x", { url: "https://e.com" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("does not match the schema");
    expect(result.message).toContain("resultsPath");
  });

  it.each([
    [{ body: {}, query: {} }, "declares both body and query"],
    [{ body: {}, method: "GET" }, "body requires method POST"],
    [{ query: {}, method: "POST" }, "query requires method GET"],
    [{ method: "POST" }, "a POST search requires body"],
    [{ auth: { header: "x" } }, "auth requires keyEnv"],
  ])("rejects an inconsistent declaration (%#)", (extra, expected) => {
    const result = compileSearchProvider("x", { ...base, ...extra });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain(expected);
  });

  it("refuses an unknown field so a typo cannot pass silently", () => {
    const result = compileSearchProvider("x", { ...base, fieldz: {} });

    expect(result.ok).toBe(false);
  });

  it("refuses a tier below one", () => {
    expect(compileSearchProvider("x", { ...base, tier: 0 }).ok).toBe(false);
  });

  it("accepts any positive tier, contiguous or not", () => {
    for (const tier of [1, 2, 7, 42]) {
      const result = compileSearchProvider("x", { ...base, tier });
      expect(result.ok, `tier ${tier}`).toBe(true);
    }
  });
});
