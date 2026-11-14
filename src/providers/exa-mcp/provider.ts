import { notImplemented } from "../../not-implemented.js";
import type { Transport } from "../../transport/transport.js";
import type { SearchProvider, SearchResult } from "../types.js";

/**
 * Exa's hosted MCP endpoint: keyless, rate limited per IP.
 *
 * Speaks the minimum MCP needed — `initialize`, `notifications/initialized`,
 * `tools/call` — and parses `web_search_exa`'s markdown response.
 */
export class ExaMcpFreeProvider implements SearchProvider {
  readonly name = "exa-free";
  readonly label = "Exa (free, no key)";

  readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  search(query: string, maxResults: number, _signal?: AbortSignal): Promise<SearchResult[]> {
    void query;
    void maxResults;
    return notImplemented("exa-free search");
  }
}
