import type { Transport } from "../transport/transport.js";

import { BingProvider } from "./bing/provider.js";
import { ExaMcpFreeProvider } from "./exa-mcp/provider.js";
import { JsonSearchProvider, type JsonProviderSpec } from "./json/provider.js";
import { LocalFetchProvider } from "./local/provider.js";
import { findProviderMeta } from "./registry.js";
import type { FetchProvider, ProviderCredentials, SearchProvider } from "./types.js";

/** Specs for the plain JSON search APIs; the remaining two have custom transports. */
export const JSON_PROVIDER_SPECS: Record<string, JsonProviderSpec> = {};

export function createSearchProvider(
  name: string,
  transport: Transport,
  credentials: ProviderCredentials = {},
): SearchProvider {
  if (name === "exa-free") return new ExaMcpFreeProvider(transport);
  if (name === "bing") return new BingProvider(transport);
  const spec = JSON_PROVIDER_SPECS[name];
  if (!spec) throw new Error(`unknown search provider "${name}"`);
  return new JsonSearchProvider(spec, transport, credentials.apiKey, credentials.baseUrl);
}

export function createFetchProvider(name: string, transport: Transport): FetchProvider {
  if (name === "local") return new LocalFetchProvider({ transport });
  throw new Error(`provider "${name}" does not support fetch`);
}

/** Whether a registry entry exists and advertises the capability. */
export function supportsCapability(name: string, capability: "search" | "fetch"): boolean {
  const meta = findProviderMeta(name);
  return meta?.capabilities[capability] === true;
}
