import { describe, expect, it } from "vitest";

import { readCustomProviders } from "../../src/config/custom.js";
import type { WebConfig } from "../../src/config/schema.js";
import { buildCatalog, type ProviderCatalog } from "../../src/providers/catalog.js";
import { describeStatus, type ReportInput } from "../../src/status/report.js";

const catalogWith = (custom?: unknown): ProviderCatalog =>
  buildCatalog(readCustomProviders(custom).additions);

function report(overrides: Partial<ReportInput> = {}) {
  return describeStatus({
    config: {},
    catalog: catalogWith(),
    env: {},
    configPath: "/tmp/config.json",
    configState: "valid",
    unknownKeys: [],
    issues: [],
    ...overrides,
  });
}

const row = (snapshot: ReturnType<typeof report>, name: string) =>
  snapshot.providers.find((provider) => provider.name === name);

describe("describeStatus", () => {
  it("reports the default chains", () => {
    const snapshot = report();

    expect(snapshot.searchChain).toEqual(["exa-free"]);
    expect(snapshot.fetchChain).toEqual(["local"]);
  });

  it("puts chain members first, in chain order", () => {
    const snapshot = report({ config: { searchProviders: ["bing", "tavily"] } });
    const searchNames = snapshot.providers
      .filter((provider) => provider.side === "search")
      .map((provider) => provider.name);

    expect(searchNames.slice(0, 2)).toEqual(["bing", "tavily"]);
    expect(searchNames).toContain("exa-free");
    expect(row(snapshot, "tavily")?.inChain).toBe(true);
    expect(row(snapshot, "exa")?.inChain).toBe(false);
  });

  it("marks a keyless provider as usable", () => {
    expect(row(report(), "exa-free")?.key).toEqual({ state: "keyless" });
    expect(row(report(), "local")?.key).toEqual({ state: "keyless" });
  });

  it("reports a key supplied through the environment", () => {
    const snapshot = report({
      config: { searchProviders: ["tavily"] },
      env: { TAVILY_API_KEY: "x" },
    });

    expect(row(snapshot, "tavily")?.key).toEqual({ state: "env", variable: "TAVILY_API_KEY" });
  });

  it("reports a key supplied through the config file", () => {
    const snapshot = report({ config: { apiKeys: { exa: "x" } } });

    expect(row(snapshot, "exa")?.key).toEqual({ state: "config" });
  });

  it("ignores a blank value in either source", () => {
    const snapshot = report({ config: { apiKeys: { exa: "   " } }, env: { TAVILY_API_KEY: " " } });

    expect(row(snapshot, "exa")?.key).toEqual({ state: "missing", variable: "EXA_API_KEY" });
    expect(row(snapshot, "tavily")?.key).toEqual({
      state: "missing",
      variable: "TAVILY_API_KEY",
    });
  });

  it("never reports a file key for a custom provider", () => {
    const snapshot = report({
      config: { searchProviders: ["mine"], apiKeys: { mine: "from-file" } },
      catalog: catalogWith({
        search: {
          mine: {
            url: "https://e.com/s",
            resultsPath: "data",
            auth: { header: "authorization", prefix: "Bearer " },
            keyEnv: "MINE_KEY",
          },
        },
      }),
    });

    // envOnly: the config file entry is ignored, so the honest answer is "missing".
    expect(row(snapshot, "mine")?.key).toEqual({
      state: "missing-env-only",
      variable: "MINE_KEY",
    });
  });

  it("reports an environment key for a custom provider", () => {
    const snapshot = report({
      config: { searchProviders: ["mine"] },
      catalog: catalogWith({
        search: {
          mine: {
            url: "https://e.com/s",
            resultsPath: "data",
            auth: { header: "x-api-key" },
            keyEnv: "MINE_KEY",
          },
        },
      }),
      env: { MINE_KEY: "x" },
    });

    expect(row(snapshot, "mine")?.key).toEqual({ state: "env", variable: "MINE_KEY" });
  });

  it("distinguishes built-in from custom providers", () => {
    const snapshot = report({
      catalog: catalogWith({ fetch: { reader: { url: "https://r/{url}" } } }),
    });

    expect(row(snapshot, "tavily")?.origin).toBe("builtin");
    expect(row(snapshot, "reader")?.origin).toBe("custom");
  });

  it("carries the per-provider result cap on search rows only", () => {
    const snapshot = report();

    expect(row(snapshot, "exa")?.maxResults).toBe(10);
    expect(row(snapshot, "brave")?.maxResults).toBe(20);
    expect(row(snapshot, "local")?.maxResults).toBeUndefined();
  });

  it("reports a chain entry that no catalog knows", () => {
    const snapshot = report({ config: { searchProviders: ["typo", "exa-free"] } });

    expect(snapshot.chainProblems).toEqual([
      { side: "search", name: "typo", message: 'unknown search provider "typo"' },
    ]);
    expect(row(snapshot, "typo")).toBeUndefined();
  });

  it("reports a search provider used on the fetch side", () => {
    const snapshot = report({ config: { fetchProviders: ["bing"] } });

    expect(snapshot.chainProblems).toEqual([
      { side: "fetch", name: "bing", message: 'unknown fetch provider "bing"' },
    ]);
  });

  it("passes through config state, error, unknown keys and issues", () => {
    const snapshot = report({
      configState: "invalid",
      configError: "invalid JSON",
      unknownKeys: ["provider"],
      issues: [{ side: "search", name: "bad", message: "nope" }],
    });

    expect(snapshot.configState).toBe("invalid");
    expect(snapshot.configError).toBe("invalid JSON");
    expect(snapshot.unknownKeys).toEqual(["provider"]);
    expect(snapshot.issues).toHaveLength(1);
  });

  it("reports maxResults and the proxy only when set", () => {
    expect(report().maxResults).toBe(10);
    expect(report().proxy).toBeUndefined();
    expect(report({ config: { maxResults: 3, proxy: "http://p:1" } }).maxResults).toBe(3);
    expect(report({ config: { proxy: "http://p:1" } }).proxy).toBe("http://p:1");
  });

  it("treats an empty configured chain as unset", () => {
    const config: WebConfig = { searchProviders: [] };

    expect(report({ config }).searchChain).toEqual(["exa-free"]);
  });
});
