import type { SearchResult } from "../types.js";

export interface SearchProvider {
  readonly name: string;
  readonly label: string;
  search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResult[]>;
}

export interface SearchProviderCredentials {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Search-side provider metadata.
 *
 * No `capabilities` field: living in this registry is what makes a provider a
 * search provider. No nested tiers either — there is exactly one tier here.
 */
export interface SearchProviderMeta {
  name: string;
  label: string;
  /** Works with no credential at all. */
  keyless?: boolean;
  /** Environment variable read before the config file, for the API key. */
  envVar?: string;
  /** Keys come from the environment only; the config file may not carry one. */
  envOnly?: boolean;
  /** Environment variable read before the config file, for the base URL. */
  baseUrlEnvVar?: string;
  defaultBaseUrl?: string;
  signupUrl?: string;
  /** Demotion bucket. Any positive integer; tiers need not be contiguous. */
  tier: number;
  /** The provider's own hard cap on result count. Internal, never a config knob. */
  maxResults?: number;
}

/** Declarative description of a plain JSON search API. */
export interface SearchProviderSpec {
  name: string;
  label: string;
  /** Missing-key error prefix; absent means the provider is keyless. */
  envVar?: string;
  url: string | ((query: string, maxResults: number, baseUrl: string | undefined) => string);
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** Header carrying the credential. */
  authHeaderName?: string;
  /**
   * Prepended verbatim to the key. When absent, `authorization` gets `Bearer ` and
   * anything else is sent bare — the convention every built-in provider follows.
   */
  authPrefix?: string;
  body?: (query: string, maxResults: number) => unknown;
  queryParams?: (query: string, maxResults: number) => Record<string, string>;
  /** Dotted path to the result array. A non-array here is a parse failure. */
  resultsPath: string;
  fields: { title?: string; url?: string; snippet?: string | string[] };
  /** Appended to an HTTP error message to name the likely cause. */
  errorHint?: string;
}
