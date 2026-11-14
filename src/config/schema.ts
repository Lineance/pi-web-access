import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

/** Absolute ceiling for `maxResults`, regardless of configuration. */
export const MAX_RESULTS_CEILING = 20;
/** `maxResults` serves as both the default and the ceiling. */
export const MAX_RESULTS_DEFAULT = 10;

export const WebConfigSchema = Type.Object(
  {
    /** Both the default and the ceiling for `web_search` result count. */
    maxResults: Type.Optional(Type.Number()),
    providers: Type.Optional(Type.Array(Type.String())),
    fetchProviders: Type.Optional(Type.Array(Type.String())),
    apiKeys: Type.Optional(Type.Record(Type.String(), Type.String())),
    baseUrls: Type.Optional(Type.Record(Type.String(), Type.String())),
    tiers: Type.Optional(
      Type.Object({
        search: Type.Optional(Type.Record(Type.String(), Type.Number())),
        fetch: Type.Optional(Type.Record(Type.String(), Type.Number())),
      }),
    ),
    proxy: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
);

export type WebConfig = Static<typeof WebConfigSchema>;

/** Keys this version understands. Anything else is reported, never fatal. */
export const KNOWN_KEYS: ReadonlySet<string> = new Set([
  "maxResults",
  "providers",
  "fetchProviders",
  "apiKeys",
  "baseUrls",
  "tiers",
  "proxy",
]);

/**
 * Clamp the configured result count into the supported range.
 *
 * The value is both the default and the ceiling: the model may ask for fewer
 * results than this, never more.
 */
export function clampMaxResults(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return MAX_RESULTS_DEFAULT;
  return Math.min(MAX_RESULTS_CEILING, Math.max(1, Math.floor(value)));
}

export function unknownConfigKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object") return [];
  return Object.keys(raw).filter((key) => !KNOWN_KEYS.has(key));
}

export function isWebConfig(raw: unknown): raw is WebConfig {
  return Value.Check(WebConfigSchema, raw);
}
