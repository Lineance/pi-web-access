import type { Capability } from "../providers/types.js";
import { ChainExhaustedError, toFailure, type Failure, type FailureKind } from "./errors.js";
import type { ChainHealth } from "./health.js";

export interface ChainAttempt<T> {
  readonly provider: string;
  readonly label: string;
  run(signal: AbortSignal): Promise<T>;
}

export interface ChainOptions<T> {
  readonly capability: Capability;
  /** Whole-chain budget. `Infinity` means "only per-attempt limits apply". */
  readonly totalMs: number;
  /** Ceiling for a single attempt. */
  readonly perAttemptMs: number;
  /** Floor for a single attempt, never allowed to exceed the remaining budget. */
  readonly minPerAttemptMs?: number;
  /** Whether a successful call produced something worth returning. */
  readonly isUnusable: (value: T) => boolean;
  readonly health?: ChainHealth;
  readonly signal?: AbortSignal;
  /** Reports which provider is about to be tried, for progress UI only. */
  readonly onAttempt?: (provider: string, label: string) => void;
}

export interface ChainOutcome<T> {
  readonly backend: string;
  readonly value: T;
  readonly attempted: readonly string[];
  /** Attempts that threw. */
  readonly failures: readonly Failure[];
  /** Attempts that returned an unusable result. */
  readonly unusable: readonly Failure[];
  /** True when the returned value came from an unusable final attempt. */
  readonly usedLastAttemptUnusable: boolean;
}

/**
 * Walk the attempts in the order given and return the first usable result.
 *
 * Ordering is the caller's job (`arrangeChain`); this function only runs and
 * classifies. An unusable result on the last attempt is returned rather than
 * thrown: a short page is still the page.
 */
export async function runChain<T>(
  attempts: readonly ChainAttempt<T>[],
  options: ChainOptions<T>,
): Promise<ChainOutcome<T>> {
  if (attempts.length === 0) throw new ChainExhaustedError([]);

  const finite = Number.isFinite(options.totalMs);
  const deadline = finite ? Date.now() + options.totalMs : Number.POSITIVE_INFINITY;
  const attempted: string[] = [];
  const failures: Failure[] = [];
  const unusable: Failure[] = [];

  for (const [index, attempt] of attempts.entries()) {
    const stepsLeft = attempts.length - index;
    const remaining = finite ? deadline - Date.now() : Number.POSITIVE_INFINITY;
    if (remaining <= 0 && attempted.length > 0) {
      failures.push({
        provider: attempt.provider,
        kind: "timeout",
        message: "chain budget exhausted",
      });
      break;
    }

    const budget = attemptBudget(remaining, stepsLeft, options);
    attempted.push(attempt.provider);
    options.onAttempt?.(attempt.provider, attempt.label);

    const timeoutSignal = AbortSignal.timeout(budget);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    try {
      const value = await attempt.run(signal);
      if (options.signal?.aborted) throw options.signal.reason ?? new Error("aborted");

      if (!options.isUnusable(value)) {
        options.health?.recordSuccess(options.capability, attempt.provider);
        return {
          backend: attempt.provider,
          value,
          attempted,
          failures,
          unusable,
          usedLastAttemptUnusable: false,
        };
      }

      unusable.push({ provider: attempt.provider, kind: "empty", message: "unusable result" });
      if (index === attempts.length - 1) {
        options.health?.recordSuccess(options.capability, attempt.provider);
        return {
          backend: attempt.provider,
          value,
          attempted,
          failures,
          unusable,
          usedLastAttemptUnusable: true,
        };
      }
      // Keep walking. Not recorded as a failure: an empty result is a property of
      // the query, not of the provider.
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason ?? error;

      const failure = timeoutSignal.aborted
        ? { provider: attempt.provider, kind: "timeout" as FailureKind, message: `timed out after ${budget}ms` }
        : toFailure(attempt.provider, error);

      failures.push(failure);
      options.health?.recordFailure(options.capability, attempt.provider, failure.kind);
    }
  }

  throw new ChainExhaustedError([...failures, ...unusable]);
}

/**
 * Budget for one attempt.
 *
 * With a finite total, each attempt gets 1.5x its fair share so an early attempt
 * can do real work without starving the rest; the result never exceeds what is
 * left. With an infinite total, every attempt simply gets the per-attempt cap.
 */
function attemptBudget<T>(remaining: number, stepsLeft: number, options: ChainOptions<T>): number {
  const cap = options.perAttemptMs;
  if (!Number.isFinite(remaining)) return cap;

  const allowed = Math.max(1, Math.min(cap, remaining));
  const fairShare = Math.floor((remaining / Math.max(1, stepsLeft)) * 1.5);
  const floor = Math.min(options.minPerAttemptMs ?? 1, allowed);
  return Math.max(1, Math.min(allowed, Math.max(fairShare, floor)));
}
