import type { FetchedContent } from "../types.js";

export interface FetchRequest {
  readonly url: string;
  /** Return markup unchanged instead of extracted text. */
  readonly raw: boolean;
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
  /** Target with `{url}` substituted and percent-encoded. */
  url: (url: string) => string;
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
