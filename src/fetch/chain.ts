import { getChain, tierLookup } from "../config/resolve.js";
import type { WebConfig } from "../config/schema.js";
import { arrangeChain } from "../orchestrator/arrange.js";
import { runChain, type ChainAttempt, type ChainOutcome } from "../orchestrator/chain.js";
import { WebSearchError } from "../orchestrator/errors.js";
import type { ChainHealth } from "../orchestrator/health.js";
import { createFetchProvider, supportsCapability } from "../providers/factory.js";
import { findProviderMeta } from "../providers/registry.js";
import type { FetchedContent } from "../providers/types.js";

/** One fetch call is bounded end to end, across every attempt. */
export const FETCH_TOTAL_TIMEOUT_MS = 30_000;
export const FETCH_PER_ATTEMPT_MS = 15_000;
export const FETCH_MIN_ATTEMPT_MS = 5_000;

/**
 * Below this, a 200 response is a verification page, a 404 body, or a
 * JavaScript shell rather than content. Applied only while attempts remain; a
 * short page from the last attempt is still returned.
 */
export const MIN_USEFUL_TEXT_CHARS = 200;

export interface FetchChainOptions {
  readonly raw: boolean;
  readonly health?: ChainHealth;
  readonly signal?: AbortSignal;
  readonly onAttempt?: (provider: string, label: string) => void;
}

/** Raw markup can only come from the local transport; remote readers cannot. */
export function buildFetchChain(
  config: WebConfig,
  options: { raw: boolean; health?: ChainHealth },
): string[] {
  if (options.raw) return ["local"];

  const configured = getChain(config, "fetch");
  const usable: string[] = [];
  for (const name of configured) {
    if (!findProviderMeta(name)) {
      throw new WebSearchError("config", name, `unknown fetch provider "${name}"`);
    }
    if (!supportsCapability(name, "fetch")) {
      throw new WebSearchError("config", name, `provider "${name}" does not support fetch`);
    }
    usable.push(name);
  }

  const cooled = options.health;
  return arrangeChain({
    names: usable,
    tierOf: tierLookup(config, "fetch"),
    isCooled: cooled ? (name) => cooled.isCooled("fetch", name) : () => false,
  });
}

export async function fetchWithChain(
  url: string,
  config: WebConfig,
  options: FetchChainOptions,
): Promise<ChainOutcome<FetchedContent>> {
  const names = buildFetchChain(config, options);
  const attempts: ChainAttempt<FetchedContent>[] = names.map((name) => {
    const provider = createFetchProvider(name);
    return {
      provider: name,
      label: provider.label,
      run: (signal) => provider.fetch(url, signal),
    };
  });

  return runChain(attempts, {
    capability: "fetch",
    totalMs: FETCH_TOTAL_TIMEOUT_MS,
    perAttemptMs: FETCH_PER_ATTEMPT_MS,
    minPerAttemptMs: FETCH_MIN_ATTEMPT_MS,
    isUnusable: (content) =>
      content.kind === "text"
        ? content.text.trim().length < MIN_USEFUL_TEXT_CHARS
        : content.byteLength === 0,
    ...(options.health ? { health: options.health } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.onAttempt ? { onAttempt: options.onAttempt } : {}),
  });
}
