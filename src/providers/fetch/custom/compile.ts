import { Value } from "typebox/value";

import { substituteString } from "../../substitute.js";
import { findFetchMeta } from "../registry.js";
import type { FetchProviderMeta, FetchProviderSpec } from "../types.js";

import { FetchCustomSchema } from "./schema.js";

export type FetchCompileResult =
  { ok: true; meta: FetchProviderMeta; spec: FetchProviderSpec } | { ok: false; message: string };

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * Validate and compile one fetch provider from configuration.
 *
 * A malformed reader would send the page URL to the wrong host, so it is rejected
 * by name and the rest of the file keeps working.
 */
export function compileFetchProvider(name: string, raw: unknown): FetchCompileResult {
  if (!NAME_PATTERN.test(name)) {
    return { ok: false, message: "name must be alphanumeric, dot, dash or underscore" };
  }
  if (findFetchMeta(name) !== undefined) {
    return { ok: false, message: `shadows the built-in fetch provider "${name}"` };
  }
  if (!Value.Check(FetchCustomSchema, raw)) {
    return { ok: false, message: `does not match the schema${describeFirstError(raw)}` };
  }

  const source = raw as Shape;
  if (source.auth !== undefined && source.keyEnv === undefined) {
    return { ok: false, message: "auth requires keyEnv; keys are read from the environment only" };
  }
  if (source.body !== undefined && source.method === "GET") {
    return { ok: false, message: "body requires method POST" };
  }

  const label = source.label ?? name;
  const method = source.method ?? "GET";

  const meta: FetchProviderMeta = {
    name,
    label,
    keyless: source.auth === undefined,
    ...(source.keyEnv === undefined ? {} : { envVar: source.keyEnv, envOnly: true }),
    tier: source.tier ?? 1,
  };

  const spec: FetchProviderSpec = {
    name,
    label,
    url: (url, apiKey) => String(substituteString(source.url, { url, apiKey })),
    method,
    ...(source.headers === undefined ? {} : { headers: source.headers }),
    ...(source.auth === undefined
      ? {}
      : { authHeaderName: source.auth.header, authPrefix: source.auth.prefix ?? "" }),
    ...(source.body === undefined ? {} : { body: source.body }),
    ...(source.keyEnv === undefined ? {} : { envVar: source.keyEnv }),
    ...(source.fetch?.textPath === undefined ? {} : { textPath: source.fetch.textPath }),
    ...(source.fetch?.titlePath === undefined ? {} : { titlePath: source.fetch.titlePath }),
    ...(source.errorHint === undefined ? {} : { errorHint: source.errorHint }),
  };

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
  fetch?: { textPath?: string; titlePath?: string };
  tier?: number;
  errorHint?: string;
}

function describeFirstError(raw: unknown): string {
  try {
    const [first] = [...Value.Errors(FetchCustomSchema, raw)];
    if (first === undefined) return "";
    const located = first as { path?: string; message?: string };
    const where = located.path === undefined || located.path === "" ? "/" : located.path;
    return ` at ${where}: ${located.message ?? "invalid"}`;
  } catch {
    return "";
  }
}
