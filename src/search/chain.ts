import { getChain, resolveApiKey, resolveBaseUrl, tierLookup } from "../config/resolve.js";
import type { WebConfig } from "../config/schema.js";
import { arrangeChain } from "../orchestrator/arrange.js";
import { runChain, type ChainAttempt, type ChainOutcome } from "../orchestrator/chain.js";
import { WebSearchError } from "../orchestrator/errors.js";
import type { ChainHealth } from "../orchestrator/health.js";
import { BUILTIN_CATALOG, type ProviderCatalog } from "../providers/catalog.js";
import { createSearchProvider } from "../providers/search/factory.js";
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
  readonly catalog?: ProviderCatalog;
  readonly health?: ChainHealth;
  readonly signal?: AbortSignal;
  readonly onAttempt?: (provider: string, label: string) => void;
}

export function buildSearchChain(
  config: WebConfig,
  health?: ChainHealth,
  catalog: ProviderCatalog = BUILTIN_CATALOG,
): string[] {
  const usable: string[] = [];
  for (const name of getChain(config, "search")) {
    const meta = catalog.searchMeta(name);
    if (meta === undefined) {
      throw catalog.fetchMeta(name) === undefined
        ? new WebSearchError("config", name, `unknown search provider "${name}"`)
        : new WebSearchError("config", name, `provider "${name}" does not support search`);
    }
    usable.push(name);
  }

  return arrangeChain({
    names: usable,
    tierOf: tierLookup(config, "search", catalog),
    isCooled: health ? (name) => health.isCooled("search", name) : () => false,
  });
}

export async function searchWithChain(
  query: string,
  maxResults: number,
  config: WebConfig,
  options: SearchChainOptions,
): Promise<ChainOutcome<SearchResult[]>> {
  const catalog = options.catalog ?? BUILTIN_CATALOG;
  const names = buildSearchChain(config, options.health, catalog);

  const attempts: ChainAttempt<SearchResult[]>[] = names.map((name) => {
    const provider = createSearchProvider(
      name,
      options.transport,
      {
        apiKey: resolveApiKey("search", name, config, catalog),
        baseUrl: resolveBaseUrl(name, config, catalog),
      },
      catalog,
    );
    const cap = catalog.searchMeta(name)?.maxResults ?? maxResults;
    const perProvider = Math.min(maxResults, cap);
    return {
      provider: name,
      label: provider.label,
      run: (signal) => provider.search(query, perProvider, signal),
    };
  });

  const outcome = await runChain(attempts, {
    capability: "search",
    totalMs: Number.POSITIVE_INFINITY,
    perAttemptMs: SEARCH_PER_ATTEMPT_MS,
    isUnusable: (results) => results.length === 0,
    ...(options.health ? { health: options.health } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.onAttempt ? { onAttempt: options.onAttempt } : {}),
  });

  return { ...outcome, value: normalizeSearchResults(outcome.value, maxResults) };
}
