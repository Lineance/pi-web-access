/**
 * Chain ordering.
 *
 * A pure function of three inputs — configured order, tier lookup, cooled set —
 * so the whole rule set is testable without constructing any state.
 *
 * Rules, in priority order:
 *
 *  1. A healthy provider never changes position. Configured order always wins;
 *     tiers only constrain how far a cooled provider may be demoted. Sorting
 *     healthy providers by tier would silently override an explicit
 *     `["exa-free", "bing", "tavily"]` preference.
 *  2. A cooled provider is demoted past the **last healthy member of its own
 *     tier**. If its tier has no healthy member left, it is demoted past the
 *     next higher tier that still has one, so a fully cold tier does not burn a
 *     round trip before reaching a healthy, cheaper tier.
 *  3. If every provider is cooled, configured order is returned unchanged. There
 *     is nothing to be gained by reordering, and a retry sweep is the honest
 *     outcome.
 */
export interface ArrangeInput {
  readonly names: readonly string[];
  readonly tierOf: (name: string) => number;
  readonly isCooled: (name: string) => boolean;
}

export function arrangeChain(input: ArrangeInput): string[] {
  const names = dedupe(input.names);
  const { tierOf, isCooled } = input;

  const healthy = names.filter((name) => !isCooled(name));
  const cooled = names.filter((name) => isCooled(name));
  if (cooled.length === 0 || healthy.length === 0) return names;

  const anchorOf = (name: string): string | undefined => {
    const tier = tierOf(name);
    const inTier = healthy.filter((candidate) => tierOf(candidate) === tier);
    const lastInTier = inTier.at(-1);
    if (lastInTier !== undefined) return lastInTier;

    const higherTiers = [...new Set(healthy.map((candidate) => tierOf(candidate)))]
      .filter((value) => value > tier)
      .sort((a, b) => a - b);
    for (const value of higherTiers) {
      const inHigher = healthy.filter((candidate) => tierOf(candidate) === value);
      const lastInHigher = inHigher.at(-1);
      if (lastInHigher !== undefined) return lastInHigher;
    }
    return undefined;
  };

  const buckets = new Map<string, string[]>();
  const trailing: string[] = [];
  for (const name of cooled) {
    const anchor = anchorOf(name);
    if (anchor === undefined) {
      trailing.push(name);
      continue;
    }
    const bucket = buckets.get(anchor);
    if (bucket) bucket.push(name);
    else buckets.set(anchor, [name]);
  }

  const result = [...healthy];
  const ordered = [...buckets.entries()].sort(
    (left, right) => healthy.indexOf(right[0]) - healthy.indexOf(left[0]),
  );
  for (const [anchor, group] of ordered) {
    const at = result.indexOf(anchor) + 1;
    result.splice(at, 0, ...group);
  }
  result.push(...trailing);
  return result;
}

function dedupe(names: readonly string[]): string[] {
  return [...new Set(names)];
}
