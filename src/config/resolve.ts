import type { Capability } from "../providers/types.js";
import { findProviderMeta } from "../providers/registry.js";

import type { WebConfig } from "./schema.js";

/** Used when a capability has no configured chain at all. */
export const DEFAULT_SEARCH_CHAIN: readonly string[] = ["exa-free"];
export const DEFAULT_FETCH_CHAIN: readonly string[] = ["local"];

/**
 * The configured chain for a capability, deduplicated, with the built-in
 * fallback when nothing is configured.
 */
export function getChain(config: WebConfig, capability: Capability): string[] {
  const configured = (capability === "search" ? config.providers : config.fetchProviders) ?? [];
  const cleaned = dedupe(configured);
  if (cleaned.length > 0) return cleaned;
  return [...(capability === "search" ? DEFAULT_SEARCH_CHAIN : DEFAULT_FETCH_CHAIN)];
}

/**
 * Tier lookup for a capability.
 *
 * Config overrides registry defaults; anything unset is tier 1. Tiers only
 * constrain how far a cooled provider is demoted, never the order of healthy
 * ones.
 */
export function tierLookup(config: WebConfig, capability: Capability): (name: string) => number {
  const overrides = (capability === "search" ? config.tiers?.search : config.tiers?.fetch) ?? {};
  return (name: string): number => {
    const override = overrides[name];
    if (typeof override === "number" && Number.isFinite(override)) return override;
    const meta = findProviderMeta(name);
    const fromMeta = capability === "search" ? meta?.tiers.search : meta?.tiers.fetch;
    return typeof fromMeta === "number" ? fromMeta : 1;
  };
}

/** Environment variable wins over the config file. */
export function resolveApiKey(name: string, config: WebConfig): string | undefined {
  const meta = findProviderMeta(name);
  const envVar = meta?.envVar;
  const fromEnv = envVar ? process.env[envVar]?.trim() : undefined;
  if (fromEnv) return fromEnv;
  return config.apiKeys?.[name]?.trim() || undefined;
}

/** Environment variable, then config, then the registry default. */
export function resolveBaseUrl(name: string, config: WebConfig): string | undefined {
  const meta = findProviderMeta(name);
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
