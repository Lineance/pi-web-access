import { notImplemented } from "../../not-implemented.js";
import type { Transport } from "../../transport/transport.js";
import type { SearchProvider, SearchResult } from "../types.js";

/** Declarative description of a plain JSON search API. */
export interface JsonProviderSpec {
  name: string;
  label: string;
  /** Missing-key error prefix; absent means the provider is keyless. */
  envVar?: string;
  url: string | ((query: string, maxResults: number, baseUrl: string | undefined) => string);
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** `authorization` gets a `Bearer ` prefix; anything else is sent verbatim. */
  authHeaderName?: string;
  body?: (query: string, maxResults: number) => unknown;
  queryParams?: (query: string, maxResults: number) => Record<string, string>;
  /** Dotted path to the result array. A non-array here is a parse failure. */
  resultsPath: string;
  fields: { title?: string; url?: string; snippet?: string | string[] };
  errorHint?: string;
}

/**
 * The seven plain JSON providers share one implementation; only the spec differs.
 *
 * `bing` (HTML scraping) and `exa-free` (MCP over SSE) need their own transports.
 */
export class JsonSearchProvider implements SearchProvider {
  readonly name: string;
  readonly label: string;
  readonly spec: JsonProviderSpec;
  readonly transport: Transport;
  readonly apiKey: string;
  readonly baseUrl: string | undefined;

  constructor(spec: JsonProviderSpec, transport: Transport, apiKey = "", baseUrl?: string) {
    this.spec = spec;
    this.name = spec.name;
    this.label = spec.label;
    this.transport = transport;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  search(query: string, maxResults: number, _signal?: AbortSignal): Promise<SearchResult[]> {
    void query;
    void maxResults;
    return notImplemented(`json provider ${this.name}`);
  }
}
