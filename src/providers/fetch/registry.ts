import type { FetchProviderMeta } from "./types.js";

/**
 * Built-in fetch providers.
 *
 * `local` is the always-present floor: it costs nothing, needs no credential, and
 * renders HTML to GFM markdown with an in-process converter. `pandoc` upgrades
 * conversion fidelity when the machine has the binary; `raw` hands back the body
 * untouched. Both are opt-in through `fetchProviders` and fall back down the
 * chain — a missing binary or a failed conversion is an ordinary provider
 * failure, never a broken fetch.
 */
export const FETCH_PROVIDERS: readonly FetchProviderMeta[] = [
  {
    name: "local",
    label: "Local",
    keyless: true,
    tier: 1,
  },
  {
    name: "pandoc",
    label: "Pandoc (local)",
    keyless: true,
    tier: 1,
  },
  {
    name: "raw",
    label: "Raw (no conversion)",
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
