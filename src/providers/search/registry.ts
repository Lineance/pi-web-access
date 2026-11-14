import { SEARCH_PROVIDER_DEFINITIONS, builtinSearchMeta } from "./definitions.js";
import type { SearchProviderMeta } from "./types.js";

/**
 * Providers with their own transport.
 *
 * `exa-free` speaks MCP over SSE and `bing` scrapes HTML, so neither is describable
 * as a JSON API.
 */
const TRANSPORT_PROVIDERS: readonly SearchProviderMeta[] = [
  { name: "exa-free", label: "Exa (free, no key)", keyless: true, tier: 2, maxResults: 10 },
  { name: "bing", label: "Bing", keyless: true, tier: 2, maxResults: 10 },
];

/**
 * Every built-in search provider.
 *
 * `tier` decides demotion boundaries only; it never reorders healthy providers.
 * Keyless fallbacks sit in tier 2 so a cooled paid provider is demoted past its peers
 * but never past them.
 */
export const SEARCH_PROVIDERS: readonly SearchProviderMeta[] = [
  ...TRANSPORT_PROVIDERS,
  ...SEARCH_PROVIDER_DEFINITIONS.map(builtinSearchMeta),
];

export function findSearchMeta(name: string): SearchProviderMeta | undefined {
  return SEARCH_PROVIDERS.find((provider) => provider.name === name);
}

export function searchProviderNames(): string[] {
  return SEARCH_PROVIDERS.map((provider) => provider.name);
}
