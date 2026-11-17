import type { FetchProviderMeta, FetchProviderSpec } from "./fetch/types.js";
import { BUILTIN_FETCH_SPECS } from "./fetch/specs.js";
import { fetchProviderNames, findFetchMeta } from "./fetch/registry.js";
import type { SearchProviderMeta, SearchProviderSpec } from "./search/types.js";
import { findSearchMeta, searchProviderNames } from "./search/registry.js";
import { JSON_PROVIDER_SPECS } from "./search/json/specs.js";

/**
 * One lookup surface over both capability sides.
 *
 * Passed explicitly rather than kept in module state, so a test can build a catalog
 * holding a single custom provider and nothing else.
 */
export interface ProviderCatalog {
  searchMeta(name: string): SearchProviderMeta | undefined;
  searchSpec(name: string): SearchProviderSpec | undefined;
  fetchMeta(name: string): FetchProviderMeta | undefined;
  fetchSpec(name: string): FetchProviderSpec | undefined;
  searchNames(): string[];
  fetchNames(): string[];
}

export interface SearchAddition {
  meta: SearchProviderMeta;
  spec: SearchProviderSpec;
}

export interface FetchAddition {
  meta: FetchProviderMeta;
  spec: FetchProviderSpec;
}

/** Providers compiled from `customProviders` in the config file. */
export interface CatalogAdditions {
  search: ReadonlyMap<string, SearchAddition>;
  fetch: ReadonlyMap<string, FetchAddition>;
}

export const EMPTY_ADDITIONS: CatalogAdditions = {
  search: new Map(),
  fetch: new Map(),
};

export const BUILTIN_CATALOG: ProviderCatalog = {
  searchMeta: (name) => findSearchMeta(name),
  searchSpec: (name) => JSON_PROVIDER_SPECS[name],
  fetchMeta: (name) => findFetchMeta(name),
  fetchSpec: (name) => BUILTIN_FETCH_SPECS[name],
  searchNames: () => searchProviderNames(),
  fetchNames: () => fetchProviderNames(),
};

export function buildCatalog(additions: CatalogAdditions = EMPTY_ADDITIONS): ProviderCatalog {
  if (additions.search.size === 0 && additions.fetch.size === 0) return BUILTIN_CATALOG;

  return {
    searchMeta: (name) => findSearchMeta(name) ?? additions.search.get(name)?.meta,
    searchSpec: (name) => JSON_PROVIDER_SPECS[name] ?? additions.search.get(name)?.spec,
    fetchMeta: (name) => findFetchMeta(name) ?? additions.fetch.get(name)?.meta,
    fetchSpec: (name) => additions.fetch.get(name)?.spec,
    searchNames: () => [...searchProviderNames(), ...additions.search.keys()],
    fetchNames: () => [...fetchProviderNames(), ...additions.fetch.keys()],
  };
}
