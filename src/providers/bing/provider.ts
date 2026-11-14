import { notImplemented } from "../../not-implemented.js";
import type { Transport } from "../../transport/transport.js";
import type { SearchProvider, SearchResult } from "../types.js";

/** Bing keyless HTML results, including the mainland-China redirect hosts. */
export class BingProvider implements SearchProvider {
  readonly name = "bing";
  readonly label = "Bing";

  readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  search(query: string, maxResults: number, _signal?: AbortSignal): Promise<SearchResult[]> {
    void query;
    void maxResults;
    return notImplemented("bing search");
  }
}
