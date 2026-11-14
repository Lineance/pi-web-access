import { describe, expect, it } from "vitest";

import { readCustomProviders } from "../../src/config/custom.js";
import { buildCatalog } from "../../src/providers/catalog.js";
import { formatStatus } from "../../src/status/format.js";
import { describeStatus, type ReportInput } from "../../src/status/report.js";

function lines(overrides: Partial<ReportInput> = {}, options: { all?: boolean } = {}): string[] {
  const snapshot = describeStatus({
    config: {},
    catalog: buildCatalog(readCustomProviders(undefined).additions),
    env: {},
    configPath: "/tmp/config.json",
    configState: "valid",
    unknownKeys: [],
    issues: [],
    ...overrides,
  });
  return formatStatus(snapshot, options);
}

/** The row for one provider: mark, padded name, then the rest. */
const lineFor = (output: string[], name: string): string =>
  output.find(
    (line) =>
      line.startsWith("  ") && !line.startsWith("   ") && line.trimStart().split(/\s+/)[1] === name,
  ) ?? "";

const configLine = (output: string[]): string =>
  output.find((line) => line.startsWith("config   ")) ?? "";

describe("formatStatus", () => {
  it("heads each section with its chain", () => {
    const output = lines({ config: { providers: ["tavily", "exa-free"] } });

    expect(output[0]).toBe("search  tavily → exa-free");
    expect(output).toContain("fetch  local");
  });

  it("marks a usable provider with a tick and an unusable one with a dot", () => {
    const output = lines({ config: { providers: ["tavily", "exa-free"] } });

    expect(lineFor(output, "tavily").startsWith("  ·")).toBe(true);
    expect(lineFor(output, "exa-free").startsWith("  ✓")).toBe(true);
  });

  it("shows the environment variable name, never a value", () => {
    const output = lines({
      config: { providers: ["tavily"] },
      env: { TAVILY_API_KEY: "sk-live-DEADBEEF" },
    });

    expect(lineFor(output, "tavily")).toContain("env TAVILY_API_KEY");
    expect(output.join("\n")).not.toContain("DEADBEEF");
  });

  it("does not leak a key taken from the config file", () => {
    const output = lines({ config: { apiKeys: { exa: "sk-live-CONFIGSECRET" } } }, { all: true });

    expect(lineFor(output, "exa")).toContain("config file");
    expect(output.join("\n")).not.toContain("CONFIGSECRET");
  });

  it("shows the tier, the cap and the chain membership", () => {
    const output = lines({ config: { providers: ["tavily"] } }, { all: true });

    const tavily = lineFor(output, "tavily");
    expect(tavily).toContain("t1");
    expect(tavily).toContain("max 20");
    expect(tavily).not.toContain("not in chain");

    expect(lineFor(output, "exa")).toContain("not in chain");
    expect(lineFor(output, "exa-free")).toContain("t2");
  });

  it("marks a custom provider and an env-only miss", () => {
    const output = lines({
      config: { providers: ["mine"] },
      catalog: buildCatalog(
        readCustomProviders({
          search: {
            mine: {
              url: "https://e.com/s",
              resultsPath: "data",
              auth: { header: "x-api-key" },
              keyEnv: "MINE_KEY",
            },
          },
        }).additions,
      ),
    });

    const mine = lineFor(output, "mine");
    expect(mine).toContain("missing MINE_KEY (env only)");
    expect(mine).toContain("custom");
  });

  it("prints the config path and state", () => {
    const config = configLine(lines());
    expect(config).toContain("/tmp/config.json");
    expect(config).toContain("valid");
  });

  it("explains an invalid config and unknown keys", () => {
    const output = lines({
      configState: "invalid",
      configError: "invalid JSON",
      unknownKeys: ["provider"],
    });

    expect(output.join("\n")).toContain("invalid JSON; using defaults");
    expect(output.join("\n")).toContain('unknown key "provider" ignored');
  });

  it("reports maxResults and the proxy", () => {
    const output = lines({ config: { maxResults: 4, proxy: "http://p:1" } });

    expect(output.join("\n")).toContain("maxResults 4 · proxy http://p:1");
    expect(lines().join("\n")).toContain("proxy none");
  });

  it("lists chain problems and rejected providers", () => {
    const output = lines({
      config: { providers: ["typo"] },
      issues: [{ side: "fetch", name: "bad", message: "does not match the schema" }],
    });

    expect(output.join("\n")).toContain('chain    search: unknown search provider "typo"');
    expect(output.join("\n")).toContain('rejected custom fetch "bad": does not match the schema');
  });

  it("lists only chain members by default and summarises the rest", () => {
    const output = lines();

    expect(output.join("\n")).not.toContain("tavily");
    expect(output.join("\n")).toContain("+8 not in chain · --all");
  });

  it("lists every provider with --all", () => {
    const output = lines({}, { all: true });

    expect(lineFor(output, "tavily")).not.toBe("");
    expect(output.join("\n")).not.toContain("not in chain · --all");
  });

  it("says so when a section has nothing configured", () => {
    expect(lines({ config: { fetchProviders: [] } }).join("\n")).toContain("fetch  local");
  });
});
