import type { SearchProviderSpec } from "../types.js";
import { compileBuiltinSpecs } from "../definitions.js";

/**
 * Compiled specs for the declarative built-ins.
 *
 * Derived from `SEARCH_PROVIDER_DEFINITIONS` through the same compiler a user's
 * `customProviders.search` entry goes through, so there is exactly one way to
 * describe a search API.
 */
export const JSON_PROVIDER_SPECS: Readonly<Record<string, SearchProviderSpec>> =
  compileBuiltinSpecs();
