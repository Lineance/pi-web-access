import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { readConfigValue, resolveMaxResults } from "../config/paths.js";
import type { WebConfig } from "../config/schema.js";
import type { ChainHealth } from "../orchestrator/health.js";
import type { ProviderCatalog } from "../providers/catalog.js";
import type { SearchResult } from "../providers/types.js";
import { searchWithChain } from "./chain.js";
import type { Transport } from "../transport/transport.js";

export interface SearchToolDeps {
  /** Used for the tool schema only; the chain uses `loadConfig` on every call. */
  config: WebConfig;
  /** Re-read per call. Injectable so a test can control the chain. */
  loadConfig?: () => WebConfig;
  transport: Transport;
  catalog?: ProviderCatalog;
  health?: ChainHealth;
}

export function registerWebSearchTool(pi: ExtensionAPI, deps: SearchToolDeps): void {
  // The schema is fixed when the tool is registered, so `maxResults` is baked in
  // here; everything else is re-read per call.
  const maxResults = resolveMaxResults(deps.config);

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: "Search the web for current information. Returns titles, URLs, and snippets.",
    parameters: Type.Object({
      query: Type.String(),
      max_results: Type.Optional(
        Type.Number({
          default: maxResults,
          minimum: 1,
          maximum: maxResults,
        }),
      ),
    }),

    async execute(_toolCallId, params, signal, onUpdate) {
      // Re-read rather than using the snapshot taken at registration: editing the
      // file is the normal way to change a chain, and a stale snapshot makes the
      // tool disagree with /web-access-status until pi restarts.
      const config = (deps.loadConfig ?? readConfigValue)();
      const requested = clampRequested(params.max_results, resolveMaxResults(config));

      const outcome = await searchWithChain(params.query, requested, config, {
        transport: deps.transport,
        ...(deps.catalog ? { catalog: deps.catalog } : {}),
        ...(deps.health ? { health: deps.health } : {}),
        ...(signal ? { signal } : {}),
        onAttempt: (provider, label) => {
          onUpdate?.({
            content: [{ type: "text", text: `Searching ${label}…` }],
            details: { query: params.query, backend: provider, resultCount: 0 },
          });
        },
      });

      if (outcome.value.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No results for "${params.query}" (provider: ${outcome.backend}).`,
            },
          ],
          details: {
            query: params.query,
            backend: outcome.backend,
            attemptedProviders: outcome.attempted,
            requestedResults: requested,
            returnedResults: 0,
          },
        };
      }

      return {
        content: [{ type: "text" as const, text: formatResults(params.query, outcome.value) }],
        details: {
          query: params.query,
          backend: outcome.backend,
          attemptedProviders: outcome.attempted,
          requestedResults: requested,
          returnedResults: outcome.value.length,
          results: outcome.value,
        },
      };
    },
  });
}

function clampRequested(requested: number | undefined, ceiling: number): number {
  if (typeof requested !== "number" || !Number.isFinite(requested)) return ceiling;
  return Math.min(ceiling, Math.max(1, Math.floor(requested)));
}

function formatResults(query: string, results: readonly SearchResult[]): string {
  const body = results
    .map((result, index) => {
      const title = result.title.trim() || result.url;
      const snippet = result.snippet.trim();
      return snippet
        ? `${index + 1}. ${title}\n   ${result.url}\n   ${snippet}`
        : `${index + 1}. ${title}\n   ${result.url}`;
    })
    .join("\n\n");
  return `Results for "${query}":\n\n${body}`;
}
