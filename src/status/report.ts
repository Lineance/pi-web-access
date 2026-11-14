import type { CustomProviderIssue } from "../config/custom.js";
import { resolveMaxResults } from "../config/paths.js";
import { getChain, resolveProxy } from "../config/resolve.js";
import type { WebConfig } from "../config/schema.js";
import type { ProviderCatalog } from "../providers/catalog.js";
import { findFetchMeta } from "../providers/fetch/registry.js";
import { findSearchMeta } from "../providers/search/registry.js";
import type { Capability } from "../providers/types.js";

/** Why a provider can or cannot be used. Never carries the credential itself. */
export type KeyState =
  | { state: "keyless" }
  | { state: "env"; variable: string }
  | { state: "config" }
  | { state: "missing"; variable: string }
  | { state: "missing-env-only"; variable: string };

export interface ProviderStatus {
  side: Capability;
  name: string;
  label: string;
  origin: "builtin" | "custom";
  tier: number;
  inChain: boolean;
  key: KeyState;
  /** Search only: the provider's own result cap. */
  maxResults?: number;
}

export interface ChainProblem {
  side: Capability;
  name: string;
  message: string;
}

export interface StatusSnapshot {
  configPath: string;
  configState: "missing" | "valid" | "invalid";
  configError?: string;
  unknownKeys: string[];
  maxResults: number;
  proxy?: string;
  searchChain: string[];
  fetchChain: string[];
  providers: ProviderStatus[];
  chainProblems: ChainProblem[];
  issues: CustomProviderIssue[];
}

export interface ReportInput {
  config: WebConfig;
  catalog: ProviderCatalog;
  /** Injected so a test never has to touch `process.env`. */
  env: Readonly<Record<string, string | undefined>>;
  configPath: string;
  configState: StatusSnapshot["configState"];
  configError?: string;
  unknownKeys: readonly string[];
  issues: readonly CustomProviderIssue[];
}

/**
 * Describe what the extension would do right now.
 *
 * Pure: everything it needs is passed in, so the whole report is testable without a
 * filesystem, an environment or a network.
 */
export function describeStatus(input: ReportInput): StatusSnapshot {
  const { config, catalog } = input;
  const searchChain = getChain(config, "search");
  const fetchChain = getChain(config, "fetch");
  const chainProblems: ChainProblem[] = [];

  const search = searchRows(searchChain, catalog, config, input.env, chainProblems);
  const fetch = fetchRows(fetchChain, catalog, config, input.env, chainProblems);
  const proxy = resolveProxy(config);

  return {
    configPath: input.configPath,
    configState: input.configState,
    ...(input.configError === undefined ? {} : { configError: input.configError }),
    unknownKeys: [...input.unknownKeys],
    maxResults: resolveMaxResults(config),
    ...(proxy === undefined ? {} : { proxy }),
    searchChain,
    fetchChain,
    providers: [...search, ...fetch],
    chainProblems,
    issues: [...input.issues],
  };
}

function searchRows(
  chain: readonly string[],
  catalog: ProviderCatalog,
  config: WebConfig,
  env: Readonly<Record<string, string | undefined>>,
  problems: ChainProblem[],
): ProviderStatus[] {
  const rows: ProviderStatus[] = [];
  for (const name of orderedNames(chain, catalog.searchNames())) {
    const meta = catalog.searchMeta(name);
    if (meta === undefined) {
      problems.push({ side: "search", name, message: `unknown search provider "${name}"` });
      continue;
    }
    rows.push({
      side: "search",
      name,
      label: meta.label,
      origin: findSearchMeta(name) === undefined ? "custom" : "builtin",
      tier: meta.tier,
      inChain: chain.includes(name),
      key: keyState(name, meta, config, env),
      ...(meta.maxResults === undefined ? {} : { maxResults: meta.maxResults }),
    });
  }
  return rows;
}

function fetchRows(
  chain: readonly string[],
  catalog: ProviderCatalog,
  config: WebConfig,
  env: Readonly<Record<string, string | undefined>>,
  problems: ChainProblem[],
): ProviderStatus[] {
  const rows: ProviderStatus[] = [];
  for (const name of orderedNames(chain, catalog.fetchNames())) {
    const meta = catalog.fetchMeta(name);
    if (meta === undefined) {
      problems.push({ side: "fetch", name, message: `unknown fetch provider "${name}"` });
      continue;
    }
    rows.push({
      side: "fetch",
      name,
      label: meta.label,
      origin: findFetchMeta(name) === undefined ? "custom" : "builtin",
      tier: meta.tier,
      inChain: chain.includes(name),
      key: keyState(name, meta, config, env),
    });
  }
  return rows;
}

/** Chain order first, then everything else the catalog knows, deduplicated. */
function orderedNames(chain: readonly string[], known: readonly string[]): string[] {
  return [...new Set([...chain, ...known])];
}

function keyState(
  name: string,
  meta: { envVar?: string; envOnly?: boolean },
  config: WebConfig,
  env: Readonly<Record<string, string | undefined>>,
): KeyState {
  if (meta.envVar === undefined) return { state: "keyless" };

  const value = env[meta.envVar]?.trim();
  if (value !== undefined && value !== "") return { state: "env", variable: meta.envVar };

  // A custom provider reads the environment only; a file entry would be ignored, so
  // reporting "missing" rather than falling through to the config is the honest answer.
  if (meta.envOnly === true) return { state: "missing-env-only", variable: meta.envVar };

  const fromConfig = config.apiKeys?.[name]?.trim();
  if (fromConfig !== undefined && fromConfig !== "") return { state: "config" };

  return { state: "missing", variable: meta.envVar };
}
