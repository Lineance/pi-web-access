import type { SearchProviderSpec } from "./types.js";

import { compileSearchSpec, type SearchProviderSource } from "./custom/spec.js";

/**
 * The seven plain JSON search APIs, declared as data.
 *
 * The shape is exactly what `customProviders.search` accepts, compiled by the same
 * function — so a vendor entry here doubles as the documentation for how to declare
 * your own.
 *
 * These stay in code rather than moving to a config example on purpose: the field
 * mappings follow the vendors' APIs, so a renamed field is fixed once by shipping a
 * release instead of silently rotting in every user's copy.
 *
 * `bing` and `exa-free` need their own transports (HTML scraping, MCP over SSE) and
 * are not described here.
 */
export interface BuiltinSearchDefinition extends SearchProviderSource {
  name: string;
  label: string;
  /** Registry-facing metadata, not part of the request shape. */
  keyEnv?: string;
  baseUrlEnvVar?: string;
  defaultBaseUrl?: string;
  signupUrl?: string;
  tier: number;
  maxResults?: number;
}

export const SEARCH_PROVIDER_DEFINITIONS: readonly BuiltinSearchDefinition[] = [
  {
    name: "searxng",
    label: "SearXNG",
    url: "{baseUrl}/search",
    method: "GET",
    headers: { Accept: "application/json" },
    baseUrlEnvVar: "SEARXNG_URL",
    defaultBaseUrl: "http://localhost:8080",
    query: { q: "{query}", format: "json", limit: "{maxResults}" },
    resultsPath: "results",
    fields: { title: "title", url: "url", snippet: "content" },
    errorHint: "; check the configured URL and that JSON output is enabled",
    tier: 1,
    maxResults: 20,
  },
  {
    name: "bocha",
    label: "Bocha",
    url: "https://api.bochaai.com/v1/web-search",
    method: "POST",
    auth: { header: "authorization", prefix: "Bearer " },
    keyEnv: "BOCHA_API_KEY",
    signupUrl: "https://open.bochaai.com",
    body: { query: "{query}", summary: true, count: "{maxResults}", freshness: "noLimit" },
    resultsPath: "data.webPages.value",
    fields: { title: "name", url: "url", snippet: ["summary", "snippet"] },
    tier: 1,
    maxResults: 20,
  },
  {
    name: "tavily",
    label: "Tavily",
    url: "https://api.tavily.com/search",
    method: "POST",
    auth: { header: "authorization", prefix: "Bearer " },
    keyEnv: "TAVILY_API_KEY",
    signupUrl: "https://app.tavily.com",
    body: { query: "{query}", max_results: "{maxResults}" },
    resultsPath: "results",
    fields: { title: "title", url: "url", snippet: "content" },
    tier: 1,
    maxResults: 20,
  },
  {
    name: "exa",
    label: "Exa",
    url: "https://api.exa.ai/search",
    method: "POST",
    // Exa authenticates with a bare key in its own header, not a bearer token.
    auth: { header: "x-api-key", prefix: "" },
    keyEnv: "EXA_API_KEY",
    signupUrl: "https://dashboard.exa.ai/api-keys",
    body: {
      query: "{query}",
      numResults: "{maxResults}",
      contents: { text: { maxCharacters: 300 } },
    },
    resultsPath: "results",
    fields: { title: "title", url: "url", snippet: "text" },
    tier: 1,
    maxResults: 10,
  },
  {
    name: "brave",
    label: "Brave Search",
    url: "https://api.search.brave.com/res/v1/web/search",
    method: "GET",
    // No Accept-Encoding: set by the caller it would suppress undici's own gzip
    // handling and hand a compressed body to the JSON parser.
    headers: { Accept: "application/json" },
    auth: { header: "X-Subscription-Token", prefix: "" },
    keyEnv: "BRAVE_SEARCH_API_KEY",
    signupUrl: "https://api-dashboard.search.brave.com",
    query: { q: "{query}", count: "{maxResults}" },
    resultsPath: "web.results",
    fields: { title: "title", url: "url", snippet: "description" },
    tier: 1,
    maxResults: 20,
  },
  {
    name: "jina",
    label: "Jina",
    // The query belongs to the path, so it has to be percent-encoded there.
    url: "https://s.jina.ai/{queryEncoded}",
    method: "GET",
    auth: { header: "authorization", prefix: "Bearer " },
    keyEnv: "JINA_API_KEY",
    signupUrl: "https://jina.ai/reader",
    query: { num: "{maxResults}" },
    resultsPath: "data.results",
    fields: { title: "title", url: "url", snippet: "description" },
    tier: 1,
    maxResults: 10,
  },
  {
    name: "firecrawl",
    label: "Firecrawl",
    url: "https://api.firecrawl.dev/v1/search",
    method: "POST",
    auth: { header: "authorization", prefix: "Bearer " },
    keyEnv: "FIRECRAWL_API_KEY",
    signupUrl: "https://www.firecrawl.dev/app/api-keys",
    body: { query: "{query}", limit: "{maxResults}" },
    resultsPath: "data",
    fields: { title: "title", url: "url", snippet: "description" },
    tier: 1,
    maxResults: 10,
  },
];

export function findSearchDefinition(name: string): BuiltinSearchDefinition | undefined {
  return SEARCH_PROVIDER_DEFINITIONS.find((definition) => definition.name === name);
}

/** Compiled specs for the declarative built-ins, keyed by name. */
export function compileBuiltinSpecs(): Record<string, SearchProviderSpec> {
  const specs: Record<string, SearchProviderSpec> = {};
  for (const definition of SEARCH_PROVIDER_DEFINITIONS) {
    specs[definition.name] = compileSpecFor(definition);
  }
  return specs;
}

/** Built-in registry metadata, derived from the same definitions. */
export function builtinSearchMeta(definition: BuiltinSearchDefinition) {
  return {
    name: definition.name,
    label: definition.label,
    keyless: definition.auth === undefined,
    ...(definition.keyEnv === undefined ? {} : { envVar: definition.keyEnv }),
    ...(definition.baseUrlEnvVar === undefined ? {} : { baseUrlEnvVar: definition.baseUrlEnvVar }),
    ...(definition.defaultBaseUrl === undefined
      ? {}
      : { defaultBaseUrl: definition.defaultBaseUrl }),
    ...(definition.signupUrl === undefined ? {} : { signupUrl: definition.signupUrl }),
    tier: definition.tier,
    ...(definition.maxResults === undefined ? {} : { maxResults: definition.maxResults }),
  };
}
function compileSpecFor(definition: BuiltinSearchDefinition): SearchProviderSpec {
  return compileSearchSpec(definition.name, definition.label, definition, definition.keyEnv);
}
