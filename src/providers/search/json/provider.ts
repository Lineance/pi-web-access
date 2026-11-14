import { kindForStatus, WebSearchError } from "../../../orchestrator/errors.js";
import {
  MAX_SEARCH_RESPONSE_BODY_BYTES,
  readResponseJson,
} from "../../../transport/response-body.js";
import type { Transport } from "../../../transport/transport.js";
import { firstString, readDottedPath } from "../../dotted.js";
import type { SearchResult } from "../../types.js";
import type { SearchProvider, SearchProviderSpec } from "../types.js";

/**
 * The seven plain JSON providers share one implementation; only the spec differs.
 *
 * `bing` (HTML scraping) and `exa-free` (MCP over SSE) need their own transports.
 */
export class JsonSearchProvider implements SearchProvider {
  readonly name: string;
  readonly label: string;

  private readonly spec: SearchProviderSpec;
  private readonly transport: Transport;
  private readonly apiKey: string;
  private readonly baseUrl: string | undefined;

  constructor(spec: SearchProviderSpec, transport: Transport, apiKey = "", baseUrl?: string) {
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
      // `authorization` defaults to a bearer token; every other header carries the
      // key bare. A spec may override the prefix explicitly.
      const prefix =
        spec.authPrefix ?? (spec.authHeaderName.toLowerCase() === "authorization" ? "Bearer " : "");
      headers[spec.authHeaderName] = `${prefix}${this.apiKey}`;
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

    if (method === "POST") headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    else delete headers["Content-Type"];

    const body =
      method === "POST" ? JSON.stringify((spec.body ?? defaultBody)(query, maxResults)) : undefined;

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

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}
