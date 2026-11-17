import type { FetchedContent } from "../types.js";

export interface FetchRequest {
  readonly url: string;
}

export interface FetchProvider {
  readonly name: string;
  readonly label: string;
  fetch(request: FetchRequest, signal?: AbortSignal): Promise<FetchedContent>;
}

export interface FetchProviderCredentials {
  apiKey?: string;
}

/**
 * Fetch-side provider metadata.
 *
 * No `capabilities` field: living in this registry is what makes a provider a
 * fetch provider.
 */
export interface FetchProviderMeta {
  name: string;
  label: string;
  keyless?: boolean;
  envVar?: string;
  /**
   * The key improves the provider (registered quota, higher rate limits) but its
   * absence does not disqualify it: a keyless tier serves instead. A missing key
   * is reported as keyless, never as unusable.
   */
  optionalKey?: boolean;
  envOnly?: boolean;
  signupUrl?: string;
  tier: number;
}

/**
 * Declarative description of a remote reader.
 *
 * It answers either with a JSON envelope (`{ data: { markdown: … } }`) or with the
 * text body directly, so `textPath` selects the first shape and its absence means
 * the whole body is the content.
 */
export interface FetchProviderSpec {
  name: string;
  label: string;
  /**
   * Target with placeholders substituted. `{url}` arrives percent-encoded, and
   * `{apiKey}` carries the resolved key for vendors that take it as a query
   * parameter rather than a header.
   */
  url: (url: string, apiKey: string) => string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  authHeaderName?: string;
  authPrefix?: string;
  body?: unknown;
  envVar?: string;
  textPath?: string;
  titlePath?: string;
  errorHint?: string;
}
