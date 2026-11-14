import { substitute, substituteString } from "../../substitute.js";
import type { SearchProviderSpec } from "../types.js";

/**
 * A search provider written as data.
 *
 * This is the only representation: the seven built-in vendors declare one of these
 * in code, and a user declares one in `customProviders.search`. Both go through
 * `compileSearchSpec`, so there is no second way to describe a search API.
 */
export interface SearchProviderSource {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  auth?: { header: string; prefix?: string };
  body?: unknown;
  query?: Record<string, string>;
  resultsPath: string;
  fields?: { title?: string; url?: string; snippet?: string | string[] };
  errorHint?: string;
}

/** Compile a declared provider into the shape the transport uses. Pure. */
export function compileSearchSpec(
  name: string,
  label: string,
  source: SearchProviderSource,
  envVar?: string,
): SearchProviderSpec {
  const method = source.method ?? (source.body === undefined ? "GET" : "POST");

  return {
    name,
    label,
    ...(envVar === undefined ? {} : { envVar }),
    url: (query, maxResults, baseUrl) =>
      String(substituteString(source.url, { query, maxResults, baseUrl })),
    method,
    ...(source.headers === undefined ? {} : { headers: source.headers }),
    ...(source.auth === undefined
      ? {}
      : { authHeaderName: source.auth.header, authPrefix: source.auth.prefix ?? "" }),
    ...(source.body === undefined
      ? {}
      : {
          body: (query: string, maxResults: number) =>
            substitute(source.body, { query, maxResults }),
        }),
    ...(source.query === undefined
      ? {}
      : {
          queryParams: (query: string, maxResults: number) =>
            toStringRecord(substitute(source.query, { query, maxResults })),
        }),
    resultsPath: source.resultsPath,
    fields: source.fields ?? {},
    ...(source.errorHint === undefined ? {} : { errorHint: source.errorHint }),
  };
}

function toStringRecord(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (value !== null && typeof value === "object") {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      result[key] = String(inner);
    }
  }
  return result;
}
