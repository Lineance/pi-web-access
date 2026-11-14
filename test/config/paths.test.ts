import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  agentDir,
  configPath,
  packageConfigRoot,
  readConfig,
  resolveMaxResults,
} from "../../src/config/paths.js";
import {
  MAX_RESULTS_CEILING,
  MAX_RESULTS_DEFAULT,
  clampMaxResults,
  unknownConfigKeys,
} from "../../src/config/schema.js";

const tempRoot = (): string => mkdtempSync(join(tmpdir(), "pwa-cfg-"));

function writeConfig(root: string, contents: unknown): void {
  const dir = join(root, "pi-web-access");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), contents as string, "utf8");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("config location", () => {
  it("defaults the agent directory to ~/.pi/agent", () => {
    vi.stubEnv("PI_CODING_AGENT_DIR", "");
    expect(agentDir().endsWith(join(".pi", "agent"))).toBe(true);
  });

  it("honours PI_CODING_AGENT_DIR", () => {
    vi.stubEnv("PI_CODING_AGENT_DIR", "C:/custom/agent");
    expect(agentDir()).toBe("C:/custom/agent");
  });

  it("puts the package config under pi-pkg-cfg by default", () => {
    vi.stubEnv("PI_CODING_AGENT_DIR", "C:/custom/agent");
    vi.stubEnv("PI_PKG_CFG_DIR", "");
    expect(packageConfigRoot()).toBe(join("C:/custom/agent", "pi-pkg-cfg"));
  });

  it("honours PI_PKG_CFG_DIR", () => {
    vi.stubEnv("PI_PKG_CFG_DIR", "C:/pkg-cfg");
    expect(packageConfigRoot()).toBe("C:/pkg-cfg");
  });

  it("keeps its own directory so it never reads another extension", () => {
    vi.stubEnv("PI_PKG_CFG_DIR", "C:/pkg-cfg");
    expect(configPath()).toBe(join("C:/pkg-cfg", "pi-web-access", "config.json"));
  });
});

describe("readConfig", () => {
  it("reports a missing file without throwing", () => {
    const root = tempRoot();
    vi.stubEnv("PI_PKG_CFG_DIR", root);

    const read = readConfig();

    expect(read.status).toBe("missing");
    expect(read.config).toEqual({});
    expect(read.unknownKeys).toEqual([]);
  });

  it("parses a valid file", () => {
    const root = tempRoot();
    vi.stubEnv("PI_PKG_CFG_DIR", root);
    writeConfig(root, JSON.stringify({ maxResults: 4, providers: ["tavily"] }));

    const read = readConfig();

    expect(read.status).toBe("valid");
    expect(read.config.maxResults).toBe(4);
    expect(read.config.providers).toEqual(["tavily"]);
  });

  it("degrades to defaults on malformed JSON", () => {
    const root = tempRoot();
    vi.stubEnv("PI_PKG_CFG_DIR", root);
    writeConfig(root, "{ not json");

    const read = readConfig();

    expect(read.status).toBe("invalid");
    expect(read.config).toEqual({});
    expect(read.error).toBe("invalid JSON");
  });

  it("degrades to defaults when the shape is wrong", () => {
    const root = tempRoot();
    vi.stubEnv("PI_PKG_CFG_DIR", root);
    writeConfig(root, JSON.stringify({ providers: "tavily" }));

    const read = readConfig();

    expect(read.status).toBe("invalid");
    expect(read.config).toEqual({});
  });

  it("reports unknown keys so a typo is not silent", () => {
    const root = tempRoot();
    vi.stubEnv("PI_PKG_CFG_DIR", root);
    writeConfig(root, JSON.stringify({ provider: ["tavily"], maxResults: 3 }));

    const read = readConfig();

    expect(read.status).toBe("valid");
    expect(read.unknownKeys).toEqual(["provider"]);
  });
});

describe("clampMaxResults", () => {
  it("uses the default when unset", () => {
    expect(clampMaxResults(undefined)).toBe(MAX_RESULTS_DEFAULT);
  });

  it("uses the default for a non-number", () => {
    expect(clampMaxResults("ten")).toBe(MAX_RESULTS_DEFAULT);
    expect(clampMaxResults(Number.NaN)).toBe(MAX_RESULTS_DEFAULT);
  });

  it("floors a fractional value", () => {
    expect(clampMaxResults(7.9)).toBe(7);
  });

  it("refuses a value below one", () => {
    expect(clampMaxResults(0)).toBe(1);
    expect(clampMaxResults(-5)).toBe(1);
  });

  it("caps at the absolute ceiling", () => {
    expect(clampMaxResults(1000)).toBe(MAX_RESULTS_CEILING);
  });

  it("reads from the config", () => {
    expect(resolveMaxResults({ maxResults: 3 })).toBe(3);
    expect(resolveMaxResults({})).toBe(MAX_RESULTS_DEFAULT);
  });
});

describe("unknownConfigKeys", () => {
  it("returns nothing for a non-object", () => {
    expect(unknownConfigKeys(null)).toEqual([]);
    expect(unknownConfigKeys("x")).toEqual([]);
  });

  it("lists every key the schema does not know", () => {
    expect(unknownConfigKeys({ maxResults: 1, nope: true, alsoNope: 2 })).toEqual([
      "nope",
      "alsoNope",
    ]);
  });
});
