import type { Transport } from "../../transport/transport.js";
import { BUILTIN_CATALOG, type ProviderCatalog } from "../catalog.js";

import { BingProvider } from "./bing/provider.js";
import { ExaMcpFreeProvider } from "./exa-mcp/provider.js";
import { JsonSearchProvider } from "./json/provider.js";
import type { SearchProvider, SearchProviderCredentials } from "./types.js";

/**
 * Instantiate a search provider by name.
 *
 * The two providers with a custom transport are dispatched first; everything else,
 * built-in or user-declared, is the one declarative JSON class.
 */
export function createSearchProvider(
  name: string,
  transport: Transport,
  credentials: SearchProviderCredentials = {},
  catalog: ProviderCatalog = BUILTIN_CATALOG,
): SearchProvider {
  if (name === "bing") return new BingProvider(transport);
  if (name === "exa-free") return new ExaMcpFreeProvider(transport);

  const spec = catalog.searchSpec(name);
  if (spec === undefined) throw new Error(`unknown search provider "${name}"`);
  return new JsonSearchProvider(spec, transport, credentials.apiKey, credentials.baseUrl);
}
