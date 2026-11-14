/**
 * Domain types shared by providers, chains and tools.
 *
 * Kept free of imports so every module can depend on it without cycles.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Textual body returned by a fetch provider. */
export interface TextFetchedContent {
  readonly kind: "text";
  readonly text: string;
  readonly title?: string;
  readonly contentType?: string;
  readonly contentLength?: number;
}

/**
 * Binary image returned by a fetch provider, as base64.
 *
 * pi renders these as image blocks for the model, and resizes oversized payloads
 * when they enter session history. Everything returned here is re-sent on every
 * subsequent request until compaction, so the byte cap is a hard requirement.
 */
export interface ImageFetchedContent {
  readonly kind: "image";
  readonly data: string;
  readonly mimeType: string;
  readonly byteLength: number;
}

export type FetchedContent = TextFetchedContent | ImageFetchedContent;

/** The two independent capabilities a provider may implement. */
export type Capability = "search" | "fetch";

export interface SearchProvider {
  readonly name: string;
  readonly label: string;
  search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResult[]>;
}

export interface FetchProvider {
  readonly name: string;
  readonly label: string;
  fetch(url: string, signal?: AbortSignal): Promise<FetchedContent>;
}

export interface ProviderCredentials {
  apiKey?: string;
  baseUrl?: string;
}

/** Per-capability tier. Missing means "use the registry default". */
export interface ProviderTiers {
  search?: number;
  fetch?: number;
}

export interface ProviderCapabilities {
  search: boolean;
  fetch: boolean;
}

export interface ProviderMeta {
  name: string;
  label: string;
  /** Provider works with no credential at all. */
  keyless?: boolean;
  /** Environment variable read before the config file, for the API key. */
  envVar?: string;
  /** Environment variable read before the config file, for the base URL. */
  baseUrlEnvVar?: string;
  defaultBaseUrl?: string;
  signupUrl?: string;
  capabilities: ProviderCapabilities;
  tiers: ProviderTiers;
  /**
   * The provider's own hard cap on result count. Internal data: it is applied
   * silently and is never exposed as a configuration knob.
   */
  maxResults?: number;
}
