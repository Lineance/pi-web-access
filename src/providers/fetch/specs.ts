import { substituteString } from "../substitute.js";
import type { FetchProviderSpec } from "./types.js";

/**
 * Built-in remote readers, described as data and compiled through the same
 * custom-provider machinery as `customProviders.fetch` — one vendor name per
 * capability, mirroring the search side.
 *
 * Every body field that carries the target uses `{urlRaw}`: the URL is data
 * there, and percent-encoding it would corrupt the request. Query-parameter
 * targets use the encoded `{url}`; query-parameter keys use `{apiKey}`.
 */
export const BUILTIN_FETCH_SPECS: Readonly<Record<string, FetchProviderSpec>> = {
  firecrawl: {
    name: "firecrawl",
    label: "Firecrawl",
    url: (url, apiKey) =>
      String(substituteString("https://api.firecrawl.dev/v2/scrape", { url, apiKey })),
    method: "POST",
    authHeaderName: "authorization",
    authPrefix: "Bearer ",
    body: { url: "{urlRaw}", formats: ["markdown"] },
    textPath: "data.markdown",
    titlePath: "data.metadata.title",
    errorHint: " (keyless tier is IP-capped; FIRECRAWL_API_KEY buys the registered quota)",
  },
  jina: {
    name: "jina",
    label: "Jina Reader",
    url: (url, apiKey) => String(substituteString("https://r.jina.ai/{url}", { url, apiKey })),
    method: "GET",
    authHeaderName: "authorization",
    authPrefix: "Bearer ",
    errorHint:
      " (blocked on some networks; a proxy in the config helps, JINA_API_KEY raises rate limits)",
  },
  scrapfly: {
    name: "scrapfly",
    label: "Scrapfly",
    url: (url, apiKey) =>
      String(
        substituteString("https://api.scrapfly.io/scrape?url={url}&format=markdown", {
          url,
          apiKey,
        }),
      ),
    method: "GET",
    authHeaderName: "authorization",
    authPrefix: "Bearer ",
    textPath: "result.content",
    titlePath: "result.title",
  },
  tavily: {
    name: "tavily",
    label: "Tavily Extract",
    url: () => "https://api.tavily.com/extract",
    method: "POST",
    authHeaderName: "authorization",
    authPrefix: "Bearer ",
    body: { urls: ["{urlRaw}"] },
    textPath: "results.0.raw_content",
    titlePath: "results.0.title",
  },
  scrapingant: {
    name: "scrapingant",
    label: "ScrapingAnt",
    url: (url, apiKey) =>
      String(
        substituteString("https://api.scrapingant.com/v2/markdown?url={url}", { url, apiKey }),
      ),
    method: "GET",
    authHeaderName: "x-api-key",
    textPath: "markdown",
  },
  scrapingbee: {
    name: "scrapingbee",
    label: "ScrapingBee",
    url: (url, apiKey) =>
      String(
        substituteString(
          "https://api.scrapingbee.com/api/v1/?url={url}&return_page_markdown=true",
          { url, apiKey },
        ),
      ),
    method: "GET",
    authHeaderName: "authorization",
    authPrefix: "Bearer ",
  },
  scraperapi: {
    name: "scraperapi",
    label: "ScraperAPI",
    url: (url, apiKey) =>
      String(
        substituteString(
          "https://api.scraperapi.com/?api_key={apiKey}&url={url}&output_format=markdown",
          { url, apiKey },
        ),
      ),
    method: "GET",
  },
  zenrows: {
    name: "zenrows",
    label: "ZenRows",
    url: (url, apiKey) =>
      String(
        substituteString(
          "https://api.zenrows.com/v1/?apikey={apiKey}&url={url}&response_type=markdown",
          { url, apiKey },
        ),
      ),
    method: "GET",
  },
};
