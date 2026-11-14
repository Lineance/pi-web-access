import type { SearchResult } from "../providers/types.js";

/** Whole-result budget for one `web_search` call. */
export const MAX_SEARCH_RESULT_BYTES = 64 * 1024;
export const MAX_SEARCH_TITLE_BYTES = 512;
export const MAX_SEARCH_URL_BYTES = 4 * 1024;
export const MAX_SEARCH_SNIPPET_BYTES = 2 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface Truncated {
  text: string;
  bytes: number;
}

/**
 * Truncate to a byte budget without splitting a multi-byte character.
 *
 * `encoded.slice(0, n)` on a partially covered character decodes to U+FFFD, so
 * the cut point is walked back to the start of the character.
 */
export function truncateUtf8(value: unknown, maxBytes: number): Truncated {
  const text = String(value ?? "");
  const encoded = encoder.encode(text);
  if (encoded.byteLength <= maxBytes) return { text, bytes: encoded.byteLength };

  let end = maxBytes;
  while (end > 0 && (encoded[end] ?? 0) >> 6 === 0b10) end -= 1;
  return { text: decoder.decode(encoded.subarray(0, end)), bytes: end };
}

/**
 * Clamp result fields to their per-field caps while honouring one shared budget.
 *
 * Returns fewer results than requested when the budget runs out, which is
 * preferable to returning a truncated final entry.
 */
export function normalizeSearchResults(
  results: readonly SearchResult[],
  maxResults: number,
  totalBudget: number = MAX_SEARCH_RESULT_BYTES,
): SearchResult[] {
  const normalized: SearchResult[] = [];
  let remaining = totalBudget;

  for (const result of results.slice(0, maxResults)) {
    if (remaining <= 0) break;

    const title = truncateUtf8(result.title, Math.min(MAX_SEARCH_TITLE_BYTES, remaining));
    remaining -= title.bytes;
    const url = truncateUtf8(result.url, Math.min(MAX_SEARCH_URL_BYTES, remaining));
    remaining -= url.bytes;
    const snippet = truncateUtf8(result.snippet, Math.min(MAX_SEARCH_SNIPPET_BYTES, remaining));
    remaining -= snippet.bytes;

    normalized.push({ title: title.text, url: url.text, snippet: snippet.text });
  }

  return normalized;
}
