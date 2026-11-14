import type { SearchProviderMeta } from "./types.js";

/**
 * Search providers.
 *
 * `tier` decides demotion boundaries only; it never reorders healthy providers.
 * Keyless fallbacks sit in tier 2 so a cooled paid provider is demoted past its
 * peers but never past them.
 */
export const SEARCH_PROVIDERS: readonly SearchProviderMeta[] = [
  {
    name: "exa-free",
    label: "Exa (free, no key)",
    keyless: true,
    tier: 2,
    maxResults: 10,
  },
  {
    name: "bing",
    label: "Bing",
    keyless: true,
    tier: 2,
    maxResults: 10,
  },
  {
    name: "searxng",
    label: "SearXNG",
    keyless: true,
    baseUrlEnvVar: "SEARXNG_URL",
    defaultBaseUrl: "http://localhost:8080",
    tier: 1,
    maxResults: 20,
  },
  {
    name: "bocha",
    label: "Bocha",
    envVar: "BOCHA_API_KEY",
    signupUrl: "https://open.bochaai.com",
    tier: 1,
    maxResults: 20,
  },
  {
    name: "tavily",
    label: "Tavily",
    envVar: "TAVILY_API_KEY",
    signupUrl: "https://app.tavily.com",
    tier: 1,
    maxResults: 20,
  },
  {
    name: "exa",
    label: "Exa",
    envVar: "EXA_API_KEY",
    signupUrl: "https://dashboard.exa.ai/api-keys",
    tier: 1,
    maxResults: 10,
  },
  {
    name: "brave",
    label: "Brave Search",
    envVar: "BRAVE_SEARCH_API_KEY",
    signupUrl: "https://api-dashboard.search.brave.com",
    tier: 1,
    maxResults: 20,
  },
  {
    name: "jina",
    label: "Jina",
    envVar: "JINA_API_KEY",
    signupUrl: "https://jina.ai/reader",
    tier: 1,
    maxResults: 10,
  },
  {
    name: "firecrawl",
    label: "Firecrawl",
    envVar: "FIRECRAWL_API_KEY",
    signupUrl: "https://www.firecrawl.dev/app/api-keys",
    tier: 1,
    maxResults: 10,
  },
];

export function findSearchMeta(name: string): SearchProviderMeta | undefined {
  return SEARCH_PROVIDERS.find((provider) => provider.name === name);
}

export function searchProviderNames(): string[] {
  return SEARCH_PROVIDERS.map((provider) => provider.name);
}
