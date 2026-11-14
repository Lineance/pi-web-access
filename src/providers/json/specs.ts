import type { JsonProviderSpec } from "./provider.js";

/**
 * The seven plain JSON search APIs.
 *
 * `bing` (HTML scraping) and `exa-free` (MCP over SSE) need their own transports
 * and live in sibling modules.
 *
 * Field names differ per vendor and the parameter names differ too — Firecrawl
 * wants `limit`, Tavily wants `max_results`, Exa wants `numResults`. Each spec is
 * the whole contract for one vendor, so adding a provider is one entry here.
 */
export const JSON_PROVIDER_SPECS: Readonly<Record<string, JsonProviderSpec>> = {
  bocha: {
    name: "bocha",
    label: "Bocha",
    envVar: "BOCHA_API_KEY",
    url: "https://api.bochaai.com/v1/web-search",
    method: "POST",
    authHeaderName: "authorization",
    body: (query, maxResults) => ({
      query,
      summary: true,
      count: maxResults,
      freshness: "noLimit",
    }),
    resultsPath: "data.webPages.value",
    fields: { title: "name", url: "url", snippet: ["summary", "snippet"] },
  },
  tavily: {
    name: "tavily",
    label: "Tavily",
    envVar: "TAVILY_API_KEY",
    url: "https://api.tavily.com/search",
    method: "POST",
    authHeaderName: "authorization",
    body: (query, maxResults) => ({ query, max_results: maxResults }),
    resultsPath: "results",
    fields: { title: "title", url: "url", snippet: "content" },
  },
  exa: {
    name: "exa",
    label: "Exa",
    envVar: "EXA_API_KEY",
    url: "https://api.exa.ai/search",
    method: "POST",
    // Exa authenticates with a bare key, not a bearer token.
    authHeaderName: "x-api-key",
    body: (query, maxResults) => ({
      query,
      numResults: maxResults,
      contents: { text: { maxCharacters: 300 } },
    }),
    resultsPath: "results",
    fields: { title: "title", url: "url", snippet: "text" },
  },
  brave: {
    name: "brave",
    label: "Brave Search",
    envVar: "BRAVE_SEARCH_API_KEY",
    url: "https://api.search.brave.com/res/v1/web/search",
    method: "GET",
    // No Accept-Encoding here: set by the caller, it would suppress undici's own
    // gzip handling and hand a compressed body to the JSON parser.
    headers: { Accept: "application/json" },
    authHeaderName: "X-Subscription-Token",
    queryParams: (query, maxResults) => ({ q: query, count: String(maxResults) }),
    resultsPath: "web.results",
    fields: { title: "title", url: "url", snippet: "description" },
  },
  jina: {
    name: "jina",
    label: "Jina",
    envVar: "JINA_API_KEY",
    url: (query) => `https://s.jina.ai/${encodeURIComponent(query)}`,
    method: "GET",
    authHeaderName: "authorization",
    queryParams: (_query, maxResults) => ({ num: String(maxResults) }),
    resultsPath: "data.results",
    fields: { title: "title", url: "url", snippet: "description" },
  },
  firecrawl: {
    name: "firecrawl",
    label: "Firecrawl",
    envVar: "FIRECRAWL_API_KEY",
    url: "https://api.firecrawl.dev/v1/search",
    method: "POST",
    authHeaderName: "authorization",
    body: (query, maxResults) => ({ query, limit: maxResults }),
    resultsPath: "data",
    fields: { title: "title", url: "url", snippet: "description" },
  },
  searxng: {
    name: "searxng",
    label: "SearXNG",
    url: (query, _maxResults, baseUrl) => `${(baseUrl ?? "").replace(/\/+$/, "")}/search`,
    method: "GET",
    headers: { Accept: "application/json" },
    queryParams: (query, maxResults) => ({
      q: query,
      format: "json",
      limit: String(maxResults),
    }),
    resultsPath: "results",
    fields: { title: "title", url: "url", snippet: "content" },
    errorHint: "; check the configured URL and that JSON output is enabled",
  },
};
