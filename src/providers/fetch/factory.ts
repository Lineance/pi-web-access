import type { Transport } from "../../transport/transport.js";
import { BUILTIN_CATALOG, type ProviderCatalog } from "../catalog.js";

import { CustomFetchProvider } from "./custom/provider.js";
import { LocalFetchProvider } from "./local/provider.js";
import { PandocFetchProvider } from "./pandoc/provider.js";
import { RawFetchProvider } from "./raw/provider.js";
import type { FetchProvider, FetchProviderCredentials } from "./types.js";

/** Instantiate a fetch provider by name. */
export function createFetchProvider(
  name: string,
  transport: Transport,
  credentials: FetchProviderCredentials = {},
  catalog: ProviderCatalog = BUILTIN_CATALOG,
): FetchProvider {
  if (name === "local") return new LocalFetchProvider({ transport });
  if (name === "pandoc") return new PandocFetchProvider({ transport });
  if (name === "raw") return new RawFetchProvider({ transport });

  const spec = catalog.fetchSpec(name);
  if (spec === undefined) throw new Error(`provider "${name}" does not support fetch`);
  return new CustomFetchProvider(spec, transport, credentials.apiKey);
}
