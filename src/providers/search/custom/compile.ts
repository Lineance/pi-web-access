import { Value } from "typebox/value";

import { findSearchMeta } from "../registry.js";
import type { SearchProviderMeta } from "../types.js";

import { SearchCustomSchema } from "./schema.js";
import { compileSearchSpec } from "./spec.js";

export type SearchCompileResult =
  | { ok: true; meta: SearchProviderMeta; spec: ReturnType<typeof compileSearchSpec> }
  | { ok: false; message: string };

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * Validate one search provider from configuration and compile it.
 *
 * Strict on purpose: a malformed provider would send requests to the wrong place and
 * parse the wrong field, silently, so it is rejected by name and the rest of the file
 * keeps working.
 */
export function compileSearchProvider(name: string, raw: unknown): SearchCompileResult {
  if (!NAME_PATTERN.test(name)) {
    return { ok: false, message: "name must be alphanumeric, dot, dash or underscore" };
  }
  if (findSearchMeta(name) !== undefined) {
    return { ok: false, message: `shadows the built-in search provider "${name}"` };
  }
  if (!Value.Check(SearchCustomSchema, raw)) {
    return { ok: false, message: `does not match the schema${describeFirstError(raw)}` };
  }

  const source = raw as Shape;
  if (source.body !== undefined && source.query !== undefined) {
    return {
      ok: false,
      message: "declares both body and query; use body for POST or query for GET",
    };
  }
  // Search providers authenticate through `auth` + `keyEnv`; a query-parameter
  // key would silently substitute to the empty string and surface later as an
  // inexplicable auth failure.
  if (/\{apiKey\}/.test(JSON.stringify([source.url, source.body, source.query]))) {
    return { ok: false, message: "uses {apiKey}; search keys go through auth + keyEnv" };
  }
  if (source.body !== undefined && source.method === "GET") {
    return { ok: false, message: "body requires method POST" };
  }
  if (source.query !== undefined && source.method === "POST") {
    return { ok: false, message: "query requires method GET" };
  }
  if (source.auth !== undefined && source.keyEnv === undefined) {
    return { ok: false, message: "auth requires keyEnv; keys are read from the environment only" };
  }

  const method = source.method ?? (source.body === undefined ? "GET" : "POST");
  if (method === "POST" && source.body === undefined) {
    return { ok: false, message: "a POST search requires body" };
  }

  const label = source.label ?? name;
  const meta: SearchProviderMeta = {
    name,
    label,
    keyless: source.auth === undefined,
    ...(source.keyEnv === undefined ? {} : { envVar: source.keyEnv, envOnly: true }),
    tier: source.tier ?? 1,
    ...(source.maxResults === undefined ? {} : { maxResults: source.maxResults }),
  };

  const spec = compileSearchSpec(name, label, source, source.keyEnv);
  return { ok: true, meta, spec };
}

interface Shape {
  label?: string;
  url: string;
  method?: "GET" | "POST";
  auth?: { header: string; prefix?: string };
  keyEnv?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
  resultsPath: string;
  fields?: { title?: string; url?: string; snippet?: string | string[] };
  tier?: number;
  maxResults?: number;
  errorHint?: string;
}

function describeFirstError(raw: unknown): string {
  try {
    const [first] = [...Value.Errors(SearchCustomSchema, raw)];
    if (first === undefined) return "";
    // Not every validation error carries a path (an object-level one does not).
    const located = first as { path?: string; message?: string };
    const where = located.path === undefined || located.path === "" ? "/" : located.path;
    return ` at ${where}: ${located.message ?? "invalid"}`;
  } catch {
    return "";
  }
}
