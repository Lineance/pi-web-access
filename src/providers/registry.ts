import type { ProviderMeta } from "./types.js";

/**
 * Provider metadata.
 *
 * `tiers` decides demotion boundaries only; it never reorders healthy providers.
 * `maxResults` is each provider's own hard cap and stays internal: the user-facing
 * knob is one global `maxResults`.
 */
export const PROVIDERS: readonly ProviderMeta[] = [
  {
    name: "local",
    label: "Local (SSRF-safe direct fetch)",
    keyless: true,
    capabilities: { search: false, fetch: true },
    tiers: { fetch: 1 },
  },
  {
    name: "exa-free",
    label: "Exa (free, no key)",
    keyless: true,
    capabilities: { search: true, fetch: false },
    tiers: { search: 2 },
    maxResults: 10,
  },
  {
    name: "bing",
    label: "Bing (no key)",
    keyless: true,
    capabilities: { search: true, fetch: false },
    tiers: { search: 2 },
    maxResults: 10,
  },
  {
    name: "searxng",
    label: "SearXNG (self-hosted)",
    keyless: true,
    baseUrlEnvVar: "SEARXNG_URL",
    defaultBaseUrl: "http://localhost:8080",
    capabilities: { search: true, fetch: false },
    tiers: { search: 1 },
    maxResults: 20,
  },
  {
    name: "bocha",
    label: "Bocha",
    envVar: "BOCHA_API_KEY",
    signupUrl: "https://open.bochaai.com",
    capabilities: { search: true, fetch: false },
    tiers: { search: 1 },
    maxResults: 20,
  },
  {
    name: "tavily",
    label: "Tavily",
    envVar: "TAVILY_API_KEY",
    signupUrl: "https://app.tavily.com",
    capabilities: { search: true, fetch: false },
    tiers: { search: 1 },
    maxResults: 20,
  },
  {
    name: "exa",
    label: "Exa",
    envVar: "EXA_API_KEY",
    signupUrl: "https://dashboard.exa.ai/api-keys",
    capabilities: { search: true, fetch: false },
    tiers: { search: 1 },
    maxResults: 10,
  },
  {
    name: "brave",
    label: "Brave Search",
    envVar: "BRAVE_SEARCH_API_KEY",
    signupUrl: "https://api-dashboard.search.brave.com",
    capabilities: { search: true, fetch: false },
    tiers: { search: 1 },
    maxResults: 20,
  },
  {
    name: "jina",
    label: "Jina",
    envVar: "JINA_API_KEY",
    signupUrl: "https://jina.ai/reader",
    capabilities: { search: true, fetch: false },
    tiers: { search: 1 },
    maxResults: 10,
  },
  {
    name: "firecrawl",
    label: "Firecrawl",
    envVar: "FIRECRAWL_API_KEY",
    signupUrl: "https://www.firecrawl.dev/app/api-keys",
    capabilities: { search: true, fetch: false },
    tiers: { search: 1 },
    maxResults: 10,
  },
];

export function findProviderMeta(name: string): ProviderMeta | undefined {
  return PROVIDERS.find((provider) => provider.name === name);
}

export function providerNamesFor(capability: "search" | "fetch"): string[] {
  return PROVIDERS.filter((provider) => provider.capabilities[capability]).map(
    (provider) => provider.name,
  );
}
