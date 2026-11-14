import { describe, expect, it } from "vitest";

import {
  attemptBudget,
  runChain,
  type ChainAttempt,
  type ChainOptions,
} from "../../src/orchestrator/chain.js";
import {
  ChainExhaustedError,
  WebSearchError,
  type FailureKind,
} from "../../src/orchestrator/errors.js";
import type { ChainHealth } from "../../src/orchestrator/health.js";

interface HealthLog {
  events: string[];
  health: ChainHealth;
}

function recordingHealth(): HealthLog {
  const events: string[] = [];
  return {
    events,
    health: {
      isCooled: () => false,
      recordSuccess: (capability, provider) => events.push(`ok:${capability}:${provider}`),
      recordFailure: (capability, provider, kind) =>
        events.push(`fail:${capability}:${provider}:${kind}`),
    },
  };
}

const attempt = <T>(
  provider: string,
  run: (signal: AbortSignal) => Promise<T>,
): ChainAttempt<T> => ({ provider, label: provider, run });

const resolves =
  <T>(value: T) =>
  async (): Promise<T> =>
    value;

const rejects = (error: unknown) => async (): Promise<never> => {
  throw error;
};

const baseOptions = <T>(overrides: Partial<ChainOptions<T>> = {}): ChainOptions<T> => ({
  capability: "search",
  totalMs: Number.POSITIVE_INFINITY,
  perAttemptMs: 15_000,
  isUnusable: () => false,
  ...overrides,
});

describe("attemptBudget", () => {
  it("uses the per-attempt cap when the chain has no total budget", () => {
    expect(attemptBudget(Number.POSITIVE_INFINITY, 3, { perAttemptMs: 15_000 })).toBe(15_000);
  });

  it("gives the first of three attempts 1.5x its fair share", () => {
    expect(attemptBudget(30_000, 3, { perAttemptMs: 15_000 })).toBe(15_000);
  });

  it("gives a later attempt the smaller remaining share", () => {
    expect(attemptBudget(15_000, 2, { perAttemptMs: 15_000 })).toBe(11_250);
  });

  it("never exceeds what is left", () => {
    expect(attemptBudget(3_750, 1, { perAttemptMs: 15_000 })).toBe(3_750);
  });

  it("never drops below one millisecond even when the budget is gone", () => {
    expect(attemptBudget(0, 1, { perAttemptMs: 15_000 })).toBe(1);
  });

  it("honours the floor while staying inside the remainder", () => {
    expect(attemptBudget(100, 4, { perAttemptMs: 15_000, minPerAttemptMs: 5_000 })).toBe(100);
  });
});

