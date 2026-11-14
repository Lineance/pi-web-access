import type { FetchProviderMeta } from "./types.js";

/**
 * Built-in fetch providers.
 *
 * Only `local` ships: it costs nothing, needs no credential, and covers ordinary
 * pages. Remote readers are opt-in through `customProviders.fetch`.
 */
export const FETCH_PROVIDERS: readonly FetchProviderMeta[] = [
  {
    name: "local",
    label: "Local",
    keyless: true,
    tier: 1,
  },
];

export function findFetchMeta(name: string): FetchProviderMeta | undefined {
  const builtin = FETCH_PROVIDERS.find((provider) => provider.name === name);
  return builtin;
}

export function fetchProviderNames(): string[] {
  return FETCH_PROVIDERS.map((provider) => provider.name);
}
