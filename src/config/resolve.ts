import type { Capability } from "../providers/types.js";
import { BUILTIN_CATALOG, type ProviderCatalog } from "../providers/catalog.js";

import type { WebConfig } from "./schema.js";

/** Used when a capability has no configured chain at all. */
export const DEFAULT_SEARCH_CHAIN: readonly string[] = ["exa-free"];
export const DEFAULT_FETCH_CHAIN: readonly string[] = ["local"];

/**
 * The configured chain for a capability, deduplicated, with the built-in fallback
 * when nothing is configured.
 */
export function getChain(config: WebConfig, capability: Capability): string[] {
  const configured =
    (capability === "search" ? config.searchProviders : config.fetchProviders) ?? [];
  const cleaned = dedupe(configured);
  if (cleaned.length > 0) return cleaned;
  return [...(capability === "search" ? DEFAULT_SEARCH_CHAIN : DEFAULT_FETCH_CHAIN)];
}

/**
 * Tier lookup for a capability.
 *
 * Config overrides the provider's own default; anything unknown is tier 1. Tiers
 * only constrain how far a cooled provider is demoted, never the order of healthy
 * ones, and they need not be contiguous.
 */
export function tierLookup(
  config: WebConfig,
  capability: Capability,
  catalog: ProviderCatalog = BUILTIN_CATALOG,
): (name: string) => number {
  const overrides = (capability === "search" ? config.tiers?.search : config.tiers?.fetch) ?? {};
  return (name: string): number => {
    const override = overrides[name];
    if (typeof override === "number" && Number.isFinite(override)) return override;
    const meta = capability === "search" ? catalog.searchMeta(name) : catalog.fetchMeta(name);
    return meta?.tier ?? 1;
  };
}

/**
 * Resolve a provider's credential.
 *
 * A provider that declares no credential never receives one, so a stray entry in
 * the config can never be sent to an endpoint that did not ask for it. A provider
 * marked `envOnly` reads the environment and nothing else.
 */
export function resolveApiKey(
  capability: Capability,
  name: string,
  config: WebConfig,
  catalog: ProviderCatalog = BUILTIN_CATALOG,
): string | undefined {
  const meta = capability === "search" ? catalog.searchMeta(name) : catalog.fetchMeta(name);
  if (meta === undefined || meta.envVar === undefined) return undefined;

  const fromEnv = process.env[meta.envVar]?.trim();
  if (meta.envOnly === true) return fromEnv === undefined || fromEnv === "" ? undefined : fromEnv;
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  return config.apiKeys?.[name]?.trim() || undefined;
}

/** Environment variable, then config, then the provider's own default. */
export function resolveBaseUrl(
  name: string,
  config: WebConfig,
  catalog: ProviderCatalog = BUILTIN_CATALOG,
): string | undefined {
  const meta = catalog.searchMeta(name);
  const envVar = meta?.baseUrlEnvVar;
  const fromEnv = envVar ? process.env[envVar]?.trim() : undefined;
  if (fromEnv) return fromEnv;
  return config.baseUrls?.[name]?.trim() || meta?.defaultBaseUrl;
}

export function resolveProxy(config: WebConfig): string | undefined {
  return config.proxy?.trim() || undefined;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}
