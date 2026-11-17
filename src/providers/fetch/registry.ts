import type { FetchProviderMeta } from "./types.js";

/**
 * Built-in fetch providers.
 *
 * `local` is the always-present floor: it costs nothing, needs no credential, and
 * renders HTML to GFM markdown with an in-process converter. `pandoc` upgrades
 * conversion fidelity when the machine has the binary; `raw` hands back the body
 * untouched. Both are opt-in through `fetchProviders` and fall back down the
 * chain — a missing binary or a failed conversion is an ordinary provider
 * failure, never a broken fetch.
 *
 * The remote readers are data-driven specs (see `specs.ts`) reached through the
 * same custom-provider machinery, one vendor name per capability like the search
 * side. Firecrawl and Jina serve a keyless tier, so their keys are optional.
 */
export const FETCH_PROVIDERS: readonly FetchProviderMeta[] = [
  {
    name: "local",
    label: "Local",
    keyless: true,
    tier: 1,
  },
  {
    name: "pandoc",
    label: "Pandoc (local)",
    keyless: true,
    tier: 1,
  },
  {
    name: "raw",
    label: "Raw (no conversion)",
    keyless: true,
    tier: 1,
  },
  {
    name: "firecrawl",
    label: "Firecrawl",
    envVar: "FIRECRAWL_API_KEY",
    optionalKey: true,
    signupUrl: "https://www.firecrawl.dev/app/api-keys",
    tier: 2,
  },
  {
    name: "jina",
    label: "Jina Reader",
    envVar: "JINA_API_KEY",
    optionalKey: true,
    signupUrl: "https://jina.ai/reader",
    tier: 2,
  },
  {
    name: "scrapfly",
    label: "Scrapfly",
    envVar: "SCRAPFLY_API_KEY",
    signupUrl: "https://scrapfly.io/dashboard",
    tier: 2,
  },
  {
    name: "tavily",
    label: "Tavily Extract",
    envVar: "TAVILY_API_KEY",
    signupUrl: "https://app.tavily.com",
    tier: 2,
  },
  {
    name: "scrapingant",
    label: "ScrapingAnt",
    envVar: "SCRAPINGANT_API_KEY",
    signupUrl: "https://app.scrapingant.com",
    tier: 2,
  },
  {
    name: "scrapingbee",
    label: "ScrapingBee",
    envVar: "SCRAPINGBEE_API_KEY",
    signupUrl: "https://app.scrapingbee.com",
    tier: 2,
  },
  {
    name: "scraperapi",
    label: "ScraperAPI",
    envVar: "SCRAPERAPI_API_KEY",
    signupUrl: "https://www.scraperapi.com/signup",
    tier: 2,
  },
  {
    name: "zenrows",
    label: "ZenRows",
    envVar: "ZENROWS_API_KEY",
    signupUrl: "https://portal.zenrows.com",
    tier: 2,
  },
];

export function findFetchMeta(name: string): FetchProviderMeta | undefined {
  const builtin = FETCH_PROVIDERS.find((provider) => provider.name === name);
  return builtin;
}

export function fetchProviderNames(): string[] {
  return FETCH_PROVIDERS.map((provider) => provider.name);
}