describe("runChain", () => {
  describe("success paths", () => {
    it("returns the first usable result", async () => {
      const outcome = await runChain(
        [attempt("a", resolves(["x"])), attempt("b", resolves(["y"]))],
        baseOptions<string[]>(),
      );

      expect(outcome.backend).toBe("a");
      expect(outcome.value).toEqual(["x"]);
      expect(outcome.attempted).toEqual(["a"]);
    });

    it("advances past a provider that throws", async () => {
      const outcome = await runChain(
        [
          attempt("a", rejects(new WebSearchError("quota", "*", "429"))),
          attempt("b", resolves(["ok"])),
        ],
        baseOptions<string[]>(),
      );

      expect(outcome.backend).toBe("b");
      expect(outcome.attempted).toEqual(["a", "b"]);
      expect(outcome.failures).toEqual([{ provider: "a", kind: "quota", message: "429" }]);
    });

    it("continues past an unusable result when attempts remain", async () => {
      const outcome = await runChain(
        [attempt("a", resolves<string[]>([])), attempt("b", resolves(["ok"]))],
        baseOptions<string[]>({ isUnusable: (value) => value.length === 0 }),
      );

      expect(outcome.backend).toBe("b");
      expect(outcome.unusable).toEqual([
        { provider: "a", kind: "empty", message: "unusable result" },
      ]);
    });

    it("returns an unusable result from the last attempt instead of throwing", async () => {
      const outcome = await runChain(
        [attempt("a", resolves<string[]>([]))],
        baseOptions<string[]>({
          isUnusable: (value) => value.length === 0,
        }),
      );

      expect(outcome.backend).toBe("a");
      expect(outcome.value).toEqual([]);
      expect(outcome.usedLastAttemptUnusable).toBe(true);
    });

    it("reports each attempt in order before running it", async () => {
      const seen: string[] = [];

      await runChain(
        [attempt("a", rejects(new Error("x"))), attempt("b", resolves("ok"))],
        baseOptions<string>({ onAttempt: (provider) => seen.push(provider) }),
      );

      expect(seen).toEqual(["a", "b"]);
    });
  });

  describe("exhaustion", () => {
    it("throws once every provider has failed, keeping each cause", async () => {
      const error = await runChain(
        [
          attempt("a", rejects(new WebSearchError("quota", "*", "429"))),
          attempt("b", rejects(new WebSearchError("auth", "*", "401"))),
        ],
        baseOptions<string[]>(),
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ChainExhaustedError);
      const exhausted = error as ChainExhaustedError;
      expect(exhausted.failures.map((failure) => failure.kind)).toEqual(["quota", "auth"]);
      expect(exhausted.message).toBe("a:quota b:auth");
    });

    it("refuses an empty chain", async () => {
      await expect(runChain([], baseOptions<string[]>())).rejects.toBeInstanceOf(
        ChainExhaustedError,
      );
    });

    it("classifies a plain thrown error as a transport failure", async () => {
      const error = await runChain(
        [attempt("a", rejects(new Error("ECONNRESET")))],
        baseOptions<string[]>(),
      ).catch((caught: unknown) => caught);

      expect((error as ChainExhaustedError).failures[0]?.kind).toBe("transport");
    });
  });

  describe("cancellation", () => {
    it("stops immediately when the caller aborts, without trying the next provider", async () => {
      const controller = new AbortController();
      const attempted: string[] = [];

      const error = await runChain(
        [
          attempt("a", async () => {
            controller.abort(new Error("user cancelled"));
            throw new Error("aborted mid-flight");
          }),
          attempt("b", async () => {
            attempted.push("b");
            return "ok";
          }),
        ],
        baseOptions<string>({ signal: controller.signal }),
      ).catch((caught: unknown) => caught);

      expect((error as Error).message).toBe("user cancelled");
      expect(attempted).toEqual([]);
    });

    it("refuses to start when the signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort(new Error("too late"));

      const error = await runChain(
        [attempt("a", resolves("ok"))],
        baseOptions<string>({
          signal: controller.signal,
        }),
      ).catch((caught: unknown) => caught);

      expect((error as Error).message).toBe("too late");
    });
  });

  describe("time budgets", () => {
    it("times out a single attempt and moves on", async () => {
      const outcome = await runChain(
        [
          attempt("slow", () => new Promise<string>(() => undefined)),
          attempt("fast", resolves("ok")),
        ],
        baseOptions<string>({ perAttemptMs: 20 }),
      );

      expect(outcome.backend).toBe("fast");
      expect(outcome.failures[0]).toMatchObject({ provider: "slow", kind: "timeout" });
    });

    it("stops when the whole-chain budget is spent", async () => {
      const error = await runChain(
        [
          attempt("slow", () => new Promise<string>(() => undefined)),
          attempt("never", resolves("ok")),
        ],
        baseOptions<string>({ totalMs: 0, perAttemptMs: 50 }),
      ).catch((caught: unknown) => caught);

      const failures = (error as ChainExhaustedError).failures;
      expect(failures[0]?.kind).toBe("timeout");
      expect(failures[1]).toMatchObject({ provider: "never", kind: "timeout" });
      expect(failures[1]?.message).toBe("chain budget exhausted");
    });
  });

  describe("health recording", () => {
    it("records a success for the provider that answered", async () => {
      const { events, health } = recordingHealth();

      await runChain([attempt("a", resolves("ok"))], baseOptions<string>({ health }));

      expect(events).toEqual(["ok:search:a"]);
    });

    it("records a failure with its classified kind", async () => {
      const { events, health } = recordingHealth();

      await runChain(
        [
          attempt("a", rejects(new WebSearchError("quota", "*", "429"))),
          attempt("b", resolves("ok")),
        ],
        baseOptions<string>({ health }),
      );

      expect(events).toEqual(["fail:search:a:quota", "ok:search:b"]);
    });

    it("does not record an empty result as a health problem", async () => {
      const { events, health } = recordingHealth();

      await runChain(
        [attempt("a", resolves<string[]>([])), attempt("b", resolves(["ok"]))],
        baseOptions<string[]>({ health, isUnusable: (value) => value.length === 0 }),
      );

      expect(events).toEqual(["ok:search:b"]);
    });

    it("uses the capability it was given", async () => {
      const { events, health } = recordingHealth();

      await runChain([attempt("local", resolves("ok"))], {
        ...baseOptions<string>({ health }),
        capability: "fetch",
      });

      expect(events).toEqual(["ok:fetch:local"]);
    });
  });

  describe("typed failure kinds", () => {
    it.each<FailureKind>(["quota", "auth", "transport", "parse", "config", "unsupported"])(
      "preserves the %s kind",
      async (kind) => {
        const error = await runChain(
          [attempt("a", rejects(new WebSearchError(kind, "*", "detail")))],
          baseOptions<string[]>(),
        ).catch((caught: unknown) => caught);

        expect((error as ChainExhaustedError).failures[0]?.kind).toBe(kind);
      },
    );
  });
});
