import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  clampMaxResults,
  isWebConfig,
  unknownConfigKeys,
  type WebConfig,
} from "./schema.js";

const PKG_DIRNAME = "laboon-web-search";

export interface ConfigReadResult {
  /** Where the config was looked for. */
  path: string;
  /** `missing` and `invalid` both degrade to `{}`; the built-in defaults apply. */
  status: "missing" | "valid" | "invalid";
  config: WebConfig;
  error?: string;
  unknownKeys: string[];
}

/** `<agent dir>` is `$PI_CODING_AGENT_DIR` or `~/.pi/agent`. */
export function agentDir(): string {
  return process.env["PI_CODING_AGENT_DIR"]?.trim() || join(homedir(), ".pi", "agent");
}

/**
 * `$PI_PKG_CFG_DIR` wins when set, otherwise `<agent dir>/pi-pkg-cfg`.
 *
 * A package-scoped directory keeps several web-search extensions on one machine
 * from reading each other's settings.
 */
export function packageConfigRoot(): string {
  return process.env["PI_PKG_CFG_DIR"]?.trim() || join(agentDir(), "pi-pkg-cfg");
}

export function configPath(): string {
  return join(packageConfigRoot(), PKG_DIRNAME, "config.json");
}

/**
 * Read the config file.
 *
 * A broken file never crashes startup: it degrades to `{}` so the keyless
 * default provider keeps working. Unknown keys are surfaced to the caller for a
 * warning rather than being silently ignored, because a typo such as `provider`
 * instead of `providers` otherwise has no observable effect at all.
 */
export function readConfig(): ConfigReadResult {
  const path = configPath();

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { path, status: "missing", config: {}, unknownKeys: [] };
    }
    return { path, status: "invalid", config: {}, error: describe(error), unknownKeys: [] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { path, status: "invalid", config: {}, error: "invalid JSON", unknownKeys: [] };
  }

  if (!isWebConfig(raw)) {
    return { path, status: "invalid", config: {}, error: "does not match the config schema", unknownKeys: [] };
  }

  return { path, status: "valid", config: raw, unknownKeys: unknownConfigKeys(raw) };
}

/** Convenience wrapper: an invalid file behaves exactly like a missing one. */
export function readConfigValue(): WebConfig {
  return readConfig().config;
}

export function resolveMaxResults(config: WebConfig): number {
  return clampMaxResults(config.maxResults);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
