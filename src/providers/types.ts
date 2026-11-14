/**
 * Types shared by both capabilities.
 *
 * Anything that only applies to one side lives in `search/types.ts` or
 * `fetch/types.ts`; keeping the two apart is what lets each side own its own
 * registry, factory and custom-provider schema.
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
 * pi renders these as image blocks for the model and resizes oversized payloads
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

/** The two independent capabilities, each with its own chain and orchestrator. */
export type Capability = "search" | "fetch";
