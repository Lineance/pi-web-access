import { getChain, resolveApiKey, resolveBaseUrl, tierLookup } from "../config/resolve.js";
import type { WebConfig } from "../config/schema.js";
import { arrangeChain } from "../orchestrator/arrange.js";
import { runChain, type ChainAttempt, type ChainOutcome } from "../orchestrator/chain.js";
import { WebSearchError } from "../orchestrator/errors.js";
import type { ChainHealth } from "../orchestrator/health.js";
import { createSearchProvider, supportsCapability } from "../providers/factory.js";
import { findProviderMeta } from "../providers/registry.js";
import type { SearchResult } from "../providers/types.js";
import type { Transport } from "../transport/transport.js";

import { normalizeSearchResults } from "./normalize.js";

/**
 * A search attempt is bounded per provider, not per call: with five providers in
 * the chain the last one must still get a usable window.
 */
export const SEARCH_PER_ATTEMPT_MS = 15_000;

export interface SearchChainOptions {
  readonly transport: Transport;
  readonly health?: ChainHealth;
  readonly signal?: AbortSignal;
  readonly onAttempt?: (provider: string, label: string) => void;
}

export function buildSearchChain(config: WebConfig, health?: ChainHealth): string[] {
  const configured = getChain(config, "search");
  const usable: string[] = [];
  for (const name of configured) {
    if (!findProviderMeta(name)) {
      throw new WebSearchError("config", name, `unknown search provider "${name}"`);
    }
    if (!supportsCapability(name, "search")) {
      throw new WebSearchError("config", name, `provider "${name}" does not support search`);
    }
    usable.push(name);
  }

  return arrangeChain({
    names: usable,
    tierOf: tierLookup(config, "search"),
    isCooled: health ? (name) => health.isCooled("search", name) : () => false,
  });
}

export async function searchWithChain(
  query: string,
  maxResults: number,
  config: WebConfig,
  options: SearchChainOptions,
): Promise<ChainOutcome<SearchResult[]>> {
  const names = buildSearchChain(config, options.health);

  const attempts: ChainAttempt<SearchResult[]>[] = names.map((name) => {
    const provider = createSearchProvider(name, options.transport, {
      apiKey: resolveApiKey(name, config),
      baseUrl: resolveBaseUrl(name, config),
    });
    const cap = findProviderMeta(name)?.maxResults ?? maxResults;
    const perProvider = Math.min(maxResults, cap);
    return {
      provider: name,
      label: provider.label,
      run: (signal) => provider.search(query, perProvider, signal),
    };
  });

  return runChain(attempts, {
    capability: "search",
    totalMs: Number.POSITIVE_INFINITY,
    perAttemptMs: SEARCH_PER_ATTEMPT_MS,
    isUnusable: (results) => results.length === 0,
    ...(options.health ? { health: options.health } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.onAttempt ? { onAttempt: options.onAttempt } : {}),
  }).then((outcome) => ({
    ...outcome,
    value: normalizeSearchResults(outcome.value, maxResults),
  }));
}
