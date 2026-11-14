import type { Capability } from "../providers/types.js";
import type { FailureKind } from "./errors.js";

/**
 * Provider health across calls within one process.
 *
 * Deliberately invisible to the model: nothing here is ever rendered into tool
 * output. It exists so a provider that is known to be out of allowance does not
 * cost a round trip on every single search.
 *
 * In-memory only. There is no persistence and no manual reset command: a process
 * restart is the reset.
 */
export interface ChainHealth {
  isCooled(capability: Capability, provider: string): boolean;
  recordSuccess(capability: Capability, provider: string): void;
  recordFailure(capability: Capability, provider: string, kind: FailureKind): void;
}

/** Used until the in-memory implementation lands; every provider looks healthy. */
export const NOOP_HEALTH: ChainHealth = {
  isCooled: () => false,
  recordSuccess: () => {
    /* no state to clear */
  },
  recordFailure: () => {
    /* no state to record */
  },
};
