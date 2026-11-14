import { kindForStatus, WebSearchError } from "../../orchestrator/errors.js";
import { MAX_SEARCH_RESPONSE_BODY_BYTES, readResponseJson } from "../../transport/response-body.js";
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
  /** Appended to an HTTP error message to name the likely cause. */
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

  private readonly spec: JsonProviderSpec;
  private readonly transport: Transport;
  private readonly apiKey: string;
  private readonly baseUrl: string | undefined;

  constructor(spec: JsonProviderSpec, transport: Transport, apiKey = "", baseUrl?: string) {
    this.spec = spec;
    this.name = spec.name;
    this.label = spec.label;
    this.transport = transport;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResult[]> {
    if (this.spec.envVar !== undefined && this.apiKey === "") {
      throw new WebSearchError(
        "config",
        this.name,
        `${this.spec.envVar} is not set for ${this.label}`,
      );
    }

    const { url, init } = this.buildRequest(query, maxResults, signal);
    const response = await this.transport(url, init);

    if (!response.ok) {
      await discard(response);
      throw new WebSearchError(
        kindForStatus(response.status),
        this.name,
        `${this.label} search error (${response.status})${this.spec.errorHint ?? ""}`,
        response.status,
      );
    }

    const payload = await this.readJson(response);
    const list = readDottedPath(payload, this.spec.resultsPath);
    if (!Array.isArray(list)) {
      throw new WebSearchError(
        "parse",
        this.name,
        `${this.label} response has no result array at "${this.spec.resultsPath}"`,
      );
    }

    return list.slice(0, maxResults).map((item) => this.mapResult(item));
  }

  private buildRequest(
    query: string,
    maxResults: number,
    signal: AbortSignal | undefined,
  ): { url: string; init: RequestInit } {
    const spec = this.spec;
    const headers: Record<string, string> = { ...spec.headers };

    if (spec.authHeaderName !== undefined && this.apiKey !== "") {
      headers[spec.authHeaderName] =
        spec.authHeaderName.toLowerCase() === "authorization"
          ? `Bearer ${this.apiKey}`
          : this.apiKey;
    }

    const target =
      typeof spec.url === "function" ? spec.url(query, maxResults, this.baseUrl) : spec.url;
    const method = spec.method ?? (spec.body === undefined ? "GET" : "POST");

    let url = target;
    if (method === "GET") {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(spec.queryParams?.(query, maxResults) ?? {})) {
        if (value !== "") params.set(key, value);
      }
      const queryString = params.toString();
      if (queryString.length > 0) url = `${url}?${queryString}`;
    }

    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    const body =
      method === "POST" ? JSON.stringify((spec.body ?? defaultBody)(query, maxResults)) : undefined;
    if (method === "GET") delete headers["Content-Type"];

    return {
      url,
      init: {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        ...(signal === undefined ? {} : { signal }),
      },
    };
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await readResponseJson<unknown>(response, MAX_SEARCH_RESPONSE_BODY_BYTES);
    } catch {
      throw new WebSearchError("parse", this.name, `${this.label} returned a non-JSON body`);
    }
  }

  private mapResult(item: unknown): SearchResult {
    const record = (item ?? {}) as Record<string, unknown>;
    const { title, url, snippet } = this.spec.fields;
    return {
      title: firstString(title === undefined ? undefined : record[title]),
      url: firstString(url === undefined ? undefined : record[url]),
      snippet: firstString(
        snippet === undefined
          ? undefined
          : Array.isArray(snippet)
            ? snippet.map((field) => record[field])
            : record[snippet],
      ),
    };
  }
}

function defaultBody(query: string, maxResults: number): unknown {
  return { query, count: maxResults };
}

function readDottedPath(raw: unknown, path: string): unknown {
  let current: unknown = raw;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Accepts a string, or the first non-empty string of an array of candidates. */
function firstString(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.length > 0) return item;
    }
    return "";
  }
  return typeof value === "string" ? value : "";
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}
