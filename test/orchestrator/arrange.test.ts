import { describe, expect, it } from "vitest";

import { arrangeChain } from "../../src/orchestrator/arrange.js";

const tiers =
  (map: Record<string, number>) =>
  (name: string): number =>
    map[name] ?? 1;

const cooled =
  (names: string[]) =>
  (name: string): boolean =>
    names.includes(name);

describe("arrangeChain", () => {
  describe("healthy order", () => {
    it("never reorders healthy providers by tier", () => {
      const order = arrangeChain({
        names: ["a", "b", "c"],
        tierOf: tiers({ a: 3, b: 1, c: 2 }),
        isCooled: cooled([]),
      });

      expect(order).toEqual(["a", "b", "c"]);
    });

    it("deduplicates while preserving the first occurrence", () => {
      const order = arrangeChain({
        names: ["a", "b", "a", "c"],
        tierOf: tiers({}),
        isCooled: cooled([]),
      });

      expect(order).toEqual(["a", "b", "c"]);
    });
  });

  describe("demotion stays inside a tier", () => {
    it("moves a cooled provider after the last healthy member of its tier", () => {
      const order = arrangeChain({
        names: ["a", "b", "c"],
        tierOf: tiers({}),
        isCooled: cooled(["b"]),
      });

      expect(order).toEqual(["a", "c", "b"]);
    });

    it("does not push a cooled tier-1 provider past a healthy tier-2", () => {
      const names = ["tavily", "exa", "firecrawl", "exa-free", "bing"];
      const order = arrangeChain({
        names,
        tierOf: tiers({ tavily: 1, exa: 1, firecrawl: 1, "exa-free": 2, bing: 2 }),
        isCooled: cooled(["tavily"]),
      });

      expect(order).toEqual(["exa", "firecrawl", "tavily", "exa-free", "bing"]);
    });

    it("keeps several cooled providers of the same tier in configured order", () => {
      const order = arrangeChain({
        names: ["a", "b", "c", "d"],
        tierOf: tiers({}),
        isCooled: cooled(["b", "c"]),
      });

      expect(order).toEqual(["a", "d", "b", "c"]);
    });
  });

  describe("fully cooled tier", () => {
    it("moves an entirely cold tier behind the next healthy tier", () => {
      const order = arrangeChain({
        names: ["tavily", "exa", "firecrawl", "exa-free", "bing"],
        tierOf: tiers({ tavily: 1, exa: 1, firecrawl: 1, "exa-free": 2, bing: 2 }),
        isCooled: cooled(["tavily", "exa", "firecrawl"]),
      });

      expect(order).toEqual(["exa-free", "bing", "tavily", "exa", "firecrawl"]);
    });

    it("leaves a fully cold tier at the end when no higher tier is healthy", () => {
      const order = arrangeChain({
        names: ["a", "b", "c"],
        tierOf: tiers({ a: 3, b: 3, c: 1 }),
        isCooled: cooled(["a", "b"]),
      });

      expect(order).toEqual(["c", "a", "b"]);
    });
  });

  describe("degenerate inputs", () => {
    it("returns configured order when everything is cooled", () => {
      const names = ["tavily", "exa", "bing"];
      const order = arrangeChain({
        names,
        tierOf: tiers({ tavily: 1, exa: 1, bing: 2 }),
        isCooled: cooled(names),
      });

      expect(order).toEqual(names);
    });

    it("still returns the single cooled provider, so the chain is never empty", () => {
      const order = arrangeChain({
        names: ["only"],
        tierOf: tiers({}),
        isCooled: cooled(["only"]),
      });

      expect(order).toEqual(["only"]);
    });

    it("handles an empty chain", () => {
      const order = arrangeChain({ names: [], tierOf: tiers({}), isCooled: cooled([]) });

      expect(order).toEqual([]);
    });
  });
});
